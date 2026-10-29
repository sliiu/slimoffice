import type { Presentation } from "@sliiu/present-core";
export type { SlideCompareEntry } from "./compare-deck.js";
export { compareDeckStructured, compareDeckTexts, comparedSlideParagraphs, comparePresentationMeta, summarizeCompareEntries, slideEntryHasTextPatches, slideEntryHasStructureDiff } from "./compare-deck.js";
export interface CompareDialogContext {
    pres: Presentation;
    gotoSlide: (idx: number) => void;
    acceptSlide: (idx: number, other: Presentation) => void;
    acceptAllSlides?: (other: Presentation, slideIndices: number[]) => void;
}
export declare function openCompareDialog(doc: Document, ctx: CompareDialogContext): void;
