import type { Paint, Shape, TextRun } from "@sliiu/present-core";
export interface FillSnap {
    shape: Shape;
    prev: Paint | undefined;
}
export interface RunColorSnap {
    run: TextRun;
    prev: string | undefined;
    /** 纯色文字填充。渐变 / 图片字面不在这里改。 */
    prevFill?: Paint;
}
/** 画面上的字色：纯色 `run.fill` 盖过 `run.color`。 */
export declare function paintedTextColor(run: {
    color?: string;
    fill?: Paint;
} | undefined): string | undefined;
export declare function captureFills(shapes: Shape[]): FillSnap[];
export declare function writeFills(snaps: FillSnap[], paint: Paint | undefined): void;
export declare function restoreFills(snaps: FillSnap[]): void;
export declare function captureRunColors(runs: TextRun[]): RunColorSnap[];
export declare function writeRunColors(snaps: RunColorSnap[], color: string): void;
export declare function restoreRunColors(snaps: RunColorSnap[]): void;
/** `#rgb` / `#rrggbb` → `#rrggbb`。其它写法色块控件吃不进去。 */
export declare function solidHex(color: string | undefined): string | null;
/**
 * 把纯色写到形状自己的图形上。文本框只改背景矩形，不改字形。
 * 渐变等非纯色返回 false，调用方应整页 flush。
 */
export declare function patchSolidFill(root: ParentNode, shapeId: string, paint: Paint | undefined): boolean;
/** 把文字色写到该形状里的 text / tspan 上，不动背景矩形。 */
export declare function patchTextColor(root: ParentNode, shapeId: string, color: string): boolean;
/** 拖动中让另一侧没在操作的色块跟上。正在拖的那颗跳过，避免打断系统取色器。 */
export declare function syncLiveColorInputs(doc: Document, slot: string, color: string): void;
