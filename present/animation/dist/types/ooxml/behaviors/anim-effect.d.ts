import type { EasingFn } from "../../types.js";
import type { AnimEffectNode } from "../types.js";
import type { AtomTrack } from "../compile/types.js";
export declare function compileAnimEffect(node: AnimEffectNode, dur: number, easing?: EasingFn): AtomTrack[];
