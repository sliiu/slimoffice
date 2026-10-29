import { type LanguageModel } from "ai";
import { z } from "zod";
import type { Presentation } from "@sliiu/present-core";
import { type LlmUsage } from "../../llm/usage.js";
export declare const ArtDirectorFindingSchema: z.ZodObject<{
    slideIdx: z.ZodNumber;
    severity: z.ZodEnum<{
        high: "high";
        low: "low";
        medium: "medium";
    }>;
    category: z.ZodEnum<{
        color: "color";
        consistency: "consistency";
        density: "density";
        hierarchy: "hierarchy";
        imagery: "imagery";
        other: "other";
        typography: "typography";
        whitespace: "whitespace";
    }>;
    issue: z.ZodString;
    suggestion: z.ZodString;
}, z.core.$strip>;
export type ArtDirectorFinding = z.infer<typeof ArtDirectorFindingSchema>;
/** 受限的安全自动修复：只 recolorText（applier 会再校验对比度）。 */
export declare const ArtDirectorEditSchema: z.ZodObject<{
    op: z.ZodLiteral<"recolorText">;
    slideIdx: z.ZodNumber;
    shapeId: z.ZodString;
    color: z.ZodString;
    why: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ArtDirectorEdit = z.infer<typeof ArtDirectorEditSchema>;
export declare const ArtDirectorReportSchema: z.ZodObject<{
    overall: z.ZodString;
    score: z.ZodNumber;
    findings: z.ZodArray<z.ZodObject<{
        slideIdx: z.ZodNumber;
        severity: z.ZodEnum<{
            high: "high";
            low: "low";
            medium: "medium";
        }>;
        category: z.ZodEnum<{
            color: "color";
            consistency: "consistency";
            density: "density";
            hierarchy: "hierarchy";
            imagery: "imagery";
            other: "other";
            typography: "typography";
            whitespace: "whitespace";
        }>;
        issue: z.ZodString;
        suggestion: z.ZodString;
    }, z.core.$strip>>;
    edits: z.ZodOptional<z.ZodArray<z.ZodObject<{
        op: z.ZodLiteral<"recolorText">;
        slideIdx: z.ZodNumber;
        shapeId: z.ZodString;
        color: z.ZodString;
        why: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type ArtDirectorReport = z.infer<typeof ArtDirectorReportSchema>;
export interface ReviewResult extends ArtDirectorReport {
    /** 实际应用的安全修复数。 */
    applied: number;
    /** 被 applier 拒绝（对比度不达标 / shape 不存在 / 底色未知）的修复数。 */
    skipped: number;
}
export declare function summarizeDeck(pres: Presentation): unknown;
/**
 * 应用一批 recolorText 修复。每条都做门槛校验，任一不满足即跳过：
 *   - shape 存在且为 text；
 *   - 目标 slide 底色可判定（solid/gradient）——图片/none 底色不确定，宁可不改；
 *   - 新颜色相对底色对比度达标（title/大字 ≥3.0，正文 ≥4.5）——绝不改出更差的可读性。
 */
export declare function applyArtDirectorEdits(pres: Presentation, edits: readonly ArtDirectorEdit[]): {
    applied: number;
    skipped: number;
};
/** Resolve the language art-director prose should use (overall / issue / suggestion / why). */
export declare function resolveReviewLanguage(args: {
    language?: string;
    pres?: Presentation;
    uiLocale?: string;
}): string;
export interface ReviewOptions {
    model: LanguageModel;
    signal?: AbortSignal;
    /** Prose language for overall / findings / edit why. Defaults from uiLocale or deck text. */
    language?: string;
    /** UI locale fallback when language is omitted (e.g. editor getLocale()). */
    uiLocale?: string;
    topic?: string;
    styleFamily?: string;
    /**
     * 本轮配图不可用（额度熔断 / 未配置图源且 AI 失败）。
     * 为 true 时：不要因缺照片扣分，也不要建议加图；改评渐变 / 装饰 / 排版。
     */
    imageryUnavailable?: boolean;
    /**
     * 验收 rubric（roadmap L4）：当前启用 skill 的 checklist + code 侧硬约束，渲染成一段
     * 显式检查项文本。传入时艺术总监按"这套 skill 自己的验收标准"打分，而非通用 prompt。
     */
    rubric?: string;
    /** 是否应用安全自动修复（recolorText）。默认 true。false = 纯 advisory。 */
    applyEdits?: boolean;
    screenshots?: Array<{
        slideIdx: number;
        dataUrl: string;
    }>;
    onUsage?: (usage: LlmUsage) => void;
}
/**
 * 对已生成的 Presentation 跑一次艺术总监评审。默认会应用安全的 recolorText 修复（原地 mutate pres）。
 * 失败时抛错 —— 调用方（generateFromOutline）用 try/catch 兜住，保证非阻断。
 */
export declare function reviewPresentation(pres: Presentation, opts: ReviewOptions): Promise<ReviewResult>;
