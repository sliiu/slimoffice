import type { SceneNode } from "./scene-node.js";
/** 2D 仿射：x' = a x + c y + e，y' = b x + d y + f。与 SVG / Canvas 的矩阵一致。 */
export interface Aff {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}
export declare function affMul(m: Aff, n: Aff): Aff;
/** 单个节点的 SVG 变换：先绕 bbox 中心旋转缩放，再平移 tx/ty。 */
export declare function nodeAffine(node: SceneNode): Aff;
/** 从最外层祖先乘到自身。幻灯片根是恒等变换，乘进去不改变结果。 */
export declare function accumulatedAffine(node: SceneNode): Aff;
/**
 * wrapper 已放在 slide 坐标 (originX, originY)。CSS transform-origin 为 0 0 时，
 * 用这个矩阵才能让视觉位置等于 accumulatedAffine。
 */
export declare function cssAffineForBox(m: Aff, originX: number, originY: number): Aff;
export declare function chainOpacity(node: SceneNode): number;
export declare function chainHidden(node: SceneNode): boolean;
