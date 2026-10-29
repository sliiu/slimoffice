import type { LanguageModel } from "ai";
import type { Presentation } from "@sliiu/present-core";
import type { GuidanceInput, Outline, SlideSpecZ } from "../schema.js";
import type { HostSkillStore } from "../../skills/types.js";
import type { ReviewResult } from "../qa/art-director.js";
import { type CompileOptions } from "../compile/compile.js";
/**
 * 组装艺术总监验收 rubric：把"当前启用 skill 的 checklist 小节"与"code 侧硬约束
 * （版式锁定 / 全屏底图 / WCAG 对比度阈值）"合成一段显式检查项文本。
 * 让二次评审对齐同一套 skill 规则打分，而非通用泛化 prompt。
 */
export declare function buildArtDirectorRubric(guidance: GuidanceInput, host?: HostSkillStore): string;
/**
 * 根据 art-director findings 选出最多 3 页，换 layoutHint 后重生成并写回 presentation。
 */
export declare function retryWeakSlides(args: {
    report: ReviewResult;
    specs: SlideSpecZ[];
    outline: Outline;
    guidance: GuidanceInput;
    model: LanguageModel;
    systemExtra: string | undefined;
    signal: AbortSignal | undefined;
    host?: HostSkillStore | undefined;
    pres: Presentation;
    compileOpts: CompileOptions;
    debug?: boolean | undefined;
    /** 配图不可用时忽略 imagery 类 finding，避免无图空转重生成。 */
    imageryUnavailable?: boolean | undefined;
}): Promise<number>;
