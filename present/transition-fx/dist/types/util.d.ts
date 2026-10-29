import type { TransitionCtx } from "./types.js";
export declare const STD_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
export declare const LINEAR = "linear";
export declare function dirVec(dir: string, w: number, h: number): {
    dx: number;
    dy: number;
    axis: "x" | "y";
    sign: 1 | -1;
};
export declare function runAll(anims: Animation[], cleanup?: () => void): Promise<void>;
export declare function ms(ctx: TransitionCtx): number;
export declare function easing(ctx: TransitionCtx): string;
