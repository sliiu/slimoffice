import type { Rect, Transform } from "@sliiu/present-core";
import type { OleObjectShape, ShapeMeta } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import type { RelMap } from "./parts.js";
import type { PptxArchive } from "./zip.js";
export interface OleParseCtx {
    rels?: RelMap;
    archive?: PptxArchive;
    resolveRawBytes?: (cacheKey: string, bytes: Uint8Array, mime: string) => string | undefined;
}
export declare const OLE_GRAPHIC_URI = "http://schemas.openxmlformats.org/presentationml/2006/ole";
/** Map OOXML progId / file extension to a short human-readable type label. */
export declare function oleTypeLabel(progId: string | undefined, fileName?: string): string;
/** Short badge text for the OLE icon tile (e.g. XLS, PDF). */
export declare function oleBadgeText(progId: string | undefined, fileName?: string, typeLabel?: string): string;
declare function oleBadgeColor(progId: string | undefined, fileName?: string): string;
/** Guess OOXML `progId` from a user-selected file name (Insert → Object). */
export declare function guessOleProgId(fileName: string): string;
export { oleBadgeColor };
/** Parse `<a:graphicData uri="…/ole">` → `OleObjectShape`. */
export declare function parseOleGraphicFrame(graphicData: XmlNode, meta: ShapeMeta, bbox: Rect, transform: Transform, ctx?: OleParseCtx): OleObjectShape | null;
