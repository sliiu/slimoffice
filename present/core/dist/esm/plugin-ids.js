/** 官方插件 id 前缀。导入插件不能使用这个前缀，也不能使用旧的 `builtin:`。 */
export const OFFICIAL_PLUGIN_PREFIX = "official:";
export const OFFICIAL_EDITOR_PLUGIN_IDS = {
    slideStats: "official:slide-stats",
    speakerNotes: "official:speaker-notes",
};
export const OFFICIAL_PLAYBACK_PLUGIN_IDS = {
    whiteboard: "official:whiteboard",
    laserPointer: "official:laser-pointer",
    outline: "official:outline",
    notesPanel: "official:notes-panel",
    thumbnailBar: "official:thumbnail-bar",
    screenshot: "official:screenshot",
    passpad: "official:passpad",
};
/** 代码里仍在，编辑器列表不显示。 */
export const HIDDEN_OFFICIAL_PLAYBACK_PLUGIN_IDS = new Set([
    OFFICIAL_PLAYBACK_PLUGIN_IDS.passpad,
]);
const LEGACY_EDITOR_PLUGIN_IDS = {
    "slide-stats": OFFICIAL_EDITOR_PLUGIN_IDS.slideStats,
    "speaker-notes": OFFICIAL_EDITOR_PLUGIN_IDS.speakerNotes,
};
const LEGACY_PLAYBACK_PLUGIN_IDS = {
    "builtin:whiteboard": OFFICIAL_PLAYBACK_PLUGIN_IDS.whiteboard,
    "builtin:laser-pointer": OFFICIAL_PLAYBACK_PLUGIN_IDS.laserPointer,
    "builtin:outline": OFFICIAL_PLAYBACK_PLUGIN_IDS.outline,
    "builtin:notes-panel": OFFICIAL_PLAYBACK_PLUGIN_IDS.notesPanel,
    "builtin:thumbnail-bar": OFFICIAL_PLAYBACK_PLUGIN_IDS.thumbnailBar,
    "builtin:screenshot": OFFICIAL_PLAYBACK_PLUGIN_IDS.screenshot,
    "builtin:passpad": OFFICIAL_PLAYBACK_PLUGIN_IDS.passpad,
};
export function isOfficialPluginId(id) {
    return id.startsWith(OFFICIAL_PLUGIN_PREFIX);
}
/** 导入插件 id：字母开头，随后只允许字母、数字、`.`、`_`、`-`。不含冒号。 */
export function isImportablePluginId(id) {
    return /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(id);
}
export function migrateEditorPluginId(id) {
    return LEGACY_EDITOR_PLUGIN_IDS[id] ?? id;
}
export function migratePlaybackPluginId(id) {
    return LEGACY_PLAYBACK_PLUGIN_IDS[id] ?? id;
}
export function migratePluginIds(ids, kind) {
    const migrate = kind === "editor" ? migrateEditorPluginId : migratePlaybackPluginId;
    const hidden = kind === "playback" ? HIDDEN_OFFICIAL_PLAYBACK_PLUGIN_IDS : null;
    const out = [];
    const seen = new Set();
    for (const raw of ids) {
        if (typeof raw !== "string" || !raw)
            continue;
        const id = migrate(raw);
        if (hidden?.has(id) || seen.has(id))
            continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}
/**
 * 把导入的放映插件源码包进导出 HTML 的 inline script。
 * `definePlaybackPlugin` 在这个函数作用域里，不走 eval。
 */
export function wrapImportedPlaybackSources(sources) {
    const chunks = sources.map((s) => s.source).join("\n");
    return `(function(){try{var definePlaybackPlugin=function(p){if(typeof PPTPlayer!=="undefined"&&PPTPlayer.definePlugin)PPTPlayer.definePlugin(p);};var defineEditorPlugin=function(){};\n${chunks}\n}catch(e){console.error("[ppt] imported plugin failed",e);}})();`;
}
