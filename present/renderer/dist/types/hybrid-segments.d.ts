import type { SceneNode } from "./scene-node.js";
export type HybridSegKind = "canvas" | "svg" | "webgl" | "webglm3d";
export interface HybridSegment {
    kind: HybridSegKind;
    ids: string[];
}
/**
 * 按绘制顺序切段。组合不单独成段：非 3D 子形状留在组合被归入的那一类（图片在组合里
 * 仍走 SVG），3D 子形状在它自己的 z 序位置拆成 webgl 段，这样字可以盖在挤出体上面。
 */
export declare function buildHybridSegments(children: SceneNode[]): HybridSegment[];
