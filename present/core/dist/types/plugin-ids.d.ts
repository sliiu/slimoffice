/** 官方插件 id 前缀。导入插件不能使用这个前缀，也不能使用旧的 `builtin:`。 */
export declare const OFFICIAL_PLUGIN_PREFIX = "official:";
export declare const OFFICIAL_EDITOR_PLUGIN_IDS: {
    readonly slideStats: "official:slide-stats";
    readonly speakerNotes: "official:speaker-notes";
};
export declare const OFFICIAL_PLAYBACK_PLUGIN_IDS: {
    readonly whiteboard: "official:whiteboard";
    readonly laserPointer: "official:laser-pointer";
    readonly outline: "official:outline";
    readonly notesPanel: "official:notes-panel";
    readonly thumbnailBar: "official:thumbnail-bar";
    readonly screenshot: "official:screenshot";
    readonly passpad: "official:passpad";
};
/** 代码里仍在，编辑器列表不显示。 */
export declare const HIDDEN_OFFICIAL_PLAYBACK_PLUGIN_IDS: Set<string>;
export declare function isOfficialPluginId(id: string): boolean;
/** 导入插件 id：字母开头，随后只允许字母、数字、`.`、`_`、`-`。不含冒号。 */
export declare function isImportablePluginId(id: string): boolean;
export declare function migrateEditorPluginId(id: string): string;
export declare function migratePlaybackPluginId(id: string): string;
export declare function migratePluginIds(ids: readonly string[], kind: "editor" | "playback"): string[];
/**
 * 把导入的放映插件源码包进导出 HTML 的 inline script。
 * `definePlaybackPlugin` 在这个函数作用域里，不走 eval。
 */
export declare function wrapImportedPlaybackSources(sources: readonly {
    source: string;
}[]): string;
