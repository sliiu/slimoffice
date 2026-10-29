"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GUIDE_UNITS_PER_INCH = void 0;
exports.guidePosToPx = guidePosToPx;
exports.pxToGuidePos = pxToGuidePos;
exports.viewGuidesSnapshot = viewGuidesSnapshot;
exports.viewGuidesHasContent = viewGuidesHasContent;
/** ECMA-376 §19.2.2.11 `p:guide` — `pos` 用旧 PPT 母版单位：每英寸 576。 */
exports.GUIDE_UNITS_PER_INCH = 576;
const EMU_PER_INCH = 914400;
const EMU_PER_PX = 9525;
function guidePosToPx(pos) {
    return (pos * EMU_PER_INCH) / exports.GUIDE_UNITS_PER_INCH / EMU_PER_PX;
}
function pxToGuidePos(px) {
    return Math.round((px * EMU_PER_PX * exports.GUIDE_UNITS_PER_INCH) / EMU_PER_INCH);
}
function sortedGuides(guides) {
    return [...(guides ?? [])]
        .map((g) => ({ orient: g.orient, pos: g.pos }))
        .sort((a, b) => a.orient.localeCompare(b.orient) || a.pos - b.pos);
}
function viewGuidesSnapshot(g) {
    if (!g)
        return "";
    return JSON.stringify({
        slide: sortedGuides(g.slide),
        notes: g.notes?.length ? sortedGuides(g.notes) : undefined,
        showGuides: g.showGuides,
        snapToGrid: g.snapToGrid,
        snapToObjects: g.snapToObjects,
        gridSpacing: g.gridSpacing,
    });
}
function viewGuidesHasContent(g) {
    if (!g)
        return false;
    if (g.slide.length)
        return true;
    if (g.notes?.length)
        return true;
    if (g.showGuides || g.snapToGrid || g.snapToObjects)
        return true;
    if (g.gridSpacing)
        return true;
    return false;
}
