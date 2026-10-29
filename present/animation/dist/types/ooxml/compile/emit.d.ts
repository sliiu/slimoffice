import type { TimeNode } from "../types.js";
import type { CompileCtx, CompiledStep, StepTrigger } from "./types.js";
export declare function buildStep(node: TimeNode, ctx: CompileCtx, trigger: StepTrigger, triggerTargetId?: string): CompiledStep | null;
export declare function appendAutoStep(out: CompiledStep[], step: CompiledStep): void;
export declare function emit(node: TimeNode, ctx: CompileCtx, mainSteps: CompiledStep[], shapeSteps: CompiledStep[], parentDelay: number): void;
