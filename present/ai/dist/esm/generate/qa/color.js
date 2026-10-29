// 共享颜色 / 对比度工具（WCAG 2.x relative luminance + contrast ratio）。
//
// 抽出来给两处复用，避免颜色数学各写一份漂移：
//   - qa/validate.ts：生成后 per-slide 文字对比度修复
//   - themes.ts realizeGeneratedTheme：AI 主题 palette 源头对比度兜底（#5）
//
// 兜底文字色与 ppt-visual-design.md / ppt-design-rules.mdc §7 保持一致。
/** 解析 #rgb / #rrggbb（大小写均可）。无法解析返回 null。 */
export function parseHex(input) {
    if (!input)
        return null;
    let s = input.trim();
    if (s.startsWith("#"))
        s = s.slice(1);
    if (s.length === 3) {
        s = s
            .split("")
            .map((c) => c + c)
            .join("");
    }
    if (s.length !== 6 || /[^0-9a-fA-F]/.test(s))
        return null;
    return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
    };
}
/** Rgb → #rrggbb（小写）。 */
export function toHex(rgb) {
    const h = (n) => Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, "0");
    return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}
function srgbChannel(c) {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
/** WCAG 相对亮度 0..1。 */
export function relativeLuminance(rgb) {
    return 0.2126 * srgbChannel(rgb.r) + 0.7152 * srgbChannel(rgb.g) + 0.0722 * srgbChannel(rgb.b);
}
/** WCAG 对比度 1..21。 */
export function contrastRatio(a, b) {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
}
// 规范里的两个兜底文字色（与 ppt-visual-design.md / ppt-design-rules.mdc 一致）。
export const SAFE_TEXT_DARK = "#0f172a"; // 用于亮底
export const SAFE_TEXT_LIGHT = "#f8fafc"; // 用于暗底
// WCAG AA 对比度阈值（单一事实源）：
//   - 大字（标题 / 大数字）≥3.0；正文 ≥4.5。
// validate.ts 的默认阈值、art-director 的 recolor 门槛、art-director rubric 文案都引用这两个常量，
// 保证"生成时兜底"和"验收时打分"用同一把尺。
export const WCAG_LARGE_TEXT_CONTRAST = 3.0;
export const WCAG_BODY_TEXT_CONTRAST = 4.5;
/** 根据底色亮度选一个高对比度的兜底文字色。 */
export function readableTextColor(bg) {
    return relativeLuminance(bg) > 0.5 ? SAFE_TEXT_DARK : SAFE_TEXT_LIGHT;
}
/** 线性插值两色，t=0 → a，t=1 → b。 */
export function mixRgb(a, b, t) {
    const k = Math.max(0, Math.min(1, t));
    return {
        r: a.r + (b.r - a.r) * k,
        g: a.g + (b.g - a.g) * k,
        b: a.b + (b.b - a.b) * k,
    };
}
/**
 * 把 `color` 朝 `target` 方向逐步靠拢，直到相对 `bg` 的对比度 ≥ `min`。
 * 用于把「对底色太浅」的次要文字色拉到达标，同时尽量保留原色调（小步逼近）。
 * 若走到 target 仍不达标（几乎不可能，target 应是高对比色），返回 target。
 */
export function ensureContrast(color, bg, target, min) {
    if (contrastRatio(color, bg) >= min)
        return color;
    for (let t = 0.15; t < 1; t += 0.15) {
        const c = mixRgb(color, target, t);
        if (contrastRatio(c, bg) >= min)
            return c;
    }
    return target;
}
