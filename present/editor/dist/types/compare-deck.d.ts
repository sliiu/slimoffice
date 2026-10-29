import type { Presentation, Slide, TextParagraph } from "@sliiu/present-core";
export type StructureDiffKind = "layout" | "transition" | "animation" | "build" | "shapeInventory" | "notes" | "background" | "hidden";
export interface StructureDiffItem {
    kind: StructureDiffKind;
    before?: string;
    after?: string;
}
export interface TextShapeDiff {
    shapeIndex: number;
    shapeId: string;
    before: string;
    after: string;
    textChanged: boolean;
    bboxMoved: boolean;
}
export interface SlideCompareEntry {
    slideIdx: number;
    status: "same" | "changed" | "added" | "removed";
    before: string[];
    after: string[];
    structure: StructureDiffItem[];
    textShapes: TextShapeDiff[];
}
export interface DeckMetaDiff {
    kind: "protection";
    before: string;
    after: string;
}
/** Deck-level metadata diff (protection, etc.). */
export declare function comparePresentationMeta(a: Presentation, b: Presentation): DeckMetaDiff[];
export interface CompareSummary {
    changed: number;
    added: number;
    removed: number;
    withTextPatches: number;
    withStructure: number;
}
export declare function slideEntryHasTextPatches(e: SlideCompareEntry): boolean;
export declare function slideEntryHasStructureDiff(e: SlideCompareEntry): boolean;
/** Aggregate diff counts for compare dialog summary / filters. */
export declare function summarizeCompareEntries(entries: SlideCompareEntry[]): CompareSummary;
export declare function compareSlideStructure(a?: Slide, b?: Slide): StructureDiffItem[];
export declare function compareSlideTextShapes(a: Slide, b: Slide, targetIds: string[]): TextShapeDiff[];
export declare function compareDeckStructured(a: Presentation, b: Presentation): SlideCompareEntry[];
/** Back-compat alias used by compare dialog + editor. */
export declare function compareDeckTexts(a: Presentation, b: Presentation): SlideCompareEntry[];
/** Paragraph snapshots to apply from `other` slide (text-shape visit order). */
export declare function comparedSlideParagraphs(targetPres: Presentation, slideIdx: number, other: Presentation): Array<{
    shapeId: string;
    paragraphs: TextParagraph[];
}>;
