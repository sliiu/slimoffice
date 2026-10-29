import type { TimeNode } from "../types.js";
import { type SubtypeKind } from "./derive.js";
import type { PresetExpandCtx, PresetTemplate } from "./types.js";
export declare function expandPresetTemplate(template: PresetTemplate, ctx: PresetExpandCtx): TimeNode;
/** 该模板能展开出的 subtype：已提取的变体 + 可按方向改写出的变体（升序）。 */
export declare function presetTemplateSubtypes(template: PresetTemplate): number[];
/** 模板 subtype 的 UI 含义（取第一个能识别方向写法的变体）。 */
export declare function presetTemplateSubtypeKind(template: PresetTemplate): SubtypeKind | undefined;
