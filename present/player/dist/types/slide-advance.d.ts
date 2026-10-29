import type { SlideTransition } from "@sliiu/present-core";
export declare function clickAdvancesSlide(transition: SlideTransition | undefined): boolean;
export interface AutoplayStep {
    trigger: string;
    delay: number;
    duration: number;
    autoReverse: boolean;
    iterations: number;
}
export declare function autoAdvanceAfterSec(transition: SlideTransition | undefined): number | null;
/** 从放映开始算，这条自动时间轴何时结束。停在第一次需要单击的 step。 */
export declare function autoplayTimelineSec(steps: readonly AutoplayStep[]): number;
/**
 * advTm > 0：到点就换，不延长到动画结束。
 * advTm = 0：等自动动画播完再换；没有自动动画则立刻换。
 */
export declare function autoAdvanceWaitSec(advAfter: number, autoplaySec: number): number;
