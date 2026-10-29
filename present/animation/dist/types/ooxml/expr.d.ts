import type { SlideEnv, TargetBox } from "./types.js";
export interface ExprEnv extends SlideEnv {
    bbox: TargetBox;
    extra?: Record<string, number>;
}
export declare function pptVars(env: ExprEnv): Record<string, number>;
export declare function evalArithmetic(input: string): number;
export declare function evalExpr(raw: string | number | undefined, env: ExprEnv): number;
export declare function evalNumberValue(raw: string | undefined): number | undefined;
export declare function evalBool(raw: string | undefined): boolean;
