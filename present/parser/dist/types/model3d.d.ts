import type { Model3DShape, Rect, ShapeMeta, Transform } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import type { PptxArchive } from "./zip.js";
import type { RelMap } from "./parts.js";
export declare const MODEL3D_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2017/model3d";
export interface Model3DParseCtx {
    rels?: RelMap;
    archive?: PptxArchive;
    resolveImage?: (path: string) => string | undefined;
    resolveMedia?: (path: string) => string | undefined;
}
/** Parse `<a:graphicData uri="…/model3d">` → `Model3DShape`. */
export declare function parseModel3DGraphicFrame(graphicData: XmlNode, meta: ShapeMeta, bbox: Rect, transform: Transform, ctx?: Model3DParseCtx): Model3DShape | null;
