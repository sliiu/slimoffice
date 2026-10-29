import type { PathShape, Rect, ShapeMeta, Transform } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
export declare function parseInkMlToPath(xml: XmlNode, meta: ShapeMeta, bbox: Rect, transform: Transform): PathShape | null;
export declare function looksLikeInkMl(xml: XmlNode | undefined): boolean;
