import { migratePluginIds } from "./plugin-ids.js";
export const EDITOR_PLUGINS_META_KEY = "editorPlugins";
/** presentation tags part 中 SlimPPT 编辑插件元数据键名。 */
export const EDITOR_PLUGINS_META_TAG = "SlimPPT.EditorPlugins.v1";
export function getEditorPluginsMeta(pres) {
    const raw = pres.meta?.[EDITOR_PLUGINS_META_KEY];
    if (!Array.isArray(raw))
        return undefined;
    const ids = migratePluginIds(raw.filter((x) => typeof x === "string"), "editor");
    return ids.length ? ids : undefined;
}
export function setEditorPluginsMeta(pres, ids) {
    const migrated = ids?.length ? migratePluginIds(ids, "editor") : undefined;
    ids = migrated?.length ? migrated : undefined;
    if (!ids?.length) {
        if (!pres.meta)
            return;
        const next = { ...pres.meta };
        delete next[EDITOR_PLUGINS_META_KEY];
        pres.meta = Object.keys(next).length ? next : undefined;
        return;
    }
    pres.meta = { ...pres.meta, [EDITOR_PLUGINS_META_KEY]: [...ids] };
}
/** 序列化已启用的编辑插件 id 列表（经 tags 侧车 round-trip）。 */
export function buildEditorPluginsMeta(pres) {
    const ids = getEditorPluginsMeta(pres);
    if (!ids?.length)
        return undefined;
    const payload = { v: 1, ids };
    return JSON.stringify(payload);
}
export function applyEditorPluginsMeta(pres, raw) {
    if (!raw?.trim())
        return;
    try {
        const o = JSON.parse(raw);
        if (o.v !== 1 || !Array.isArray(o.ids))
            return;
        const ids = migratePluginIds(o.ids.filter((x) => typeof x === "string"), "editor");
        setEditorPluginsMeta(pres, ids.length ? ids : undefined);
    }
    catch {
        // ignore malformed sidecar
    }
}
