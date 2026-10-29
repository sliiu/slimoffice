import type { ImagePaint, Rect, Shape } from "@sliiu/present-core";
/** OOXML `a:srcRect`：从源图四边裁掉的比例。负数表示窗口伸出画面。 */
export interface CropInsets {
    l: number;
    t: number;
    r: number;
    b: number;
}
export declare const ZERO_CROP: CropInsets;
export type CropHost = "frame" | "fill";
/** 有外框、外框就是露出窗口的对象。平铺填充、音频、组合没有这个窗口。 */
export declare function cropHost(shape: Shape): CropHost | null;
export declare function readCrop(shape: Shape): CropInsets;
export declare function cropPreviewSrc(shape: Shape): string | undefined;
export declare function clearedCrop(crop: CropInsets): boolean;
export declare function sameCrop(a: CropInsets, b: CropInsets): boolean;
export declare function sameRect(a: Rect, b: Rect): boolean;
/** 画面在幻灯片上的整张矩形。窗口变，这块不变，像素大小就不变。 */
export declare function imageFrame(window: Rect, crop: CropInsets): Rect;
/**
 * 整张画面比幻灯片内容区还大时，按比例缩小并挪进内容区。四周留 `margin`。
 * 宽高都放得下则不动，哪怕画面贴在幻灯片外边。
 */
export declare function fitPictureToSlide(image: Rect, slideW: number, slideH: number, margin?: number): Rect | null;
/** 进入裁剪时用的窗口。画面放得下则返回 null。裁切比例不变。 */
export declare function fittedCropWindow(shape: Shape, slideW: number, slideH: number): Rect | null;
export declare function windowFromImage(image: Rect, crop: CropInsets): Rect;
export declare function cropFromFrames(image: Rect, window: Rect): CropInsets;
/** 拖画面一角。对侧角钉住，宽高同一比例。窗口不在这里改。 */
export declare function scalePictureFromCorner(image: Rect, corner: string, dx: number, dy: number): Rect;
/** 拖窗口的一边或一角。对边钉住，边不能互相穿过。 */
export declare function resizeCropWindow(start: Rect, corner: string, dx: number, dy: number): Rect;
/** 属性栏改一条边：画面矩形不动，窗口跟着收放。 */
export declare function setCropEdge(window: Rect, crop: CropInsets, edge: keyof CropInsets, value: number): {
    window: Rect;
    crop: CropInsets;
};
export declare function assignCrop(shape: Shape, crop: CropInsets, fit?: ImagePaint["fit"]): void;
export declare function pointInRect(x: number, y: number, r: Rect): boolean;
