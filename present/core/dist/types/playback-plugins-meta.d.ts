import type { Presentation } from "./slide.js";
export declare const PLAYBACK_PLUGINS_META_KEY = "playbackPlugins";
/** presentation tags part 中 Parchon 放映插件元数据键名。新文件写 Parchon，读取仍认 Pavera 与 SlimPPT 旧键。 */
export declare const PLAYBACK_PLUGINS_META_TAG = "Parchon.PlaybackPlugins.v1";
export declare const PLAYBACK_PLUGINS_META_TAG_PAVERA = "Pavera.PlaybackPlugins.v1";
export declare const PLAYBACK_PLUGINS_META_TAG_LEGACY = "SlimPPT.PlaybackPlugins.v1";
export declare function getPlaybackPluginsMeta(pres: Presentation): string[] | undefined;
export declare function setPlaybackPluginsMeta(pres: Presentation, ids: string[] | undefined): void;
/** 序列化放映时启用的插件 id 列表（经 tags 侧车 round-trip）。 */
export declare function buildPlaybackPluginsMeta(pres: Presentation): string | undefined;
export declare function applyPlaybackPluginsMeta(pres: Presentation, raw: string | undefined): void;
