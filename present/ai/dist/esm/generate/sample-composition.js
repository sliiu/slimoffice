// 样稿：本地解析出构图说明。原文、备注和图表数字不进说明。
export class SampleDeckError extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = "SampleDeckError";
        this.code = code;
    }
}
const MAX_SHAPES = 24;
export function compositionDigest(pres) {
    if (!pres.slides.length)
        throw new SampleDeckError("empty");
    const w = pres.size?.width || 1;
    const h = pres.size?.height || 1;
    const pages = pres.slides.map((slide, index) => describeSlide(slide, index, w, h));
    return [`canvas ${Math.round(w)}x${Math.round(h)}`, ...pages].join("\n");
}
export function sampleOutlineRule(digest) {
    return [
        "SAMPLE COMPOSITION is the density of the deck. Match how full or empty each page is.",
        "The record has no source words. Do not invent wording from it. Facts come from the topic and the source material.",
        "Do not follow a skill visual system. The sample is the only visual source.",
        "",
        "SAMPLE COMPOSITION:",
        digest,
    ].join("\n");
}
/** 版式上已有文字占位符时，页上那一层只约束大纲疏密，不改占位符，不搬装饰。 */
export function sampleDensityRule(digest) {
    return [
        "PAGE DENSITY is how full or empty each page of the uploaded deck is. Match that fullness in the outline: fewer bullets on sparse pages, more on full ones.",
        "The record has no source words. Do not invent wording from it. Facts come from the topic and the source material.",
        "Do not add shapes, move placeholders, or copy decoration. The layout template already places those.",
        "",
        "PAGE DENSITY:",
        digest,
    ].join("\n");
}
export function sampleCanvasRule() {
    return [
        "A sample composition is attached. It wins over any visual system named by a skill.",
        "Match its placement, density, and decoration. Words come from the page brief.",
        "systemId is still required: pick the nearest scaffold, then set palette hex from the sample's colors.",
    ].join("\n");
}
/** 有幻灯片就把构图说明挂上模板；没有幻灯片则原样返回，不当作失败。 */
export function withPageComposition(template, pres) {
    try {
        return { ...template, composition: compositionDigest(pres) };
    }
    catch (e) {
        if (e instanceof SampleDeckError && e.code === "empty")
            return template;
        throw e;
    }
}
function describeSlide(slide, index, w, h) {
    const shapes = flatten(slide.layers?.flatMap((layer) => layer.shapes) ?? []).filter((shape) => shape.visible !== false);
    const shown = shapes.slice(0, MAX_SHAPES);
    const lines = shown.map((shape) => describeShape(shape, w, h));
    if (shapes.length > shown.length)
        lines.push(`+${shapes.length - shown.length} more`);
    const textBlocks = shapes.filter((shape) => shape.kind === "text").length;
    const cover = Math.min(100, Math.round((area(shapes) / (w * h)) * 100));
    const bg = paintBrief(slide.background);
    return [`page ${index + 1}${bg ? ` bg ${bg}` : ""} density text=${textBlocks} cover=${cover}%`, ...lines].join("\n");
}
function flatten(shapes) {
    const out = [];
    for (const shape of shapes) {
        if (shape.kind === "group") {
            if (shape.fill && shape.fill.kind !== "none")
                out.push(shape);
            out.push(...flatten(shape.children));
        }
        else {
            out.push(shape);
        }
    }
    return out;
}
function describeShape(shape, w, h) {
    const box = pctBox(shape.bbox, w, h);
    const fill = paintBrief(shape.fill);
    if (shape.kind === "text") {
        const text = shape;
        const role = text.placeholder?.type || "text";
        const size = text.paragraphs?.[0]?.runs?.[0]?.fontSize;
        const lines = text.paragraphs?.length ?? 0;
        return [box, role, size ? `${Math.round(size)}px` : "", `${lines} lines`, fill].filter(Boolean).join(" ");
    }
    if (shape.kind === "chart")
        return [box, `chart ${shape.chart.type}`, fill].filter(Boolean).join(" ");
    if (shape.kind === "image")
        return [box, "image", fill].filter(Boolean).join(" ");
    return [box, shape.kind, fill].filter(Boolean).join(" ");
}
function pctBox(bbox, w, h) {
    if (!bbox)
        return "at ?";
    const p = (n, total) => Math.round((n / total) * 100);
    return `at ${p(bbox.x, w)},${p(bbox.y, h)} ${p(bbox.w, w)}x${p(bbox.h, h)}`;
}
function area(shapes) {
    return shapes.reduce((sum, shape) => sum + Math.max(0, shape.bbox?.w ?? 0) * Math.max(0, shape.bbox?.h ?? 0), 0);
}
function paintBrief(paint) {
    if (!paint || paint.kind === "none")
        return "";
    if (paint.kind === "solid") {
        const alpha = paint.alpha != null && paint.alpha < 1 ? ` a${paint.alpha}` : "";
        return `solid ${paint.color}${alpha}`;
    }
    if (paint.kind === "linear" || paint.kind === "radial") {
        return `${paint.kind} ${paint.stops[0]?.color ?? ""}`.trim();
    }
    if (paint.kind === "image")
        return "image";
    return paint.kind;
}
