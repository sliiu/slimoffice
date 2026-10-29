"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAYBACK_PLUGINS_META_TAG = exports.PLAYBACK_PLUGINS_META_KEY = void 0;
exports.getPlaybackPluginsMeta = getPlaybackPluginsMeta;
exports.setPlaybackPluginsMeta = setPlaybackPluginsMeta;
exports.buildPlaybackPluginsMeta = buildPlaybackPluginsMeta;
exports.applyPlaybackPluginsMeta = applyPlaybackPluginsMeta;
const plugin_ids_1 = require("./plugin-ids");
exports.PLAYBACK_PLUGINS_META_KEY = "playbackPlugins";
/** presentation tags part 中 SlimPPT 放映插件元数据键名。 */
exports.PLAYBACK_PLUGINS_META_TAG = "SlimPPT.PlaybackPlugins.v1";
function getPlaybackPluginsMeta(pres) {
    const raw = pres.meta?.[exports.PLAYBACK_PLUGINS_META_KEY];
    if (!Array.isArray(raw))
        return undefined;
    const ids = (0, plugin_ids_1.migratePluginIds)(raw.filter((x) => typeof x === "string"), "playback");
    return ids.length ? ids : undefined;
}
function setPlaybackPluginsMeta(pres, ids) {
    const migrated = ids?.length ? (0, plugin_ids_1.migratePluginIds)(ids, "playback") : undefined;
    ids = migrated?.length ? migrated : undefined;
    if (!ids?.length) {
        if (!pres.meta)
            return;
        const next = { ...pres.meta };
        delete next[exports.PLAYBACK_PLUGINS_META_KEY];
        pres.meta = Object.keys(next).length ? next : undefined;
        return;
    }
    pres.meta = { ...pres.meta, [exports.PLAYBACK_PLUGINS_META_KEY]: [...ids] };
}
/** 序列化放映时启用的插件 id 列表（经 tags 侧车 round-trip）。 */
function buildPlaybackPluginsMeta(pres) {
    const ids = getPlaybackPluginsMeta(pres);
    if (!ids?.length)
        return undefined;
    const payload = { v: 1, ids };
    return JSON.stringify(payload);
}
function applyPlaybackPluginsMeta(pres, raw) {
    if (!raw?.trim())
        return;
    try {
        const o = JSON.parse(raw);
        if (o.v !== 1 || !Array.isArray(o.ids))
            return;
        const ids = (0, plugin_ids_1.migratePluginIds)(o.ids.filter((x) => typeof x === "string"), "playback");
        setPlaybackPluginsMeta(pres, ids.length ? ids : undefined);
    }
    catch {
        // ignore malformed sidecar
    }
}
