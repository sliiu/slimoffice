import type { EditCommand, Presentation } from "@sliiu/present-core";
import { type AnimationEffectSpec, type AutoAnimateOptions, type MainstreamEffect } from "../../animations.js";
export interface ApplyAutoAnimationsArgs extends AutoAnimateOptions {
}
/**
 * 给单页（或省略 slideIdx 时全部页）应用主流 auto-animate。
 *
 * 行为：
 *   - 解析 bundleId（显式 > 推断），所有目标 slide 都用同一个 bundle，确保 deck 整体感一致。
 *   - 已有 ooxmlTiming / transition 会被覆盖（先清空再重建），多次执行不叠加。
 *   - revert 时连 timing + transition 一起复位。
 */
export declare class ApplyAutoAnimationsCmd implements EditCommand {
    private slideIdx;
    private opts;
    readonly label = "AI: Apply mainstream animations";
    private snapshots?;
    constructor(slideIdx: number | undefined, opts?: ApplyAutoAnimationsArgs);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
    private collectTargets;
}
/**
 * 清空 ooxmlTiming —— 让 player 当作"无动画"播放。同时清掉 slide.transition
 * （否则用户"想要彻底安静"还能看到页间过渡）。
 */
export declare class ClearSlideAnimationsCmd implements EditCommand {
    private slideIdx;
    readonly label = "AI: Clear slide animations";
    private snapshots?;
    constructor(slideIdx: number | undefined);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
export interface AddAnimationCmdArgs {
    effect: MainstreamEffect;
    trigger?: AnimationEffectSpec["trigger"];
    durationMs?: number;
    delayMs?: number;
    paraRange?: AnimationEffectSpec["paraRange"];
}
/**
 * 给某 shape 追加一个动画 effect（保留已有 effect）。
 */
export declare class AddAnimationCmd implements EditCommand {
    private slideIdx;
    private shapeId;
    private args;
    readonly label = "AI: Add animation";
    private snapshot?;
    constructor(slideIdx: number, shapeId: string, args: AddAnimationCmdArgs);
    apply(pres: Presentation): void;
    revert(_pres: Presentation): void;
}
