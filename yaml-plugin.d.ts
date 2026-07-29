import type { PluginOption } from "vite";

interface YamlI18nOptions {
    inDir?: string;
    outDir?: string;
}

declare const vitePluginYamlI18n: (options?: YamlI18nOptions) => PluginOption;

export default vitePluginYamlI18n;
