import type { Iterate, TimeNode } from "../types.js";
import type { EasingFn } from "../../types.js";
import type { AncestorEntrExitPreset, Atom, CompileCtx, TargetInfo } from "./types.js";
export declare function compileLeaf(node: TimeNode, target: TargetInfo, ctx: CompileCtx, iterate: Iterate | undefined, ancestorEntrExitPreset?: AncestorEntrExitPreset, ancestorFill?: string, ancestorSpdRatio?: number, ancestorReverse?: boolean, ancestorEasing?: EasingFn): Atom | null;
