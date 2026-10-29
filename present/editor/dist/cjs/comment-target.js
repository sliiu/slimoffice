"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shapeAtPoint = shapeAtPoint;
exports.commentShapeLabel = commentShapeLabel;
exports.commentShapeCaption = commentShapeCaption;
const i18n_1 = require("./i18n");
const shape_transform_1 = require("./shape-transform");
/** 点在形状上时，批注记下的那个形状。装饰层（dec_）不算。 */
function shapeAtPoint(slide, x, y) {
    for (let li = slide.layers.length - 1; li >= 0; li--) {
        const layer = slide.layers[li];
        if (!layer || layer.visible === false)
            continue;
        for (let si = layer.shapes.length - 1; si >= 0; si--) {
            const hit = hitLeaf(layer.shapes[si], x, y);
            if (hit && !hit.id.startsWith("dec_"))
                return hit;
        }
    }
    return undefined;
}
function hitLeaf(s, x, y) {
    if (s.visible === false)
        return undefined;
    const p = (0, shape_transform_1.inverseNodeTransform)(s, x, y);
    if (s.kind === "group") {
        for (let i = s.children.length - 1; i >= 0; i--) {
            const hit = hitLeaf(s.children[i], p.x, p.y);
            if (hit)
                return hit;
        }
        return undefined;
    }
    const b = s.bbox;
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)
        return s;
    return undefined;
}
const shapeKindKey = {
    group: "comments.shape.group",
    rect: "comments.shape.rect",
    ellipse: "comments.shape.ellipse",
    path: "comments.shape.path",
    text: "comments.shape.text",
    image: "comments.shape.image",
    line: "comments.shape.line",
    polygon: "comments.shape.polygon",
    chart: "comments.shape.chart",
    video: "comments.shape.video",
    audio: "comments.shape.audio",
    ole: "comments.shape.ole",
    model3d: "comments.shape.model3d",
    webEmbed: "comments.shape.webEmbed",
};
/** 卡片和新建对话框上的那一行：有正文就用正文，否则是「类型 · 名称」。 */
function commentShapeLabel(shape) {
    const cap = commentShapeCaption(shape);
    const kindLabel = (0, i18n_1.t)(shapeKindKey[cap.kind]);
    if (cap.text)
        return cap.text;
    if (cap.name)
        return `${kindLabel} · ${cap.name}`;
    return kindLabel;
}
/** 卡片上用来认出这个形状的材料：正文优先，否则用名称。 */
function commentShapeCaption(shape) {
    if (shape.kind === "text") {
        const text = textOf(shape).replace(/\s+/g, " ").trim();
        if (text)
            return { kind: shape.kind, text };
    }
    const name = shape.name?.trim();
    return { kind: shape.kind, ...(name ? { name } : {}) };
}
function textOf(shape) {
    return shape.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join(" ");
}
