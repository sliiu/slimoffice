import { type EasingName } from "../easing.js";
import type { EasingFn } from "../types.js";
export declare function accelDecelEasing(accelRaw?: number, decelRaw?: number): EasingFn | undefined;
export declare function bySplineEasing(spl: string | undefined): EasingFn | undefined;
export declare function namedEasing(name: EasingName | EasingFn | undefined): EasingFn | undefined;
