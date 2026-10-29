import type { Model3DShape } from "@sliiu/present-core";
import { type ShapeCtx } from "./pptx-shapes.js";
export declare const MODEL3D_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2017/model3d";
/** From-scratch `<p:graphicFrame>` for Insert → 3D Model. */
export declare function model3DFrameToXml(s: Model3DShape, ctx: ShapeCtx): string;
