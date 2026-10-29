import type { EasingFn } from "../types.js";
export interface InterpKey {
    time: number;
    value: unknown;
    easing?: EasingFn;
}
export type ValueKind = "number" | "color" | "string" | "bool" | "point";
export interface RgbColor {
    r: number;
    g: number;
    b: number;
    a: number;
}
export declare function parseColor(input: unknown): RgbColor | null;
export declare function formatColor(c: RgbColor): string;
export declare function lerpNumber(a: number, b: number, t: number): number;
export declare function lerpColor(a: RgbColor, b: RgbColor, t: number): RgbColor;
export declare function sampleKeyframes(keys: InterpKey[], time: number, kind: ValueKind, calcMode?: "lin" | "discrete"): unknown;
