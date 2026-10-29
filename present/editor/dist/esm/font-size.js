const PX_PER_PT = 96 / 72;
export const MIN_FONT_PT = 6;
export const MAX_FONT_PT = 96;
export const DEFAULT_FONT_PT = 18;
export function ptToPx(pt) {
    return pt * PX_PER_PT;
}
export function pxToPt(px) {
    return px / PX_PER_PT;
}
export function formatFontPt(px) {
    const pt = Math.round(pxToPt(px) * 100) / 100;
    return String(pt);
}
export function fontPxFromPt(pt, min = MIN_FONT_PT, max = MAX_FONT_PT) {
    return ptToPx(Math.min(max, Math.max(min, pt)));
}
