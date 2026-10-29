import type { AnimRotNode } from "../types.js";
import type { EasingFn } from "../../types.js";
import type { AtomTrack } from "../compile/types.js";
export declare function compileAnimRot(node: AnimRotNode, dur: number, parentEasing: EasingFn | undefined): AtomTrack[];
