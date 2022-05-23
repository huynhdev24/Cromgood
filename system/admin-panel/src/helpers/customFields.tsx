import { EDBEntity, getRandStr, TAdminCustomField, TBasePageEntity, TImageSettings } from '@cromwell/core';
import { SelectChangeEvent, SelectProps, TextField, TextFieldProps, Checkbox, FormControlLabel, CheckboxProps } from '@mui/material';
import React, { useEffect, useRef, useState } from 'react';
import { debounce } from 'throttle-debounce';

import { ColorPicker, ColorPickerProps } from '../components/colorPicker/ColorPicker';
import entityEditStyles from '../components/entity/entityEdit/EntityEdit.module.scss';
import { GalleryPicker, GalleryPickerProps } from '../components/galleryPicker/GalleryPicker';
import { ImagePicker, ImagePickerProps } from '../components/imagePicker/ImagePicker';
import { Select } from '../components/select/Select';
import { getEditorData, getEditorHtml, initTextEditor } from './editor/editor';
import { useForceUpdate } from './forceUpdate';

export type TRegisteredCustomField = TAdminCustomField & {
    component: React.ComponentType<{ initialValue: string | undefined; entity: TBasePageEntity }>;
    saveData: () => string | Promise<string>;
}

export type TFieldDefaultComponent = React.ComponentType<{
    initialValue: string | undefined;
    entity: TBasePageEntity;
    canValidate?: boolean;
    error?: boolean;
}>

const customFields: Record<EDBEntity | string, Record<string, TRegisteredCustomField>> = {};
const customFieldsForceUpdates: Partial<Record<EDBEntity, (() => void)>> = {};
const onFieldRegisterListeners: Record<string, ((field: TRegisteredCustomField) => any)> = {};

const fieldsCache: Record<string, {
    component: TFieldDefaultComponent;
    saveData: () => string | Promise<string>;
    value?: any;
}> = {};

export const registerCustomField = (field: TRegisteredCustomField) => {
    if (!customFields[field.entityType]) customFields[field.entityType] = {};
    customFields[field.entityType][field.key] = field;
    customFieldsForceUpdates[field.entityType]?.();
    Object.values(onFieldRegisterListeners).forEach(listener => listener(field));
}

export const unregisterCustomField = (entityType: string, key: string) => {
    if (customFields[entityType]) {
        delete customFields[entityType][key];
        customFieldsForceUpdates[entityType]?.();
    }
}

export const addOnFieldRegisterEventListener = (id: string, listener: ((field: TRegisteredCustomField) => any)) => {
    onFieldRegisterListeners[id] = listener;
}
export const removeOnFieldRegisterEventListener = (id: string) => {
    delete onFieldRegisterListeners[id];
}

export const RenderCustomFields = (props: {
    entityType: EDBEntity | string;
    entityData: TBasePageEntity;
    refetchMeta: () => Promise<Record<string, string> | undefined | null>;
}) => {
    const { entityType, entityData, refetchMeta } = props;
    const forceUpdate = useForceUpdate();
    customFieldsForceUpdates[entityType] = forceUpdate;
    const [updatedMeta, setUpdatedMeta] = useState<Record<string, string> | null>(null);

    useEffect(() => {
        // If some field registered after this page has fetched entity data, we need to
        // re-request data for this field to get its custom meta
        const onFieldRegistered = debounce(300, async () => {
            const newMeta = await refetchMeta();
            if (newMeta) setUpdatedMeta(newMeta);
        });

        addOnFieldRegisterEventListener(entityType, onFieldRegistered);

        return () => {
            removeOnFieldRegisterEventListener(entityType);
            delete customFieldsForceUpdates[entityType];
        }
    }, []);

    // Just update the values that are undefined, but leave the rest
    // for user input to be untouched
    const customMeta = Object.assign({}, updatedMeta, entityData?.customMeta);

    return <>{Object.values(customFields[entityType] ?? {})
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(field => {
            const Comp = field.component;
            return <Comp
                key={field.key}
                initialValue={customMeta?.[field.key]}
                entity={entityData}
            />
        })}</>
}

export const getCustomMetaFor = async (entityType: EDBEntity | string): Promise<Record<string, string>> => {
    return Object.assign({}, ...(await Promise.all(Object.values(customFields[entityType] ?? {})
        .map(async field => {
            return {
                [field.key]: await field.saveData(),
            }
        }))));
}

export const getCustomMetaKeysFor = (entityType: EDBEntity | string): string[] => {
    return Object.values(customFields[entityType] ?? {}).map(field => field.key);
}

export const getCustomFieldsFor = (entityType: EDBEntity | string): TRegisteredCustomField[] => {
    return Object.values(customFields[entityType] ?? {});
}

const useInitialValue = (initialValue: string): [string, React.Dispatch<React.SetStateAction<string>>] => {
    const [value, setValue] = useState(initialValue);
    const initialValueRef = useRef(initialValue);
    if (initialValue !== initialValueRef.current) {
        initialValueRef.current = initialValue;
        setValue(initialValue);
    }
    return [value, setValue];
}


export const getCustomField = (settings: {
    id: string;
    key?: string;
    label?: string;
    component: React.ComponentType<{
        value: any;
        onChange: (value: any) => void;
        cnaValidate?: boolean;
    }>;
    saveData?: () => any | Promise<any>;
}) => {
    const { id, component: Component, saveData } = settings;
    if (fieldsCache[id]) return fieldsCache[id];

    fieldsCache[id] = {
        component: !Component ? undefined : (props) => {
            const [value, setValue] = useInitialValue(props.initialValue);
            fieldsCache[id].value = value;

            return <Component
                value={value}
                onChange={value => setValue(value)}
            />
        },
        saveData: saveData ?? (() => (!fieldsCache[id].value) ? null : fieldsCache[id].value),
    };
    return fieldsCache[id];
}

export const getSimpleTextField = (settings: {
    id: string;
    key?: string;
    label?: string;
    props?: TextFieldProps;
}) => {
    const { id } = settings;
    if (fieldsCache[id]) return fieldsCache[id];

    fieldsCache[id] = {
        component: (props) => {
            const [value, setValue] = useInitialValue(props.initialValue);
            fieldsCache[id].value = value;

            return <TextField
                value={value ?? ''}
                onChange={e => {
                    setValue(e.target.value);
                }}
                label={settings.label ?? settings.key}
                fullWidth
                variant="standard"
                style={{ marginBottom: '15px' }}
                error={props.error && props.canValidate}
                {...(settings.props ?? {})}
            />
        },
        saveData: () => (!fieldsCache[id].value) ? null : fieldsCache[id].value,
    };
    return fieldsCache[id];
}


export const registerSimpleTextCustomField = (settings: {
    entityType: EDBEntity | string;
    key: string;
    label?: string;
    props?: TextFieldProps;
}) => {
    const id = getRandStr(12);
    const field = getSimpleTextField({ id, ...settings });

    registerCustomField({
        id: getRandStr(10),
        fieldType: 'Simple text',
        ...settings,
        component: field.component,
        saveData: field.saveData,
    });
}


export const getTextEditorField = (settings: {
    id: string;
    label?: string;
    props?: TextFieldProps;
}) => {
    const { id } = settings;
    if (fieldsCache[id]) return fieldsCache[id];
    const editorId = 'editor_' + id;

    fieldsCache[id] = {
        component: (props) => {
            const initialValueRef = useRef<null | string>(null);

            const initEditor = async () => {
                let data: {
                    html: string;
                    json: string;
                } | undefined = undefined;

                if (initialValueRef.current) {
                    try {
                        data = JSON.parse(initialValueRef.current);
                    } catch (error) {
                        console.error(error);
                    }
                }

                await initTextEditor({
                    htmlId: editorId,
                    data: data?.json,
                    placeholder: settings.label,
                });
            }

            useEffect(() => {
                if (props.initialValue !== initialValueRef.current) {
                    initialValueRef.current = props.initialValue;
                    initEditor();
                }
            });

            return (
                <div style={{ margin: '15px 0' }}
                    className={entityEditStyles.descriptionEditor}>
                    <div style={{ height: '350px' }} id={editorId}></div>
                </div>
            )
        },
        saveData: async () => {
            const json = await getEditorData(editorId);
            if (!json?.blocks?.length) return null;
            const html = await getEditorHtml(editorId);
            return JSON.stringify({
                html,
                json,
            });
        },
    };
    return fieldsCache[id];
}

export const registerTextEditorCustomField = (settings: {
    entityType: EDBEntity | string;
    key: string;
    label?: string;
    props?: TextFieldProps;
}) => {
    const id = getRandStr(12);
    const field = getTextEditorField({ id, ...settings });

    registerCustomField({
        id: getRandStr(10),
        fieldType: 'Text editor',
        ...settings,
        component: field.component,
        saveData: field.saveData,
    });
}


export const getSelectField = (settings: {
    id: string;
    label?: string;
    props?: SelectProps<string>;
    options?: string[];
}) => {
    const { id } = settings;
    if (fieldsCache[id]) return fieldsCache[id];

    fieldsCache[id] = {
        component: (props) => {
            const [value, setValue] = useInitialValue(props.initialValue);
            fieldsCache[id].value = value;

            return (
                <Select
                    style={{ margin: '15px 0' }}
                    label={settings.label}
                    value={value}
                    onChange={(event: SelectChangeEvent<string>) => {
                        setValue(event.target.value);
                    }}
                    size="small"
                    variant="standard"
                    fullWidth
                    options={settings.options?.map(opt => ({ label: opt, value: opt }))}
                    {...(settings.props ?? {})}
                />
            )
        },
        saveData: () => (!fieldsCache[id].value) ? null : fieldsCache[id].value,
    };
    return fieldsCache[id];
}

export const registerSelectCustomField = (settings: {
    entityType: EDBEntity | string;
    key: string;
    label?: string;
    options?: string[];
    props?: SelectProps<string>;
}) => {
    const id = getRandStr(12);
    const field = getSelectField({ id, ...settings });

    registerCustomField({
        id: getRandStr(10),
        fieldType: 'Select',
        ...settings,
        component: field.component,
        saveData: field.saveData,
    });
}


export const getImageField = (settings: {
    id: string;
    label?: string;
    props?: ImagePickerProps;
}) => {
    const { id } = settings;
    if (fieldsCache[id]) return fieldsCache[id];

    fieldsCache[id] = {
        component: (props) => {
            const [value, setValue] = useInitialValue(props.initialValue);
            fieldsCache[id].value = value;

            return (
                <ImagePicker
                    value={value}
                    onChange={(value) => {
                        setValue(value);
                    }}
                    showRemove
                    label={settings.label}
                    style={{ margin: '15px 0' }}
                    variant="standard"
                    {...(settings.props ?? {})}
                />
            )
        },
        saveData: () => (!fieldsCache[id].value) ? null : fieldsCache[id].value,
    };
    return fieldsCache[id];
}

export const registerImageCustomField = (settings: {
    entityType: EDBEntity | string;
    key: string;
    label?: string;
    props?: ImagePickerProps;
}) => {
    const id = getRandStr(12);
    const field = getImageField({ id, ...settings });

    registerCustomField({
        id: getRandStr(10),
        fieldType: 'Image',
        ...settings,
        component: field.component,
        saveData: field.saveData,
    });
}


export const getGalleryField = (settings: {
    id: string;
    label?: string;
    props?: GalleryPickerProps;
}) => {
    const { id } = settings;
    if (fieldsCache[id]) return fieldsCache[id];

    fieldsCache[id] = {
        component: (props) => {
            const [value, setValue] = useInitialValue(props.initialValue);
            fieldsCache[id].value = value;

            return (
                <GalleryPicker
                    images={value?.split(',').map(src => ({ src })) ?? []}
                    onChange={(value: TImageSettings[]) => {
                        const valStr = value.map(val => val.src).join(',');
                        setValue(valStr);
                    }}
                    label={settings.label}
                    style={{ margin: '15px 0', border: '1px solid #ccc', borderRadius: '6px', padding: '10px' }}
                    {...(settings.props ?? {})}
                />
            )
        },
        saveData: () => (!fieldsCache[id].value) ? null : fieldsCache[id].value,
    };
    return fieldsCache[id];
}

export const registerGalleryCustomField = (settings: {
    entityType: EDBEntity | string;
    key: string;
    label?: string;
    props?: GalleryPickerProps;
}) => {
    const id = getRandStr(12);
    const field = getGalleryField({ id, ...settings });

    registerCustomField({
        id: getRandStr(10),
        fieldType: 'Gallery',
        ...settings,
        component: field.component,
        saveData: field.saveData,
    });
}

export const getColorField = (settings: {
    id: string;
    label?: string;
    props?: ColorPickerProps;
}) => {
    const { id, label } = settings;
    if (fieldsCache[id]) return fieldsCache[id];

    fieldsCache[id] = {
        component: (props) => {
            const [value, setValue] = useInitialValue(props.initialValue);
            fieldsCache[id].value = value;

            return (
                <ColorPicker
                    value={value}
                    label={label}
                    onChange={(value) => {
                        setValue(value);
                    }}
                    style={{ margin: '15px 0' }}
                    {...(settings.props ?? {})}
                />
            )
        },
        saveData: () => (!fieldsCache[id].value) ? null : fieldsCache[id].value,
    };
    return fieldsCache[id];
}

export const registerColorCustomField = (settings: {
    entityType: EDBEntity | string;
    key: string;
    label?: string;
    props?: ColorPickerProps;
}) => {
    const id = getRandStr(12);
    const field = getColorField({ id, ...settings });

    registerCustomField({
        id,
        fieldType: 'Color',
        ...settings,
        component: field.component,
        saveData: field.saveData,
    });
}


export const getCheckboxField = (settings: {
    id: string;
    label?: string;
    props?: CheckboxProps;
}) => {
    const { id, label } = settings;
    if (fieldsCache[id]) return fieldsCache[id];

    fieldsCache[id] = {
        component: (props) => {
            const [value, setValue] = useInitialValue(props.initialValue);
            fieldsCache[id].value = value;

            return (
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={!!value}
                            onChange={(event, value) => {
                                setValue(value as any);
                            }}
                            color="primary"
                            {...(settings.props ?? {})}
                        />
                    }
                    label={label}
                />
            )
        },
        saveData: () => (!fieldsCache[id].value) ? null : fieldsCache[id].value,
    };
    return fieldsCache[id];
}

export const registerCheckboxCustomField = (settings: {
    entityType: EDBEntity | string;
    key: string;
    label?: string;
    props?: CheckboxProps;
}) => {
    const id = getRandStr(12);
    const field = getCheckboxField({ id, ...settings });

    registerCustomField({
        id,
        fieldType: 'Color',
        ...settings,
        component: field.component,
        saveData: field.saveData,
    });
}



export const registerCustomFieldOfType = (field: TAdminCustomField) => {
    if (field.fieldType === 'Simple text') {
        registerSimpleTextCustomField(field);
    }
    if (field.fieldType === 'Text editor') {
        registerTextEditorCustomField(field);
    }
    if (field.fieldType === 'Select') {
        registerSelectCustomField(field);
    }
    if (field.fieldType === 'Image') {
        registerImageCustomField(field);
    }
    if (field.fieldType === 'Gallery') {
        registerGalleryCustomField(field);
    }
    if (field.fieldType === 'Color') {
        registerColorCustomField(field);
    }
}