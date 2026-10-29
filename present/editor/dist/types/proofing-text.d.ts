import type { Shape, Slide, TextParagraph, TextShape } from "@sliiu/present-core";
export declare function paragraphPlain(p: TextParagraph): string;
export declare function shapePlainText(shape: TextShape): string;
export declare function walkTextShapes(shapes: Shape[], out: Array<{
    shapeId: string;
    text: TextShape;
}>): void;
export declare function slideTextLines(slide: Slide | undefined): string[];
export declare function firstWord(text: string): string;
export interface ProofingSelection {
    slideIdx: number;
    shapeId: string;
    word: string;
    fullText: string;
}
export declare function proofingSelectionFromShape(slideIdx: number, shapeId: string, shape: Shape | undefined): ProofingSelection | null;
export declare function replaceFirstWordInParagraphs(paragraphs: TextParagraph[], fromWord: string, toWord: string): TextParagraph[] | null;
export declare function listTextShapeIds(slide: Slide): string[];
