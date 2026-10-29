import { genShapeId } from "./shape-factory.js";
function deepClone(v) {
    if (typeof structuredClone === "function")
        return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}
export function findMainLayer(slide) {
    return (slide.layers.find((l) => l.id === "main" || l.id === "layer_main") ??
        slide.layers[slide.layers.length - 1]);
}
export function resolveSlideMaster(pres, slide) {
    const masterId = slide.layoutRef?.masterId ?? pres.masters?.[0]?.id;
    if (!masterId)
        return undefined;
    return pres.masters?.find((m) => m.id === masterId);
}
export function resolveSlideLayout(pres, slide) {
    const master = resolveSlideMaster(pres, slide);
    if (!master?.layouts?.length)
        return undefined;
    const layoutId = slide.layoutRef?.layoutId;
    if (layoutId) {
        const exact = master.layouts.find((l) => l.id === layoutId);
        if (exact)
            return exact;
    }
    return master.layouts[0];
}
export function listLayoutsForSlide(pres, slide) {
    const master = resolveSlideMaster(pres, slide);
    if (!master?.layouts?.length)
        return [];
    return master.layouts.map((l) => ({
        masterId: master.id,
        layoutId: l.id,
        name: l.name || l.type || l.id,
        type: l.type,
    }));
}
function reIdShapeTree(shape) {
    shape.id = genShapeId("ph");
    if (shape.kind === "group") {
        for (const child of shape.children)
            reIdShapeTree(child);
    }
}
/** Clone placeholder shapes from a layout with fresh ids (for slide reset / layout switch). */
export function cloneLayoutPlaceholders(layout) {
    return (layout.shapes ?? [])
        .filter((s) => s.placeholder)
        .map((s) => {
        const copy = deepClone(s);
        reIdShapeTree(copy);
        return copy;
    });
}
export function replaceSlideMainShapes(slide, shapes) {
    const main = findMainLayer(slide);
    if (!main)
        return;
    main.shapes = shapes;
}
export function syncRawMainShapes(slide, shapes) {
    if (!slide.__source)
        return;
    slide.__source.rawMainShapes = shapes.map((s) => deepClone(s));
}
