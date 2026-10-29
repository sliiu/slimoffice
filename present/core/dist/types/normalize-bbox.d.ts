import type { Rect } from "./geometry.js";
import type { Presentation } from "./slide.js";
export interface NormalizeBboxOptions {
    oversizeThreshold?: number;
    maxFitRatio?: number;
}
export interface NormalizeBboxFit {
    slideIdx: number;
    shapeId: string;
    from: Rect;
    to: Rect;
}
export interface NormalizeBboxResult {
    fittedShapes: NormalizeBboxFit[];
}
export declare function normalizeBboxes(pres: Presentation, options?: NormalizeBboxOptions): NormalizeBboxResult;
