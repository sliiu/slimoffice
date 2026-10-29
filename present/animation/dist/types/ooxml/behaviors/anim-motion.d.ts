import type { AnimMotionNode } from "../types.js";
import type { EasingFn } from "../../types.js";
import type { AtomTrack, CompileCtx } from "../compile/types.js";
export declare function compileAnimMotion(node: AnimMotionNode, ctx: CompileCtx, parentEasing: EasingFn | undefined): AtomTrack[];
