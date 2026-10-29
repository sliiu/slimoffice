export declare const IMPORTED_PLUGIN_SOURCE_MAX_CHARS: number;
export type ImportedPluginKind = "editor" | "playback";
export interface LoadedPluginSource {
    kind: ImportedPluginKind;
    id: string;
    name: string;
    description: string;
    plugin: {
        id: string;
        name?: string;
        description?: string;
        version?: string;
        activate: (ctx: object) => unknown;
        deactivate?: () => void;
    };
}
export declare class PluginSourceError extends Error {
    readonly code: "empty" | "too_large" | "define" | "id" | "activate";
    constructor(code: "empty" | "too_large" | "define" | "id" | "activate");
}
/**
 * 执行插件文件。文件必须调用且只调用一次 `defineEditorPlugin` 或 `definePlaybackPlugin`。
 * 编辑器 CSP 需要 `unsafe-eval`（`new Function`）。HTTP 头和 `<meta>` 都要写上，浏览器取交集。导出 HTML 不走这里，源码直接写进 script。
 */
export declare function loadPluginSource(source: string): LoadedPluginSource;
