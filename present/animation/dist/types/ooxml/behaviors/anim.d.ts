import type { DecodeCtx } from "../attr-map.js";
import type { AnimNode } from "../types.js";
import type { EasingFn } from "../../types.js";
import type { AtomTrack } from "../compile/types.js";
export declare function compileAnim(node: AnimNode, ctx: DecodeCtx, dur: number, parentEasing: EasingFn | undefined): AtomTrack[];
