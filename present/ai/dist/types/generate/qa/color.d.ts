export interface Rgb {
    r: number;
    g: number;
    b: number;
}
/** 解析 #rgb / #rrggbb（大小写均可）。无法解析返回 null。 */
export declare function parseHex(input: string | undefined): Rgb | null;
/** Rgb → #rrggbb（小写）。 */
export declare function toHex(rgb: Rgb): string;
/** WCAG 相对亮度 0..1。 */
export declare function relativeLuminance(rgb: Rgb): number;
/** WCAG 对比度 1..21。 */
export declare function contrastRatio(a: Rgb, b: Rgb): number;
export declare const SAFE_TEXT_DARK = "#0f172a";
export declare const SAFE_TEXT_LIGHT = "#f8fafc";
export declare const WCAG_LARGE_TEXT_CONTRAST = 3;
export declare const WCAG_BODY_TEXT_CONTRAST = 4.5;
/** 根据底色亮度选一个高对比度的兜底文字色。 */
export declare function readableTextColor(bg: Rgb): string;
/** 线性插值两色，t=0 → a，t=1 → b。 */
export declare function mixRgb(a: Rgb, b: Rgb, t: number): Rgb;
/**
 * 把 `color` 朝 `target` 方向逐步靠拢，直到相对 `bg` 的对比度 ≥ `min`。
 * 用于把「对底色太浅」的次要文字色拉到达标，同时尽量保留原色调（小步逼近）。
 * 若走到 target 仍不达标（几乎不可能，target 应是高对比色），返回 target。
 */
export declare function ensureContrast(color: Rgb, bg: Rgb, target: Rgb, min: number): Rgb;
