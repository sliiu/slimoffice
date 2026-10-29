import type { Rect, Shape, Transform } from "@sliiu/present-core";
/** bbox + transform，命中测试 / 锚点补偿不需要完整 Shape。 */
export type XfrmNode = {
    bbox: Rect;
    transform?: Transform;
};
export declare function shapeCenter(s: {
    bbox: Rect;
}): {
    x: number;
    y: number;
};
/**
 * 撤销单个 shape 的 scene-node 变换（tx/ty，再绕 bbox 中心 rotate / flip）。
 * 正向（svg-backend）：translate(tx,ty) → rotate/scale around center。
 */
export declare function inverseNodeTransform(s: XfrmNode, x: number, y: number): {
    x: number;
    y: number;
};
/**
 * 正向：local → slide。对偶 inverseNodeTransform。
 * 公式：flip around center → rotate around center → translate(tx,ty)。
 */
export declare function applyNodeTransform(s: XfrmNode, x: number, y: number): {
    x: number;
    y: number;
};
/** 缩放手柄的对侧锚点（该点在世界坐标里应保持不动）。 */
export declare function oppositeHandlePoint(b: Rect, corner: string): {
    x: number;
    y: number;
};
/**
 * 旋转 / 翻转后改 bbox 会移动旋转中心，视觉上整块形状会滑走。
 * 平移 next，让对侧手柄的世界坐标与 start 时一致。
 */
export declare function keepOppositeHandleWorld(transform: Transform | undefined, start: Rect, next: Rect, corner: string): Rect;
/**
 * 把世界坐标点重新编码回「未旋转局部点 + 绕 bbox 中心的 rot/flip」。
 * 改线/多边形锚点后 bbox 中心会变；不重编码的话旋转枢轴一移，整段形状就跳。
 */
export declare function relocalizeWorldPoints(worldPts: Array<[number, number]>, transform: Transform | undefined): {
    points: Array<[number, number]>;
    bbox: Rect;
};
/** 祖先 group 的累计翻转奇偶性（不含 shape 自身）。 */
export declare function ancestorFlipParity(ancestors: readonly Shape[]): {
    x: number;
    y: number;
};
/**
 * 单个 shape 的 SVG transform 属性片段，坐标系 = slide。
 * 与 svg-backend redraw 写到 <g> 上的公式一致。
 */
export declare function nodeSvgTransform(s: Shape): string;
/** 从外到内拼接 ancestors + self，给选中框用。 */
export declare function composeSvgTransforms(shapes: readonly Shape[]): string;
export interface OverlayBoxGeom {
    left: number;
    top: number;
    width: number;
    height: number;
    rotation: number;
}
/**
 * 行内 overlay 的 CSS transform。
 *
 * 无祖先时保持 `rotate(Ndeg)` + origin center，和旧行为字节级一致。
 * 有祖先 group 时改成 origin 0 0 的变换链：先自身旋转（含 bodyRot/vert），
 * 再按祖先 flip 绕 overlay 中心反向一次（字形保持可读，与 netFlipParity 一致），
 * 最后套上每个祖先绕**自己中心**的 rotate/flip/tx/ty。
 */
export declare function overlayWorldTransformCss(box: OverlayBoxGeom, scale: number, ancestors?: readonly Shape[]): {
    css: string;
    origin: "center center" | "0 0";
};
