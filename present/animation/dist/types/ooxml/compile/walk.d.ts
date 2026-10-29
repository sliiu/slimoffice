import type { Iterate, TimeNode } from "../types.js";
import type { EasingFn } from "../../types.js";
import type { AncestorEntrExitPreset, AtomInstance, CompileCtx } from "./types.js";
export declare function walkInstances(node: TimeNode, ctx: CompileCtx, out: AtomInstance[], baseOffset: number, parentIterate: Iterate | undefined, onEnd: (end: number) => void, ancestorEntrExitPreset?: AncestorEntrExitPreset, ancestorFill?: string, rootAbsStartMs?: number, isSubAnchor?: boolean, isStepRoot?: boolean, ancestorSpdRatio?: number, ancestorReverse?: boolean, ancestorEasing?: EasingFn): void;
