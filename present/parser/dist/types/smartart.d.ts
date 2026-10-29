import type { Rect, Shape } from "@sliiu/present-core";
import type { PptxArchive } from "./zip.js";
import { type ShapeCtx } from "./shapes.js";
export declare function parseSmartArt(archive: PptxArchive, dataPath: string, ctx: ShapeCtx, hostBBox?: Rect): Shape[];
export declare function parseSmartArtDetailed(archive: PptxArchive, dataPath: string, ctx: ShapeCtx, hostBBox?: Rect, layoutPath?: string): {
    shapes: Shape[];
    layout?: import("@sliiu/present-core").SmartArtLayoutKind;
};
