import type { InkOcrResult } from "./ink-ocr.js";
import type { PaddleLoadProgress } from "./ink-ocr-paddle.js";
export interface InkOcrDialogResult {
    text: string;
}
export interface InkOcrModelDialogHandlers {
    /** Combined download size in bytes, for the consent copy. */
    approxBytes: number;
    /** Starts the download + init, reporting progress; resolves when the model is ready. */
    load: (onProgress: (p: PaddleLoadProgress) => void) => Promise<void>;
    /**
     * Skip the consent step and begin loading immediately (progress still shown).
     * Set when the user already consented in a previous session.
     */
    autoStart?: boolean;
}
/**
 * Consent + progress dialog for the one-time on-device model download.
 * Resolves true once the model is loaded, false/null if the user declines.
 */
export declare function openInkOcrModelDialog(doc: Document, handlers: InkOcrModelDialogHandlers): Promise<boolean | null>;
export interface InkOcrDialogOptions {
    /**
     * AI 手写识别（云端视觉模型）。仅当宿主注入时才渲染「AI 识别」按钮 —— AI 是
     * 用户显式触发的可选项，而非默认路径（本地 PaddleOCR 已先跑过）。返回 null /
     * 抛错时保留当前本地结果。
     */
    recognizeWithAi?: () => Promise<InkOcrResult | null>;
}
export declare function openInkOcrDialog(doc: Document, ocr: InkOcrResult, options?: InkOcrDialogOptions): Promise<InkOcrDialogResult | null>;
