import type { Shape, Sp3DInfo } from "@sliiu/present-core";
/** 与 bake-sp3d 的 image pad 一致：贴图几何收在 bbox 内。 */
export declare const IMAGE_3D_PAD = 0.05;
/** 与 bake-sp3d 的非 image pad 一致：倒角会对称外扩。 */
export declare const SHAPE_3D_PAD = 0.15;
export declare function shapeSupports3D(s: Shape): boolean;
export declare function shape3DPad(kind: Shape["kind"]): number;
/** 形状上真正参加 3D 的那份参数。文字只看 bodyPr，避免和形状自己的 spPr 3D 各挤出一次。 */
export declare function shape3DInfo(s: Shape): Sp3DInfo | undefined;
/**
 * 非 image 形状的挤出轮廓，坐标系是形状本地的 0..bbox。
 * image 不需要轮廓（正面是贴图 slab）。rect 也不返回：scene-builder 在没有 pathD
 * 时已经按 bbox 挤出一个矩形。path 的 `d` 原样传入，由场景构建器按路径自身包围盒居中。
 */
export declare function shape3DPathD(s: Shape): string | undefined;
