import type { TransitionFactory } from "./types.js";
export declare const cube: TransitionFactory;
/** 三棱柱转 120°，和立方体的 90° 分开。左右绕 Y，上下绕 X。 */
export declare const prism: TransitionFactory;
/** 走进盒子：新页从内侧转出来，旧页往外让开。和立方体外表面对转分开。 */
export declare const box: TransitionFactory;
export declare const gallery: TransitionFactory;
export declare const orbit: TransitionFactory;
export declare const conveyor: TransitionFactory;
/** 旧页对开。垂直沿左右铰链转开，水平沿上下铰链转开。 */
export declare const doors: TransitionFactory;
/** 窗：两扇平着滑开，不绕铰链转。和门分开。 */
export declare const window: TransitionFactory;
export declare const pageCurl: TransitionFactory;
/** p15 pageCurlSingle：只掀起一角。整页卷曲走 pageCurl 的书页翻边。 */
export declare const pageCurlSingle: TransitionFactory;
/** p15 wind：旧页切成细条，顺着风向依次吹出。向右 / 向下镜像。 */
export declare const wind: TransitionFactory;
/** p15 crush：旧页朝选定的边压成一条线。 */
export declare const crush: TransitionFactory;
export declare const airplane: TransitionFactory;
/** 对折两次再飞走。向右时折痕在右缘。和翻页的单次卷起分开。 */
export declare const origami: TransitionFactory;
export declare const flythrough: TransitionFactory;
export declare const rotate: TransitionFactory;
/** 绕画面外侧的轴转过去，像摩天轮的一格，不是原地翻面。 */
export declare const ferris: TransitionFactory;
export declare const peelOff: TransitionFactory;
/** 卡片翻面：转到 90° 时只看见棱，没有旋转那种半透明交叠。 */
export declare const flip: TransitionFactory;
/** 两页左右错身换位，带一点倾斜。 */
export declare const switchFx: TransitionFactory;
export declare const drape: TransitionFactory;
/** 帘幕：多条竖褶从中缝向两边收走。 */
export declare const curtains: TransitionFactory;
export declare const ripple: TransitionFactory;
export declare const warp: TransitionFactory;
export declare const vortex: TransitionFactory;
