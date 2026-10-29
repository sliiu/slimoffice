import type { LanguageModel } from "ai";
import type { PaintedSlide } from "../deckgen/apply-theme.js";
import type { LlmUsage } from "../llm/usage.js";
export declare function isCopyVoiceIssue(issue: string): boolean;
export interface CopyTarget {
    slideIdx: number;
    text: string;
}
interface TextEl {
    kind: string;
    text?: string;
    fontSize?: number;
}
/** 跟 reflect 同一条规则：套话、自述版式、感叹号按句；「不是…而是…」整稿超过一句才算。 */
export declare function copyTargetsFromSlides(slides: ReadonlyArray<{
    elements: readonly TextEl[];
}>): CopyTarget[];
export interface AppliedCopyReplacement {
    slideIdx: number;
    from: string;
    to: string;
}
/**
 * 把改写落回已画好的文字上。`to` 仍然违规、或对不上原文，就留着原来的字。
 * 不改槽位、位置和形状种类。`elements` 是换掉的文字块数，`rows` 是真正落地的句子。
 */
export declare function applyCopyReplacements(slides: Array<{
    elements: Array<{
        kind: string;
        text?: string;
    }>;
}>, replacements: ReadonlyArray<{
    slideIdx: number;
    from: string;
    to: string;
}>): {
    elements: number;
    rows: AppliedCopyReplacement[];
};
/** 画布上换成的句子，大纲标题和要点里同一句也换成。出场顺序仍按大纲对文字。 */
export declare function mirrorOutlineCopy(slides: Array<{
    title: string;
    bullets?: string[];
}>, rows: ReadonlyArray<AppliedCopyReplacement>): void;
export declare function rewriteCopyVoice(input: {
    model: LanguageModel;
    slides: PaintedSlide[];
    signal?: AbortSignal;
    onUsage?: (usage: LlmUsage) => void;
}): Promise<{
    elements: number;
    rows: AppliedCopyReplacement[];
}>;
export {};
