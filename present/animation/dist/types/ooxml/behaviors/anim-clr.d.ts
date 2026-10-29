import type { AnimClrNode } from "../types.js";
import type { EasingFn } from "../../types.js";
import type { AtomTrack, CompileCtx } from "../compile/types.js";
export declare function compileAnimClr(node: AnimClrNode, ctx: CompileCtx, dur: number, parentEasing: EasingFn | undefined): AtomTrack[];
