/** Structure compare — ignores ColorTheme tokens. */
export function structureOf(slides) {
    return slides.map((s) => ({
        layout: s.layout,
        variant: s.variant,
        elements: s.elements.map((e) => ({
            name: e.name,
            kind: e.kind,
            x: round(e.bbox.x),
            y: round(e.bbox.y),
            w: round(e.bbox.w),
            h: round(e.bbox.h),
        })),
    }));
}
function round(n) {
    return Math.round(n * 100) / 100;
}
export function structureEqual(a, b) {
    return JSON.stringify(structureOf(a)) === JSON.stringify(structureOf(b));
}
export function structureDiff(a, b) {
    const left = structureOf(a);
    const right = structureOf(b);
    if (JSON.stringify(left) === JSON.stringify(right))
        return "";
    return `structure mismatch:\nA=${JSON.stringify(left)}\nB=${JSON.stringify(right)}`;
}
