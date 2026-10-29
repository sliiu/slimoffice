import type { PathShape, Rect } from "@sliiu/present-core";
import type { InkPoint } from "./ink-tool.js";
/** Tesseract `tessedit_pageseg_mode` — tuned for ink snippets. */
export declare const OCR_PSM: {
    readonly SINGLE_BLOCK: "6";
    readonly SINGLE_LINE: "7";
    readonly SINGLE_WORD: "8";
    readonly RAW_LINE: "13";
};
export type OcrPsm = (typeof OCR_PSM)[keyof typeof OCR_PSM];
export type InkOcrEngine = "tesseract" | "vision" | "paddle";
export type InkOcrScope = "selected" | "all";
export interface InkOcrResult {
    text: string;
    /** 0–100. Tesseract / Paddle report this; vision uses a high placeholder. */
    confidence: number;
    lang: string;
    strokeCount: number;
    previewDataUrl: string;
    engine: InkOcrEngine;
    scope: InkOcrScope;
}
export declare function unionInkBbox(shapes: readonly {
    bbox: Rect;
}[]): Rect;
export declare function inflateRect(rect: Rect, pad: number): Rect;
/** Tight crop with padding. Do not force a square — that buries thin ink in white. */
export declare function normalizeOcrCrop(crop: Rect): Rect;
/** Parse ink path `d` into points (M/L/H/V, commas, implicit lineto, relative). */
export declare function parseSimplePathD(d: string): InkPoint[];
/** True when `d` is bbox-local (0,0 origin) rather than slide-absolute. */
export declare function inkPathIsLocalToBbox(sh: PathShape): boolean;
/** Left-to-right reading order with coarse line grouping (for multi-stroke words). */
export declare function sortInkPathsByReadingOrder(shapes: readonly PathShape[]): PathShape[];
export declare function inferOcrPsm(crop: Rect, strokeCount: number): OcrPsm;
/** Binarize for Tesseract only. Threshold is high so yellow/gray ink is kept. */
export declare function preprocessInkCanvas(canvas: HTMLCanvasElement): void;
export declare function rasterizeInkPaths(shapes: readonly PathShape[], crop: Rect): HTMLCanvasElement;
export declare function tesseractLangFromProofing(langTag: string): string;
export declare function isInkOcrSupported(): boolean;
export declare function inkOcrConfidenceLevel(confidence: number): "high" | "medium" | "low";
/** Release cached Tesseract worker (e.g. on editor dispose). */
export declare function disposeInkOcrWorker(): Promise<void>;
export declare function recognizeInkCanvas(canvas: HTMLCanvasElement, lang: string, meta: {
    strokeCount: number;
    previewDataUrl: string;
    scope: InkOcrScope;
    crop: Rect;
}): Promise<InkOcrResult>;
export declare function recognizeInkPaths(shapes: readonly PathShape[], lang: string, scope?: InkOcrScope): Promise<InkOcrResult>;
/** For tests: rebuild path `d` from points (round-trip sanity). */
export declare function pathDFromPoints(points: readonly InkPoint[]): string;
