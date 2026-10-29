import type { EditCommand, Presentation, Rect, WebEmbedShape } from "@sliiu/present-core";
import { type NormalizedWebEmbed } from "@sliiu/present-core";
export interface BuildWebEmbedShapeInput {
    embed: NormalizedWebEmbed;
    bbox: Rect;
    allowFullscreen?: boolean;
}
export declare function buildWebEmbedShape(input: BuildWebEmbedShapeInput): WebEmbedShape;
/** Insert a web iframe embed (YouTube / Vimeo) onto the active slide layer. */
export declare class InsertWebEmbedCmd implements EditCommand {
    private slideIdx;
    private layerIdx;
    readonly label = "Insert web embed";
    readonly shape: WebEmbedShape;
    constructor(slideIdx: number, layerIdx: number, input: BuildWebEmbedShapeInput);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
