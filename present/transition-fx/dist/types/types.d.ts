import type { SlideTransition } from "@sliiu/present-core";
export interface TransitionCtx {
    ghost: HTMLElement;
    stage: HTMLElement;
    duration: number;
    params: Record<string, unknown>;
    transition: SlideTransition;
    stageSize: {
        w: number;
        h: number;
    };
}
export type TransitionFactory = (ctx: TransitionCtx) => Promise<void>;
