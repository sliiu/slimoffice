import type { TextParagraph, TextRun } from "@sliiu/present-core";
import type { TextStylePatch } from "./commands.js";
export interface TextCharRange {
    paragraph: number;
    /** 含起始，不含结束。 */
    start: number;
    end: number;
}
export declare function patchTextRun(run: TextRun, patch: TextStylePatch): void;
/** 选区起点落在哪一段 run 上。字体和字号框用它，而不是整框的第一个字。 */
export declare function runAtCharRanges(paragraphs: readonly TextParagraph[], ranges: readonly TextCharRange[]): TextRun | undefined;
/** 只改选区覆盖到的字符。越界的下标会被夹到该段文本长度内。 */
export declare function applyStyleToCharRanges(paragraphs: TextParagraph[], ranges: readonly TextCharRange[], patch: TextStylePatch): TextParagraph[];
