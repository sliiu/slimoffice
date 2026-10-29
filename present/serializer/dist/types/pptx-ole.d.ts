import type { OleObjectShape } from "@sliiu/present-core";
import { type ShapeCtx } from "./pptx-shapes.js";
export declare const OLE_GRAPHIC_URI = "http://schemas.openxmlformats.org/presentationml/2006/ole";
/** From-scratch `<p:graphicFrame>` for Insert → Object (OLE embed). */
export declare function oleFrameToXml(s: OleObjectShape, ctx: ShapeCtx): string;
