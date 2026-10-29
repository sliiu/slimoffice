import type { DecodeCtx } from "../attr-map.js";
import type { SetNode } from "../types.js";
import type { AtomTrack } from "../compile/types.js";
export declare function compileSet(node: SetNode, ctx: DecodeCtx, dur: number): AtomTrack[];
