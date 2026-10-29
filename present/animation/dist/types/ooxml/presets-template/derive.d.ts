import type { TimeNode } from "../types.js";
/** subtype 在 UI 上的含义：罗盘方向 / 轴向 / 内外 / 劈裂 / 轮辐数 / 伸展。 */
export type SubtypeKind = "compass" | "axis" | "inOut" | "barn" | "spokes" | "stretch";
/** donor 里方向写法的含义；没有可识别的方向写法时为 undefined。 */
export declare function subtypeKind(donor: TimeNode): SubtypeKind | undefined;
/** donor 能改写出的 subtype（不含 donor 自己没有方向写法的情况）。 */
export declare function derivableSubtypes(donor: TimeNode): number[];
/** 把 donor 改写成 target 方向；改写不了返回 null。不修改 donor。 */
export declare function deriveSubtypeVariant(donor: TimeNode, target: number): TimeNode | null;
