import type { Presentation } from "./slide";
export declare const EDITOR_PLUGINS_META_KEY = "editorPlugins";
/** presentation tags part 中 Pavera 编辑插件元数据键名。新文件写 Pavera，读取仍认 2026-11-27 之前写入的 SlimPPT 键。 */
export declare const EDITOR_PLUGINS_META_TAG = "Pavera.EditorPlugins.v1";
export declare const EDITOR_PLUGINS_META_TAG_LEGACY = "SlimPPT.EditorPlugins.v1";
export declare function getEditorPluginsMeta(pres: Presentation): string[] | undefined;
export declare function setEditorPluginsMeta(pres: Presentation, ids: string[] | undefined): void;
/** 序列化已启用的编辑插件 id 列表（经 tags 侧车 round-trip）。 */
export declare function buildEditorPluginsMeta(pres: Presentation): string | undefined;
export declare function applyEditorPluginsMeta(pres: Presentation, raw: string | undefined): void;
