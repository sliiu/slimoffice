import type { LanguageModel } from "ai";
import type { GuidanceInput, Outline } from "../schema.js";
import type { HostSkillStore } from "../../skills/types.js";
import { type DesignSpec } from "../design-spec.js";
import type { ModelFilePart } from "../../source-files/complete.js";
import { type ResponsesAuth } from "../../source-files/support.js";
import type { Template } from "@sliiu/present-core";
import { type GenerateOptions } from "../types.js";
import type { LlmUsage } from "../../llm/usage.js";
export declare function assignLayoutsFromContent(outline: Outline): Outline;
/**
 * 大纲级版式节奏兜底（确定性，不调 LLM）：
 * 弱模型常无视 prompt 的「不超过 2 页连续 bullets」，导致用户在大纲预览里就看到
 * 满屏 bullets。这里与 slide 阶段的 ensureSlideSpecQuality 用**同一套升级轮换**
 * （UPGRADE_FROM_BULLETS），把连续 text-heavy 的第 2 页起改写成 cards/banner/…，
 * 让大纲预览所见即所得；slide 阶段的兜底继续兜「用户手动改回去」的情况。
 * 首尾页不动（opener/closer 语义交给 ensureSlideSpecQuality）。
 */
export declare function ensureOutlineLayoutRhythm(outline: Outline, guidance: GuidanceInput): Outline;
export declare function clampOutlineSlideCount(outline: Outline, count: number | undefined): Outline;
/**
 * The outline is a short JSON (≤ 12 rows). A provider stall here used to eat the whole
 * 8-minute step budget with nothing to show; give it 3 minutes and one clean retry instead
 * (worst case 6 min, still under the default step budget).
 */
export declare const OUTLINE_TIMING: {
    readonly timeoutMs: number;
    readonly retryOnTimeout: 1;
};
export declare function callOutline(model: LanguageModel, guidance: GuidanceInput, signal: AbortSignal | undefined, systemExtra: string | undefined, host?: HostSkillStore, lockLayouts?: boolean, onUsage?: (usage: LlmUsage) => void, sources?: {
    template?: Template;
    files?: ModelFilePart[];
    responses?: ResponsesAuth;
    sample?: string;
    density?: string;
}): Promise<Outline>;
export declare function callDesignSpec(model: LanguageModel, guidance: GuidanceInput, signal: AbortSignal | undefined, host?: HostSkillStore, onUsage?: (usage: LlmUsage) => void): Promise<DesignSpec>;
/**
 * 把冻结的 DesignSpec 应用到 guidance：
 *   - auto（未显式选族）时定死 styleFamily，驱动下游 clamp / enrich / rubric；
 *   - 仅当 applyDesignSpecTheme 开启、用户未显式选主题、且 spec 选的是内置主题（非 ai）时
 *     覆盖 themeId —— 不抢用户显式选择、不落 compile 默认。
 */
export declare function applyDesignSpecToGuidance(guidance: GuidanceInput, spec: DesignSpec, opts: GenerateOptions): {
    guidance: GuidanceInput;
    themeApplied: boolean;
};
/**
 * styleFamily=auto 的小节路由兜底：用户没选族、DesignSpec 也没定族时，
 * 按 guidance 文本里的强指向 cue（"瑞士"/"发布会"/"dashboard"…）确定性推断。
 */
export declare function resolveAutoStyleFamily(g: GuidanceInput, opts: GenerateOptions): GuidanceInput;
/** 仅生成大纲（"两段式"中第一步预览）。 */
export declare function generateOutline(guidance: GuidanceInput, opts?: GenerateOptions): Promise<Outline>;
