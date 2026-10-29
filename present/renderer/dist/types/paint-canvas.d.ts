import type { Paint, Rect, Stroke } from "@sliiu/present-core";
export declare function getImage(src: string, onLoad?: () => void): HTMLImageElement;
/**
 * 等待 imageCache 里所有尚未落定的图片 load/error 完成。
 *
 * 截图 / PDF 导出前必须调用：CanvasBackend（以及 image-paint 填充）只在
 * `img.complete && naturalWidth > 0` 时才 drawImage，否则静默跳过。导出时若不等待图片
 * 解码完成，就会随机丢图——同一份 deck 先后导出 PNG / PDF 结果不一致正是这个原因。
 *
 * 调用前应先让 backend 跑过一次绘制（flush），把所有 src 注册进 imageCache 并开始加载。
 * 每张图带超时兜底，避免坏链 / 慢图把导出永久卡死。
 */
export declare function waitForImagesLoaded(timeoutMs?: number): Promise<void>;
/**
 * shapeHint：承载填充的形状轮廓类别，仅影响 gradFill path="shape"（等值线沿轮廓）
 * 的解释——矩形轮廓走精确的"矩形框带"pattern，其它轮廓退回径向近似。
 */
export declare function paintToCanvasStyle(ctx: CanvasRenderingContext2D, paint: Paint | undefined, bbox: Rect, onAsset?: () => void, shapeHint?: "rect" | "ellipse" | "other"): string | CanvasGradient | CanvasPattern;
export declare function adjustImage(img: HTMLImageElement, adj: import("@sliiu/present-core").ImageColorAdjust): HTMLCanvasElement;
/** 图片已加载时返回调色后的 data URL，供 SVG `<image href>` 使用。 */
export declare function rasterizedAdjustHref(src: string, adj: import("@sliiu/present-core").ImageColorAdjust, onLoad?: () => void): string | undefined;
export declare function applyStroke(ctx: CanvasRenderingContext2D, stroke: Stroke | undefined, bbox: Rect, onAsset?: () => void): boolean;
