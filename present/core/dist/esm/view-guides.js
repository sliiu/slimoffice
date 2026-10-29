/** ECMA-376 §19.2.2.11 `p:guide` — `pos` 用旧 PPT 母版单位：每英寸 576。 */
export const GUIDE_UNITS_PER_INCH = 576;
const EMU_PER_INCH = 914400;
const EMU_PER_PX = 9525;
export function guidePosToPx(pos) {
    return (pos * EMU_PER_INCH) / GUIDE_UNITS_PER_INCH / EMU_PER_PX;
}
export function pxToGuidePos(px) {
    return Math.round((px * EMU_PER_PX * GUIDE_UNITS_PER_INCH) / EMU_PER_INCH);
}
function sortedGuides(guides) {
    return [...(guides ?? [])]
        .map((g) => ({ orient: g.orient, pos: g.pos }))
        .sort((a, b) => a.orient.localeCompare(b.orient) || a.pos - b.pos);
}
export function viewGuidesSnapshot(g) {
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
export function viewGuidesHasContent(g) {
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
