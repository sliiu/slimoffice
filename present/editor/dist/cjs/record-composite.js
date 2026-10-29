"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIP_WIDTH_FRACTION = void 0;
exports.computePipDrawRect = computePipDrawRect;
exports.formatPipDrawRectLine = formatPipDrawRectLine;
/** PIP width as a fraction of the composite canvas (screen recording). */
exports.PIP_WIDTH_FRACTION = {
    s: 0.18,
    m: 0.22,
    l: 0.28,
};
/** Bottom-right PIP placement for screen+camera composite recording. */
function computePipDrawRect(canvasW, canvasH, prefs) {
    const size = prefs?.size ?? "m";
    const corner = prefs?.corner ?? "br";
    const w = Math.round(canvasW * exports.PIP_WIDTH_FRACTION[size]);
    const h = Math.round(w * 0.75);
    const pad = 16;
    let x;
    let y;
    switch (corner) {
        case "tl":
            x = pad;
            y = pad;
            break;
        case "tr":
            x = canvasW - w - pad;
            y = pad;
            break;
        case "bl":
            x = pad;
            y = canvasH - h - pad;
            break;
        default:
            x = canvasW - w - pad;
            y = canvasH - h - pad;
    }
    return {
        x,
        y,
        w,
        h,
        mirror: prefs?.mirror !== false,
    };
}
/** Plain-text summary of composite PIP draw rect. */
function formatPipDrawRectLine(rect) {
    const mirror = rect.mirror ? " · mirrored" : "";
    return `${rect.w}×${rect.h} @ (${rect.x}, ${rect.y})${mirror}`;
}
