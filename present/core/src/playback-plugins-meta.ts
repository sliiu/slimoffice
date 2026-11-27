import { migratePluginIds } from "./plugin-ids";
import type { Presentation } from "./slide";

export const PLAYBACK_PLUGINS_META_KEY = "playbackPlugins";

/** presentation tags part 中 Parchon 放映插件元数据键名。新文件写 Parchon，读取仍认 Pavera 与 SlimPPT 旧键。 */
export const PLAYBACK_PLUGINS_META_TAG = "Parchon.PlaybackPlugins.v1";
export const PLAYBACK_PLUGINS_META_TAG_PAVERA = "Pavera.PlaybackPlugins.v1";
export const PLAYBACK_PLUGINS_META_TAG_LEGACY = "SlimPPT.PlaybackPlugins.v1";

interface PlaybackPluginsMetaV1 {
  v: 1;
  ids: string[];
}

export function getPlaybackPluginsMeta(pres: Presentation): string[] | undefined {
  const raw = pres.meta?.[PLAYBACK_PLUGINS_META_KEY];
  if (!Array.isArray(raw)) return undefined;
  const ids = migratePluginIds(
    raw.filter((x): x is string => typeof x === "string"),
    "playback",
  );
  return ids.length ? ids : undefined;
}

export function setPlaybackPluginsMeta(pres: Presentation, ids: string[] | undefined): void {
  const migrated = ids?.length ? migratePluginIds(ids, "playback") : undefined;
  ids = migrated?.length ? migrated : undefined;
  if (!ids?.length) {
    if (!pres.meta) return;
    const next = { ...pres.meta };
    delete next[PLAYBACK_PLUGINS_META_KEY];
    pres.meta = Object.keys(next).length ? next : undefined;
    return;
  }
  pres.meta = { ...pres.meta, [PLAYBACK_PLUGINS_META_KEY]: [...ids] };
}

/** 序列化放映时启用的插件 id 列表（经 tags 侧车 round-trip）。 */
export function buildPlaybackPluginsMeta(pres: Presentation): string | undefined {
  const ids = getPlaybackPluginsMeta(pres);
  if (!ids?.length) return undefined;
  const payload: PlaybackPluginsMetaV1 = { v: 1, ids };
  return JSON.stringify(payload);
}

export function applyPlaybackPluginsMeta(pres: Presentation, raw: string | undefined): void {
  if (!raw?.trim()) return;
  try {
    const o = JSON.parse(raw) as PlaybackPluginsMetaV1;
    if (o.v !== 1 || !Array.isArray(o.ids)) return;
    const ids = migratePluginIds(
      o.ids.filter((x): x is string => typeof x === "string"),
      "playback",
    );
    setPlaybackPluginsMeta(pres, ids.length ? ids : undefined);
  } catch {
    // ignore malformed sidecar
  }
}
