"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageChromeBackground = stageChromeBackground;
/**
 * CSS background for the stage / hybrid wrapper chrome around the scene.
 * When the slide has a painted background, createScene injects a full-slide
 * __bg_* shape — a second opaque underlay would show through image alpha or
 * mask gradient edges. Use white only when the slide has no background paint.
 */
function stageChromeBackground(slide) {
    const bg = slide?.background;
    if (!bg || bg.kind === "none")
        return "#ffffff";
    return "transparent";
}
