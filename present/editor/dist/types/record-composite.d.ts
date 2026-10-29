import type { PipPreferences, PipSizePreset } from "./record-show-overlay.js";
/** PIP width as a fraction of the composite canvas (screen recording). */
export declare const PIP_WIDTH_FRACTION: Record<PipSizePreset, number>;
export interface PipDrawRect {
    x: number;
    y: number;
    w: number;
    h: number;
    mirror: boolean;
}
/** Bottom-right PIP placement for screen+camera composite recording. */
export declare function computePipDrawRect(canvasW: number, canvasH: number, prefs?: Pick<PipPreferences, "size" | "mirror" | "corner">): PipDrawRect;
/** Plain-text summary of composite PIP draw rect. */
export declare function formatPipDrawRectLine(rect: PipDrawRect): string;
