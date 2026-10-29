"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_VARIANT_OPTIONS = void 0;
exports.shiftBackgroundColor = shiftBackgroundColor;
exports.variantPreviewSwatch = variantPreviewSwatch;
exports.applyThemeVariant = applyThemeVariant;
exports.THEME_VARIANT_OPTIONS = [
    { id: "subtle", labelKey: "themeVariant.subtle", swatch: "#94a3b8" },
    { id: "bold", labelKey: "themeVariant.bold", swatch: "#2563eb" },
    { id: "warm", labelKey: "themeVariant.warm", swatch: "#ea580c" },
    { id: "cool", labelKey: "themeVariant.cool", swatch: "#0891b2" },
];
function clamp(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
}
function parseHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m)
        return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r, g, b) {
    return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}
function mix(a, b, t) {
    return a + (b - a) * t;
}
function mapColor(hex, fn) {
    const rgb = parseHex(hex);
    if (!rgb)
        return hex;
    const [r, g, b] = fn(rgb[0], rgb[1], rgb[2]);
    return toHex(r, g, b);
}
function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min)
        return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === rn)
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn)
        h = (bn - rn) / d + 2;
    else
        h = (rn - gn) / d + 4;
    return [h / 6, s, l];
}
function hueToRgb(p, q, t) {
    let x = t;
    if (x < 0)
        x += 1;
    if (x > 1)
        x -= 1;
    if (x < 1 / 6)
        return p + (q - p) * 6 * x;
    if (x < 1 / 2)
        return q;
    if (x < 2 / 3)
        return p + (q - p) * (2 / 3 - x) * 6;
    return p;
}
function hslToRgb(h, s, l) {
    const sat = Math.max(0, Math.min(1, s));
    const lit = Math.max(0, Math.min(1, l));
    if (sat === 0) {
        const v = lit * 255;
        return [v, v, v];
    }
    const q = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat;
    const p = 2 * lit - q;
    return [hueToRgb(p, q, h + 1 / 3) * 255, hueToRgb(p, q, h) * 255, hueToRgb(p, q, h - 1 / 3) * 255];
}
function mapHsl(hex, fn) {
    const rgb = parseHex(hex);
    if (!rgb)
        return hex;
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const [nh, ns, nl] = fn(h, s, l);
    const [r, g, b] = hslToRgb(nh, ns, nl);
    return toHex(r, g, b);
}
/** 柔和：饱和度下降，并往浅灰靠，不是单纯变亮。 */
function shiftSoft(hex) {
    return mapHsl(hex, (h, s, l) => [h, s * 0.4, l + (0.78 - l) * 0.42]);
}
/** 鲜明：饱和度拉高。若色相把观感压暗，再往亮提，直到不比原来暗。 */
function shiftVivid(hex) {
    const src = perceived(hex);
    let out = mapHsl(hex, (h, s, l) => [h, 1 - (1 - s) * 0.32, Math.min(0.7, l + 0.06)]);
    for (let i = 0; i < 8 && perceived(out) + 1 < src; i++) {
        out = mapColor(out, (r, g, b) => [mix(r, 255, 0.14), mix(g, 255, 0.14), mix(b, 255, 0.14)]);
    }
    return out;
}
function perceived(hex) {
    const rgb = parseHex(hex);
    if (!rgb)
        return 0;
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}
const ACCENT_KEYS = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
const BACKGROUND_KEYS = ["bg", "bg1", "bg2", "bgAlt", "divider", "lt1", "lt2", "dk1", "dk2"];
/** Shift a theme-canvas color (background, decoration) so the variant is visible on the slide. */
function shiftBackgroundColor(hex, variant) {
    switch (variant) {
        case "subtle":
            return shiftSoft(hex);
        case "bold":
            return shiftVivid(hex);
        case "warm":
            return mapColor(hex, (r, g, b) => [mix(r, 180, 0.45), mix(g, 72, 0.28), mix(b, 32, 0.35)]);
        case "cool":
            return mapColor(hex, (r, g, b) => [mix(r, 16, 0.4), mix(g, 96, 0.35), mix(b, 140, 0.5)]);
    }
}
function shiftAccentColor(hex, variant) {
    switch (variant) {
        case "subtle":
            return shiftSoft(hex);
        case "bold":
            return shiftVivid(hex);
        case "warm":
            return mapColor(hex, (r, g, b) => [mix(r, 234, 0.45), mix(g, 88, 0.28), mix(b, 12, 0.22)]);
        case "cool":
            return mapColor(hex, (r, g, b) => [mix(r, 8, 0.28), mix(g, 145, 0.4), mix(b, 178, 0.42)]);
    }
}
/** Color chip for a variant: the theme canvas color after that shift, not a fixed swatch. */
function variantPreviewSwatch(colors, variant) {
    const base = colors.bg || colors.bg1 || colors.bg2 || colors.bgAlt || "#808080";
    return shiftBackgroundColor(base, variant);
}
/** Derive a color-scheme variant from the deck theme colors. Text slots stay put. */
function applyThemeVariant(colors, variant) {
    const next = { ...colors };
    for (const k of ACCENT_KEYS) {
        if (next[k])
            next[k] = shiftAccentColor(next[k], variant);
    }
    for (const k of BACKGROUND_KEYS) {
        if (next[k])
            next[k] = shiftBackgroundColor(next[k], variant);
    }
    return next;
}
