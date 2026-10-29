"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodeShownForPointer = nodeShownForPointer;
exports.paragraphShownForPointer = paragraphShownForPointer;
exports.findHyperlinkAt = findHyperlinkAt;
const renderer_1 = require("@sliiu/present-renderer");
/**
 * 放映命中：入场还没把形状画出来（自身或祖先 opacity≤0 / visible=false）时，
 * 超链和单击触发都不该吃掉这次点击。点击应落到后面的推进。
 */
function nodeShownForPointer(node) {
    let cur = node;
    while (cur) {
        if (cur.id === "__root")
            break;
        if ((cur.visibleOverride ?? cur.shape.visible) === false)
            return false;
        if (cur.opacity <= 0)
            return false;
        cur = cur.parent;
    }
    return true;
}
function paragraphShownForPointer(node, paraIdx) {
    if (node.getParaProperty(paraIdx, "visible") === false)
        return false;
    const op = node.getParaProperty(paraIdx, "opacity");
    return typeof op !== "number" || op > 0;
}
function hitTestRect(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function paragraphIndexOfRun(shape, run) {
    const paras = shape.paragraphs ?? [];
    for (let i = 0; i < paras.length; i++) {
        if (paras[i].runs?.includes(run))
            return i;
    }
    return -1;
}
/** 按排版命中文字框内的 run 级超链接；该段还没显示则不算命中。 */
function hitTestRunLink(node, x, y, slot) {
    const shape = node.shape;
    if (shape.kind !== "text")
        return undefined;
    const run = (0, renderer_1.hitTestTextRunAt)(shape, x, y);
    if (run?.[slot]) {
        const paraIdx = paragraphIndexOfRun(shape, run);
        if (paraIdx >= 0 && !paragraphShownForPointer(node, paraIdx))
            return undefined;
        return run[slot];
    }
    const paras = shape.paragraphs ?? [];
    if (paras.length === 0)
        return undefined;
    const b = shape.bbox;
    const insetL = shape.insets?.l ?? 0;
    const insetR = shape.insets?.r ?? 0;
    const insetT = shape.insets?.t ?? 0;
    const insetB = shape.insets?.b ?? 0;
    const innerW = Math.max(1, b.w - insetL - insetR);
    const innerH = Math.max(1, b.h - insetT - insetB);
    const relY = innerH > 0 ? (y - b.y - insetT) / innerH : 0;
    const paraIdx = Math.min(paras.length - 1, Math.max(0, Math.floor(Math.max(0, relY) * paras.length)));
    if (!paragraphShownForPointer(node, paraIdx))
        return undefined;
    const para = paras[paraIdx];
    const runs = para.runs ?? [];
    const linked = runs.filter((r) => r[slot]);
    if (linked.length === 0)
        return undefined;
    const unique = new Set(linked.map((r) => `${r[slot].kind}:${r[slot].target ?? ""}`));
    if (unique.size === 1)
        return linked[0][slot];
    const total = runs.reduce((n, r) => n + (r.text?.length ?? 0), 0) || 1;
    const relX = innerW > 0 ? (x - b.x - insetL) / innerW : 0;
    let acc = 0;
    const target = relX * total;
    for (const r of runs) {
        acc += r.text?.length ?? 0;
        if (target <= acc)
            return r[slot];
    }
    return runs[runs.length - 1]?.[slot];
}
function linkOnShape(shape, slot) {
    return shape[slot];
}
/**
 * 命中当前已显示形状上的 hlinkClick / hlinkHover。
 * z 序与原先 player 内联扫描一致：walk 顺序靠后的盖住靠前的。
 */
function findHyperlinkAt(root, x, y, slot) {
    // 闭包里给 let 赋值时，tsc 看不到这次写入，null 检查之后会把变量收成 never。
    const best = { hit: null };
    let i = 0;
    root.walk((n) => {
        if (n.id === "__root" || !nodeShownForPointer(n)) {
            i++;
            return;
        }
        const local = (0, renderer_1.worldToLocal)(n, x, y);
        if (!hitTestRect(n.shape.bbox, local.x, local.y)) {
            i++;
            return;
        }
        const shapeLink = linkOnShape(n.shape, slot);
        const runLink = shapeLink ? undefined : hitTestRunLink(n, local.x, local.y, slot);
        const link = shapeLink ?? runLink;
        if (link && (!best.hit || i >= best.hit.z))
            best.hit = { link, z: i, id: n.id };
        i++;
    });
    if (!best.hit)
        return null;
    return { link: best.hit.link, id: best.hit.id };
}
