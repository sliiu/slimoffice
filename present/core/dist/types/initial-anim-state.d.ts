import type { InitialCharRangeOverride, InitialParaOverride, Slide } from "./slide.js";
import type { Shape } from "./shape.js";
export interface InitialEntranceState {
    hiddenShapes: Set<Shape>;
    paraOverrides: InitialParaOverride[];
    charOverrides: InitialCharRangeOverride[];
}
/**
 * 扫描 slide.ooxmlTiming 中的 entrance preset 目标，按与 parser 相同的算法
 * 决定哪些 shape 需要整体 hide、哪些段落/字符 range 需要 hide。
 *
 * 不修改 slide；调用方决定如何 apply（见 applyInitialEntranceState）。
 */
export declare function computeInitialEntranceState(slide: Slide): InitialEntranceState;
/**
 * 把 computeInitialEntranceState 的结果写回 slide：
 *   - 列入 hiddenShapes 的 shape：opacity 置 0；
 *   - paraOverrides / charOverrides：覆盖原值（length=0 则置 undefined 与 parser 行为一致）。
 *
 * 注意：除了 hiddenShapes 之外的 shape 不会被本函数主动改回 opacity=1，
 * 调用方需自行确保"被 user 删除入场动画的 shape"先恢复可见再调用（见 editor.destroy）。
 */
export declare function applyInitialEntranceState(slide: Slide, state: InitialEntranceState): void;
