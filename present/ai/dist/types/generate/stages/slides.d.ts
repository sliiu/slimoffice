import type { LanguageModel } from "ai";
import type { Presentation } from "@sliiu/present-core";
import type { GuidanceInput, Outline, SlideSpecZ } from "../schema.js";
import type { HostSkillStore } from "../../skills/types.js";
import { type CompileOptions } from "../compile/compile.js";
import type { PipelineEvent } from "../types.js";
export declare function callSlide(model: LanguageModel, args: {
    outline: Outline;
    index: number;
    guidance: GuidanceInput;
    systemExtra: string | undefined;
    signal: AbortSignal | undefined;
    host?: HostSkillStore | undefined;
}): Promise<SlideSpecZ>;
/** 常规路径：并发逐页生成 SlideSpec；失败页回退 outlineToFallbackSpec。 */
export declare function generateSlideSpecs(args: {
    model: LanguageModel;
    outline: Outline;
    guidance: GuidanceInput;
    systemExtra: string | undefined;
    signal: AbortSignal | undefined;
    host?: HostSkillStore | undefined;
    onProgress?: ((p: PipelineEvent) => void) | undefined;
    debug?: boolean | undefined;
    concurrency?: number | undefined;
}): Promise<SlideSpecZ[]>;
/**
 * 参考模板填槽路径：映射大纲 → clone 参考页 → LLM 填 shapeId → 组装 Presentation。
 * 无槽位 / 映射失败的页回退到 layout compile，再拼进同一 deck。
 */
export declare function generateViaReferenceSlots(args: {
    outline: Outline;
    guidance: GuidanceInput;
    reference: Presentation;
    model: LanguageModel;
    systemExtra: string | undefined;
    signal: AbortSignal | undefined;
    host?: HostSkillStore | undefined;
    lengthFactor: number;
    compileOpts: CompileOptions;
    debug?: boolean | undefined;
    onProgress?: ((p: PipelineEvent) => void) | undefined;
    concurrency?: number | undefined;
}): Promise<{
    pres: Presentation;
    specs: SlideSpecZ[];
    filled: number;
    fallback: number;
    /** true = 该页来自参考填槽（保留原图，enrich 应跳过）。 */
    slotFilledMask: boolean[];
}>;
