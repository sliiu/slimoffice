export function cellHasPerSideBorders(s) {
    const b = s.cellMeta?.borders;
    return !!b && !!(b.l || b.r || b.t || b.b || b.tl2br || b.bl2tr);
}
export function cellBorderSegments(bbox, borders) {
    const { x, y, w, h } = bbox;
    const out = [];
    if (borders.l)
        out.push({ x1: x, y1: y, x2: x, y2: y + h, stroke: borders.l });
    if (borders.r)
        out.push({ x1: x + w, y1: y, x2: x + w, y2: y + h, stroke: borders.r });
    if (borders.t)
        out.push({ x1: x, y1: y, x2: x + w, y2: y, stroke: borders.t });
    if (borders.b)
        out.push({ x1: x, y1: y + h, x2: x + w, y2: y + h, stroke: borders.b });
    if (borders.tl2br)
        out.push({ x1: x, y1: y, x2: x + w, y2: y + h, stroke: borders.tl2br });
    if (borders.bl2tr)
        out.push({ x1: x, y1: y + h, x2: x + w, y2: y, stroke: borders.bl2tr });
    return out;
}
