import type { Presentation } from "./slide.js";
export declare const EDITOR_PLUGINS_META_KEY = "editorPlugins";
/** presentation tags part 中 SlimPPT 编辑插件元数据键名。 */
export declare const EDITOR_PLUGINS_META_TAG = "SlimPPT.EditorPlugins.v1";
export declare function getEditorPluginsMeta(pres: Presentation): string[] | undefined;
export declare function setEditorPluginsMeta(pres: Presentation, ids: string[] | undefined): void;
/** 序列化已启用的编辑插件 id 列表（经 tags 侧车 round-trip）。 */
export declare function buildEditorPluginsMeta(pres: Presentation): string | undefined;
export declare function applyEditorPluginsMeta(pres: Presentation, raw: string | undefined): void;
