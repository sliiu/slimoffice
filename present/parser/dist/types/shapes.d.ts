import type { ChartDef, Rect, Shape } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import { type FillCtx } from "./fill.js";
import { type TextCtx } from "./text.js";
import type { PptxArchive } from "./zip.js";
export interface ShapeCtx extends FillCtx, TextCtx {
    archive?: PptxArchive;
    resolveRawBytes?: (cacheKey: string, bytes: Uint8Array, mime: string) => string | undefined;
    resolveMedia?: (path: string) => string | undefined;
    parseChartByRel?: (relId: string) => ChartDef | null;
    parseSmartArtByRel?: (relId: string, hostBBox?: Rect, layoutRelId?: string) => {
        shapes: Shape[];
        layout?: import("@sliiu/present-core").SmartArtLayoutKind;
    };
    tableStyleMap?: import("./table-styles.js").TableStyleMap;
}
export declare function parseShapeTree(spTree: XmlNode | undefined, ctx: ShapeCtx, group?: GroupFrame): Shape[];
interface GroupFrame {
    offX: number;
    offY: number;
    scaleX: number;
    scaleY: number;
}
export {};
