import type { SceneNode } from "./scene-node.js";
/**
 * 撤销单个 SceneNode 的绘制变换，与 canvas/svg backend 对偶：
 * translate(tx,ty) → rotate around bbox center → scale around center。
 */
export declare function inverseSceneNode(n: SceneNode, x: number, y: number): {
    x: number;
    y: number;
};
/** 世界坐标 → 该节点未旋转 bbox 空间（含祖先 group 变换）。 */
export declare function worldToLocal(node: SceneNode, x: number, y: number): {
    x: number;
    y: number;
};
export declare function hitTestNodeBBox(node: SceneNode, worldX: number, worldY: number): boolean;
