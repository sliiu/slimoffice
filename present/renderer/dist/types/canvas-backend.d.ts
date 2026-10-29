import type { Shape } from "@sliiu/present-core";
import { type Scene } from "./scene-node.js";
export interface CanvasBackendOptions {
    shapeFilter?: (s: Shape) => boolean;
    transparent?: boolean;
    /** Offscreen export: override `devicePixelRatio` (e.g. PDF at 150 DPI → 150/96). */
    pixelRatio?: number;
}
export declare class CanvasBackend {
    readonly canvas: HTMLCanvasElement;
    private ctx;
    private scene;
    private dpr;
    private rafId;
    private dispose;
    private shapeFilter;
    private transparent;
    /** 给文字 3D 正面贴图用：画字形，不把已经烘好的 PNG 再画一遍。 */
    private drawingFront;
    private arrowProbe?;
    constructor(scene: Scene, container: HTMLElement, opts?: CanvasBackendOptions);
    resize(w: number, h: number): void;
    private scheduleRedraw;
    /** 同步刷新到 canvas，并取消 pending rAF。详见 SvgBackend.flush。 */
    flush(): void;
    private redraw;
    private drawNode;
    private applyClip;
    private drawShape;
    /** Canvas 导出 / 缩略图：audio 无 DOM；video 无 poster 且第一帧未就绪时画占位图标。 */
    private drawMediaPlaceholder;
    private drawArrowheads;
    private drawOneArrow;
    private measurePathEnds;
    private drawText;
    /**
     * 单行艺术字的墨迹框。多段、项目符号、竖排不在这里估，那些仍走 SVG 的 getBBox。
     * 估算必须和 drawTextHorizontal 的顶对齐 / 居中公式一致，否则拉伸会把字拽偏。
     */
    private measureCanvasWordArt;
    private drawTextWarped;
    private drawTextHorizontal;
    private drawWrappedParagraphCanvas;
    private drawTextStacked;
    private runFillStyle;
    private fillTextWithOutline;
    private drawBullet;
    private drawRunsWithCharOverrides;
    private roundRect;
    /** 按未旋转的 bbox 把这个 shape 画到一张独立画布，左上角对齐 bbox 原点。 */
    renderShapeFront(shapeId: string): HTMLCanvasElement | null;
    destroy(): void;
}
/** 离屏把一个 shape 的正面画成画布。调用方负责不再使用返回的 canvas 之后的生命周期。 */
export declare function rasterizeShapeFront(scene: Scene, shapeId: string): HTMLCanvasElement | null;
