import type { CTn, Iterate, TgtEl, TimeNode } from "../types.js";
import type { CompileCtx } from "./types.js";
export declare function expandIterateSlices(iterate: Iterate, tgtEl: TgtEl, cTn: CTn, ctx: CompileCtx): Array<{
    tgtEl: TgtEl;
    stepMs: number;
}> | null;
export declare function shouldPrependShapeBgSlice(presetClass: string | undefined, tgtEl: TgtEl, cTnGrpId: number | undefined, ctx: CompileCtx): boolean;
export declare function withTgtEl(node: TimeNode, tgtEl: TgtEl): TimeNode;
