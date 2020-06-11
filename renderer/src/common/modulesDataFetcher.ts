import { PageName, StaticPageContext } from '@cromwell/core';
import { importModule, importTemplateConfig, importCMSConfig } from '../../.cromwell/gen.imports';
import { getStoreItem } from "@cromwell/core";
import { checkCMSConfig } from "../helpers/checkCMSConfig";
checkCMSConfig();

/**
 * Fetches data for all modules at specified page.
 * @param pageName 
 * @param context - StaticPageContext of Page
 */
export const modulesDataFetcher = async (pageName: PageName, context: StaticPageContext): Promise<Record<string, any>> => {
    const cmsconfig = getStoreItem('cmsconfig');
    if (!cmsconfig || !cmsconfig.templateName) {
        console.log('cmsconfig', cmsconfig)
        throw new Error('modulesDataFetcher !cmsconfig.templateName');
    }
    const templateConfig = importTemplateConfig();
    if (!templateConfig) {
        throw new Error('modulesDataFetcher templateConfig was not found');
    }
    const moduleConfigs = Object.entries(templateConfig.modules);
    console.log('moduleConfigs', moduleConfigs)
    const modulesData: any = {};
    if (moduleConfigs && Array.isArray(moduleConfigs)) {
        for (const moduleConfig of moduleConfigs) {
            // console.log('moduleConfig', moduleConfig);
            const moduleName = moduleConfig[0];
            const moduleConfigObj: any = moduleConfig[1];
            // check if module can be displayed at current page
            if (moduleConfigObj.pages && Array.isArray(moduleConfigObj.pages) && moduleConfigObj.pages.includes(pageName)) {
                const moduleContext = JSON.parse(JSON.stringify(context));
                moduleContext.moduleConfig = moduleConfigObj;
                try {
                    const getStaticProps = (await importModule(moduleName) as any).getStaticProps;
                    let moduleStaticProps = {};
                    if (getStaticProps) {
                        try {
                            moduleStaticProps = await getStaticProps(moduleContext);
                        } catch (e) {
                            console.error('modulesDataFetcher1', e);
                        }
                    }
                    modulesData[moduleName] = moduleStaticProps;
                } catch (e) {
                    console.error('modulesDataFetcher2', e);
                }
            }
        }
    }
    return modulesData;
}
