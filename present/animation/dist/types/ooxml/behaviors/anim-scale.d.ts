import type { AnimScaleNode } from "../types.js";
import type { EasingFn } from "../../types.js";
import type { AtomTrack } from "../compile/types.js";
export declare function compileAnimScale(node: AnimScaleNode, dur: number, parentEasing: EasingFn | undefined): AtomTrack[];
