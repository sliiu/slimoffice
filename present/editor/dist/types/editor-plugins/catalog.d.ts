import type { EditorPlugin } from "./types.js";
/** Catalog metadata for the editor plugin market (View tab). */
export interface EditorPluginCatalogEntry {
    id: string;
    nameKey?: string;
    /** 导入插件的显示名。官方插件走 nameKey。 */
    name?: string;
    descriptionKey?: string;
    description?: string;
    create: () => EditorPlugin;
    /** Used when `enabledEditorPlugins` is not provided on mount. */
    defaultEnabled?: boolean;
    origin?: "official" | "imported";
    /** 导入插件源码的更新时间。变化时重新 activate。 */
    sourceRevision?: number;
}
export declare const BUILTIN_EDITOR_PLUGIN_CATALOG: EditorPluginCatalogEntry[];
export declare function mergeEditorPluginCatalog(extra?: EditorPluginCatalogEntry[]): EditorPluginCatalogEntry[];
