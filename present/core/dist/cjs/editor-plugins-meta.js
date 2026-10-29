"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EDITOR_PLUGINS_META_TAG = exports.EDITOR_PLUGINS_META_KEY = void 0;
exports.getEditorPluginsMeta = getEditorPluginsMeta;
exports.setEditorPluginsMeta = setEditorPluginsMeta;
exports.buildEditorPluginsMeta = buildEditorPluginsMeta;
exports.applyEditorPluginsMeta = applyEditorPluginsMeta;
const plugin_ids_1 = require("./plugin-ids");
exports.EDITOR_PLUGINS_META_KEY = "editorPlugins";
/** presentation tags part 中 SlimPPT 编辑插件元数据键名。 */
exports.EDITOR_PLUGINS_META_TAG = "SlimPPT.EditorPlugins.v1";
function getEditorPluginsMeta(pres) {
    const raw = pres.meta?.[exports.EDITOR_PLUGINS_META_KEY];
    if (!Array.isArray(raw))
        return undefined;
    const ids = (0, plugin_ids_1.migratePluginIds)(raw.filter((x) => typeof x === "string"), "editor");
    return ids.length ? ids : undefined;
}
function setEditorPluginsMeta(pres, ids) {
    const migrated = ids?.length ? (0, plugin_ids_1.migratePluginIds)(ids, "editor") : undefined;
    ids = migrated?.length ? migrated : undefined;
    if (!ids?.length) {
        if (!pres.meta)
            return;
        const next = { ...pres.meta };
        delete next[exports.EDITOR_PLUGINS_META_KEY];
        pres.meta = Object.keys(next).length ? next : undefined;
        return;
    }
    pres.meta = { ...pres.meta, [exports.EDITOR_PLUGINS_META_KEY]: [...ids] };
}
/** 序列化已启用的编辑插件 id 列表（经 tags 侧车 round-trip）。 */
function buildEditorPluginsMeta(pres) {
    const ids = getEditorPluginsMeta(pres);
    if (!ids?.length)
        return undefined;
    const payload = { v: 1, ids };
    return JSON.stringify(payload);
}
function applyEditorPluginsMeta(pres, raw) {
    if (!raw?.trim())
        return;
    try {
        const o = JSON.parse(raw);
        if (o.v !== 1 || !Array.isArray(o.ids))
            return;
        const ids = (0, plugin_ids_1.migratePluginIds)(o.ids.filter((x) => typeof x === "string"), "editor");
        setEditorPluginsMeta(pres, ids.length ? ids : undefined);
    }
    catch {
        // ignore malformed sidecar
    }
}
