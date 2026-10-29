import type { InkOcrResult, InkOcrScope } from "./ink-ocr.js";
type PaddleLang = "ch" | "en" | "japan" | "chinese_cht";
/** Combined one-time download size (~139 MB) — for the consent prompt. */
export declare const PADDLE_MODEL_APPROX_BYTES: number;
export interface PaddleLoadProgress {
    /** Bytes downloaded so far across det + rec. */
    loaded: number;
    /** Total bytes to download (0 if unknown). */
    total: number;
    /** 0–1 download fraction (0 when total unknown). */
    fraction: number;
}
/** True if the user has already consented to (and completed) the model download once. */
export declare function hasPaddleModelConsent(): boolean;
/**
 * Kick off the (lazy) model download + session build, reporting progress. Safe to
 * call before recognition so the UI can show a consent + progress dialog; once it
 * resolves, `recognizeInkPaddle` reuses the cached instance with no extra download.
 */
export declare function preloadPaddleOcr(onProgress?: (p: PaddleLoadProgress) => void): Promise<void>;
export declare function paddleLangFromProofing(langTag: string): PaddleLang;
export declare function paddleOcrReady(): boolean;
export declare function disposePaddleOcr(): Promise<void>;
/** Returns null when PaddleOCR is unavailable or reads nothing (caller falls back). */
export declare function recognizeInkPaddle(canvas: HTMLCanvasElement, langTag: string, meta: {
    strokeCount: number;
    previewDataUrl: string;
    scope: InkOcrScope;
}): Promise<InkOcrResult | null>;
export {};
