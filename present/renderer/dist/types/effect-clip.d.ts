import type { Rect } from "@sliiu/present-core";
export interface EffectGeom {
    filter: string;
    prLst: string | undefined;
    progress: number;
    bbox: Rect;
    transition?: "in" | "out" | "none";
}
export declare function effectClipPathD(geom: EffectGeom): string;
export declare function effectClipUsesEvenOdd(geom: EffectGeom): boolean;
