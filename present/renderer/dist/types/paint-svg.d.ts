import type { Paint, Stroke } from "@sliiu/present-core";
export interface PaintAttrs {
    paint: string;
    opacity?: number;
    defNode?: SVGElement;
    defId?: string;
}
/**
 * shapeHint：承载该填充的形状轮廓类别，仅影响 gradFill path="shape" 的解释
 * （ECMA-376 §20.1.8.30 <a:path path="shape"> = 渐变等值线沿形状轮廓）——
 * 矩形轮廓走精确的"矩形框带"渲染，椭圆等其它轮廓走椭圆 radial 近似。
 */
export declare function renderPaint(paint: Paint | undefined, defs: SVGDefsElement, bbox?: {
    x: number;
    y: number;
    w: number;
    h: number;
}, onAsset?: () => void, shapeHint?: "rect" | "ellipse" | "other"): PaintAttrs;
export declare function applyStroke(el: SVGGraphicsElement, stroke: Stroke | undefined, defs: SVGDefsElement, idPrefix?: string): void;
