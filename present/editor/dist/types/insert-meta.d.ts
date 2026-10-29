import type { AudioShape, Model3DShape, OleObjectShape, Presentation, Shape, Slide, SmartArtItem, SmartArtLayoutKind, VideoShape } from "@sliiu/present-core";
import { RECORDING_LARGE_BYTES } from "./video-export.js";
export type InsertShapeKind = "ole" | "model3d" | "video" | "audio" | "smartart";
export interface InsertShapeRef {
    kind: InsertShapeKind;
    id: string;
    label: string;
}
export interface InsertShapeDeckRef extends InsertShapeRef {
    slideIndex: number;
}
export interface InsertShapeSizeRef extends InsertShapeRef {
    bytes: number;
}
/** Warn before inserting very large media onto a slide (bytes). */
export { RECORDING_LARGE_BYTES as MEDIA_LARGE_BYTES };
export declare function isLargeMediaBytes(bytes: number | null, limit?: number): boolean;
/** Extract MIME type from a `data:...;base64,...` URL. */
export declare function parseDataUrlMime(dataUrl: string | undefined): string | null;
/** Human-readable label for a data-URL MIME type. */
export declare function mediaMimeLabel(mime: string | null | undefined): string | null;
export declare function formatMediaTrimSummary(trim: {
    start?: number;
    end?: number;
} | undefined, duration: number | undefined): string | null;
export declare function summarizeOleShape(shape: OleObjectShape): string[];
export declare function summarizeModel3DShape(shape: Model3DShape): string[];
export declare function summarizeMediaShape(shape: VideoShape | AudioShape): string[];
export interface InsertShapeDeckSizeRef extends InsertShapeDeckRef {
    bytes: number;
}
/** Byte size for OLE / 3D / video / audio payloads (null when unknown). */
export declare function insertShapeByteSize(shape: Shape): number | null;
/** Whether an insert shape exceeds OLE or media size limits. */
export declare function isLargeInsertShape(shape: Shape): boolean;
/** OLE / 3D / media / SmartArt shapes on one slide (top-level walk, includes nested groups). */
export declare function collectInsertShapesOnSlide(slide: Slide): InsertShapeRef[];
/** Large OLE / 3D / media shapes on one slide. */
export declare function collectLargeInsertShapesOnSlide(slide: Slide): InsertShapeSizeRef[];
/** Count insert shapes by kind. */
export declare function summarizeInsertKinds(refs: readonly InsertShapeRef[]): Partial<Record<InsertShapeKind, number>>;
/** One-line insert inventory stats (e.g. `3 shape(s): ole×1, video×2`). */
export declare function formatInsertInventoryStatsLine(refs: readonly InsertShapeRef[]): string;
/** All insert-type shapes across a deck. */
export declare function collectInsertShapesInDeck(pres: Presentation): InsertShapeDeckRef[];
/** Locate an insert shape anywhere in the deck. */
export declare function findInsertShapeInDeck(pres: Presentation, shapeId: string): InsertShapeDeckRef | null;
/** Slide index with the most insert-type shapes (ties → lowest index). */
export declare function slideWithMostInsertShapes(pres: Presentation): number | null;
/** Large insert shapes across the deck (with slide index). */
export declare function collectLargeInsertShapesInDeck(pres: Presentation): InsertShapeDeckSizeRef[];
export declare function countLargeInsertShapesInDeck(pres: Presentation): number;
/** Sum known payload bytes for OLE / 3D / media shapes in the deck. */
export declare function totalInsertPayloadBytes(pres: Presentation): number;
/** Slide index with the most large insert shapes (ties → lowest index). */
export declare function slideWithMostLargeInsertShapes(pres: Presentation): number | null;
export declare function filterInsertRefsByKind(refs: readonly InsertShapeDeckRef[], kind: InsertShapeKind | "all"): InsertShapeDeckRef[];
/** Share of insert shapes with a measurable payload (0–100). */
export declare function insertPayloadCoveragePercent(pres: Presentation): number;
/** Sum payload bytes for large insert shapes only. */
export declare function largeInsertPayloadBytes(pres: Presentation): number;
/** Slide index with the highest total insert payload (ties → lowest index). */
export declare function slideWithLargestInsertPayload(pres: Presentation): number | null;
/** One-line kind breakdown for the whole deck (e.g. `ole×1, video×2`). */
export declare function formatInsertKindBreakdownLine(pres: Presentation): string;
/** One-line insert readiness for status chips. */
export declare function formatInsertReadinessLine(pres: Presentation): string;
/** Labeled readiness export for copy. */
export declare function exportInsertReadinessText(pres: Presentation): string;
/** Average payload bytes per insert shape with measurable size (0 if none). */
export declare function averageInsertPayloadBytesPerShape(pres: Presentation): number;
/** Slide indices with no insert-type shapes. */
export declare function slidesWithoutInsertShapes(pres: Presentation): number[];
/** Count of slides with at least one insert shape. */
export declare function countSlidesWithInsertShapes(pres: Presentation): number;
/** Count of slides with no insert shapes. */
export declare function countSlidesWithoutInsertShapes(pres: Presentation): number;
/** First slide index with no insert shapes (lowest index). */
export declare function slideWithFirstWithoutInsertShapes(pres: Presentation): number | null;
/** Slide index with the fewest insert shapes among non-empty slides (ties → lowest). */
export declare function slideWithFewestInsertShapes(pres: Presentation): number | null;
/** One-line slide coverage breakdown (occupied / empty / avg bytes). */
export declare function formatInsertSlideCoverageBreakdownLine(pres: Presentation): string;
/** Largest single insert shape in the deck (by payload bytes). */
export declare function insertShapeWithLargestPayload(pres: Presentation): InsertShapeDeckSizeRef | null;
/** One-line largest insert shape summary. */
export declare function formatInsertLargestShapeLine(pres: Presentation): string;
/** Insert shapes with unknown payload size. */
export declare function collectUnsizedInsertShapesInDeck(pres: Presentation): InsertShapeDeckRef[];
/** Plain-text report of insert shapes without measurable payload. */
export declare function exportInsertUnsizedShapesText(pres: Presentation): string;
/** Labeled slide coverage export for copy. */
export declare function exportInsertSlideCoverageText(pres: Presentation): string;
/** Labeled largest-shape export for copy. */
export declare function exportInsertLargestShapeText(pres: Presentation): string;
/** Plain-text deck inventory filtered by kind. */
export declare function exportDeckInsertByKindText(pres: Presentation, kind: InsertShapeKind | "all"): string;
/** Compact deck inventory filtered by kind. */
export declare function exportDeckInsertByKindCompactText(pres: Presentation, kind: InsertShapeKind | "all"): string;
/** One-line deck insert stats for chips and compact copy. */
export declare function formatInsertDeckStatsLine(pres: Presentation): string;
/** Plain-text inventory of insert-type shapes on a slide. */
export declare function exportSlideInsertInventoryText(slide: Slide, slideIndex?: number): string;
/** Plain-text inventory of insert-type shapes across the whole deck. */
export declare function exportDeckInsertInventoryText(pres: Presentation): string;
/** Plain-text report of large OLE / 3D / media shapes in the deck. */
export declare function exportLargeInsertReportText(pres: Presentation): string;
/** Compact slide insert summary (one-liners). */
export declare function exportSlideInsertCompactText(slide: Slide, slideIndex?: number): string;
/** Compact deck insert summary (one-liners). */
export declare function exportDeckInsertCompactText(pres: Presentation): string;
/** Compact large-insert report (comma-separated slide:kind labels). */
export declare function exportLargeInsertCompactText(pres: Presentation): string;
/** One-line compact summary for a single insert shape. */
export declare function exportInsertShapeCompactText(shape: Shape): string | null;
export declare function smartArtPictureCount(items: readonly SmartArtItem[]): number;
export declare function clearSmartArtItemPictures(items: SmartArtItem[]): SmartArtItem[];
export declare function summarizeSmartArtGroup(group: Shape & {
    kind: "group";
    smartArtMeta?: {
        layout: SmartArtLayoutKind;
    };
}): string[];
/** Whether UI should confirm before applying a large insert/replace. */
export declare function shouldConfirmLargeInsertBytes(bytes: number | null, kind: "ole" | "media" | "model3d"): boolean;
/** Plain-text summary for OLE / 3D / media shapes (copy / export). */
export declare function exportInsertShapeSummary(shape: Shape): string | null;
/** Filter SmartArt layout kinds by case-insensitive query (kind id or label). */
export declare function filterSmartArtLayouts(query: string, layouts: readonly SmartArtLayoutKind[], getLabel: (layout: SmartArtLayoutKind) => string): SmartArtLayoutKind[];
/** Duplicate a SmartArt item at `index`, inserting the copy immediately after. */
export declare function duplicateSmartArtItemAt(items: SmartArtItem[], index: number): SmartArtItem[];
export declare function copyTextToClipboard(text: string): Promise<boolean>;
