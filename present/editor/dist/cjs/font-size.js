"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_FONT_PT = exports.MAX_FONT_PT = exports.MIN_FONT_PT = void 0;
exports.ptToPx = ptToPx;
exports.pxToPt = pxToPt;
exports.formatFontPt = formatFontPt;
exports.fontPxFromPt = fontPxFromPt;
const PX_PER_PT = 96 / 72;
exports.MIN_FONT_PT = 6;
exports.MAX_FONT_PT = 96;
exports.DEFAULT_FONT_PT = 18;
function ptToPx(pt) {
    return pt * PX_PER_PT;
}
function pxToPt(px) {
    return px / PX_PER_PT;
}
function formatFontPt(px) {
    const pt = Math.round(pxToPt(px) * 100) / 100;
    return String(pt);
}
function fontPxFromPt(pt, min = exports.MIN_FONT_PT, max = exports.MAX_FONT_PT) {
    return ptToPx(Math.min(max, Math.max(min, pt)));
}
