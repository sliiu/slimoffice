import type { TransitionFactory } from "./types.js";
export declare const fade: TransitionFactory;
export declare const cut: TransitionFactory;
export declare const push: TransitionFactory;
export declare const cover: TransitionFactory;
export declare const uncover: TransitionFactory;
export declare const wipe: TransitionFactory;
export declare const split: TransitionFactory;
export declare const zoom: TransitionFactory;
export declare const blinds: TransitionFactory;
export declare const checker: TransitionFactory;
export declare const randomBar: TransitionFactory;
/** 旧页切成小格，按固定乱序一块块消失。着色器快照失败时用这条。 */
export declare const dissolve: TransitionFactory;
export declare const newsflash: TransitionFactory;
export declare const wheel: TransitionFactory;
export declare const wheelReverse: TransitionFactory;
export declare const circle: TransitionFactory;
export declare const diamond: TransitionFactory;
export declare const plus: TransitionFactory;
export declare const random: TransitionFactory;
export declare const fall: TransitionFactory;
export declare const reveal: TransitionFactory;
export declare const flash: TransitionFactory;
/** 菱形或六边形沿方向扫过，同时旧页闪几下。pattern 来自 OOXML hexagon / diamond。 */
export declare const glitter: TransitionFactory;
/** 疏六边形从中心铺开，格子之间留缝，不闪。 */
export declare const honeycomb: TransitionFactory;
/** 斜向细条撕开。向外从中心铺开新页，向内让旧页的细条收到中心。 */
export declare const shred: TransitionFactory;
/** 旧页切成小块飞散，新页从稍大缩回。 */
export declare const fracture: TransitionFactory;
/** 旧页向左掀起，一道高光扫过新页。 */
export declare const prestige: TransitionFactory;
/** 梳齿交错抽走旧页。水平是上下两排齿，垂直是左右两排齿。 */
export declare const comb: TransitionFactory;
/** 斜向宽带从指定角扫过。 */
export declare const strips: TransitionFactory;
/** 从中心张开一块扇形，和整圆轮子分开。 */
export declare const wedge: TransitionFactory;
