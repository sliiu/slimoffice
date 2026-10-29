import type { EditCommand, Presentation, TextParagraph } from "@sliiu/present-core";
export interface TextHit {
    slideIdx: number;
    shapeId: string;
    paraIdx: number;
    start: number;
    end: number;
}
export interface FindReplaceContext {
    getPresentation: () => Presentation;
    getCurrentSlideIdx: () => number;
    gotoSlide: (idx: number) => void;
    selectShape: (shapeId: string) => void;
    executeCommand: (cmd: EditCommand) => void;
    /** 批量替换时合并为一条 undo 记录。 */
    executeBatch?: (label: string, cmds: EditCommand[]) => void;
}
export interface FindReplaceHandle {
    close: () => void;
    focusFind: () => void;
}
export type FindReplaceMode = "find" | "replace";
/** 收集 deck 内所有文本命中（按 slide → shape → para → offset 顺序）。 */
export declare function collectTextHits(pres: Presentation, query: string, opts?: {
    caseSensitive?: boolean;
}): TextHit[];
export declare function replaceParagraphRange(paragraphs: TextParagraph[], paraIdx: number, start: number, end: number, replacement: string): TextParagraph[];
export declare function replaceAllInParagraphs(paragraphs: TextParagraph[], find: string, replace: string, caseSensitive: boolean): TextParagraph[] | null;
export declare function openFindReplacePanel(doc: Document, ctx: FindReplaceContext, mode?: FindReplaceMode): FindReplaceHandle;
