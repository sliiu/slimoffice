import type { EditCommand, Presentation, Rect } from "@sliiu/present-core";
/** Remove all ink path shapes from one slide (undoable). */
export declare class ClearInkOnSlideCmd implements EditCommand {
    private slideIdx;
    readonly label = "Clear ink";
    private removed;
    constructor(slideIdx: number);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Convert ink strokes on the current slide to regular freeform path shapes. */
export declare class ConvertInkToShapeCmd implements EditCommand {
    private slideIdx;
    private shapeIds;
    readonly label = "Convert ink to shape";
    private changed;
    constructor(slideIdx: number, shapeIds: string[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
/** Convert ink strokes to a text box using pre-recognized text (OCR runs outside the command). */
export declare class ConvertInkToTextCmd implements EditCommand {
    private slideIdx;
    private shapeIds;
    private recognizedText;
    private textBbox;
    readonly label = "Convert ink to text";
    private removed;
    private addedText?;
    private insertPos;
    constructor(slideIdx: number, shapeIds: string[], recognizedText: string, textBbox: Rect);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
