import type { FieldResolveContext, TextParagraph, TextRun } from "@sliiu/present-core";
export declare function isEastAsianChar(cp: number): boolean;
export declare function mapVisualAlign(align: NonNullable<TextParagraph["align"]>, rtl: boolean): "start" | "middle" | "end" | "justify";
export declare function mapVisualAlignWithAnchorCtr(s: {
    anchorCtr?: boolean;
    paragraphs?: {
        length: number;
    };
    cellMeta?: unknown;
}, p: {
    align?: TextParagraph["align"];
    rtl?: boolean;
}): "start" | "middle" | "end" | "justify";
export type Token = {
    text: string;
    kind: "word" | "ws" | "cjk" | "tab";
};
/** Glue prohibited line-start / line-end characters to their CJK neighbour so they wrap together. */
export declare function applyKinsoku(tokens: Token[]): Token[];
/** eaLnBrk 为假：相邻汉字粘成一块，标点后面仍可断。调用前先走过禁则。 */
export declare function glueUnbrokenEastAsian(tokens: Token[]): Token[];
export interface VisualLine {
    segments: Array<{
        run: TextRun;
        text: string;
        width: number;
    }>;
    width: number;
    /** 行末挂在边外的标点宽度。对齐用 width - hang。 */
    hang: number;
    height: number;
    ascent: number;
    maxFs: number;
}
export declare function wrapParagraphIntoLines(p: TextParagraph, maxWidth: number, fallbackFs: number, ctx: CanvasRenderingContext2D, firstLineMaxWidth: number, noWrap: boolean, fieldCtx?: FieldResolveContext, compatLnSpc?: boolean): VisualLine[];
