"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.affMul = affMul;
exports.nodeAffine = nodeAffine;
exports.accumulatedAffine = accumulatedAffine;
exports.cssAffineForBox = cssAffineForBox;
exports.chainOpacity = chainOpacity;
exports.chainHidden = chainHidden;
function affMul(m, n) {
    return {
        a: m.a * n.a + m.c * n.b,
        b: m.b * n.a + m.d * n.b,
        c: m.a * n.c + m.c * n.d,
        d: m.b * n.c + m.d * n.d,
        e: m.a * n.e + m.c * n.f + m.e,
        f: m.b * n.e + m.d * n.f + m.f,
    };
}
function affTranslate(x, y) {
    return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}
/** 单个节点的 SVG 变换：先绕 bbox 中心旋转缩放，再平移 tx/ty。 */
function nodeAffine(node) {
    const s = node.shape;
    const cx = s.bbox.x + s.bbox.w / 2;
    const cy = s.bbox.y + s.bbox.h / 2;
    const flipX = s.transform?.scaleX ?? 1;
    const flipY = s.transform?.scaleY ?? 1;
    const sx = node.scale * node.scaleX * node.widthScale * (flipX < 0 ? -1 : 1);
    const sy = node.scale * node.scaleY * node.heightScale * (flipY < 0 ? -1 : 1);
    const rad = ((node.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const a = cos * sx;
    const b = sin * sx;
    const c = -sin * sy;
    const d = cos * sy;
    const e = cx - (a * cx + c * cy) + node.tx;
    const f = cy - (b * cx + d * cy) + node.ty;
    return { a, b, c, d, e, f };
}
/** 从最外层祖先乘到自身。幻灯片根是恒等变换，乘进去不改变结果。 */
function accumulatedAffine(node) {
    const chain = [];
    let cur = node;
    while (cur) {
        chain.push(cur);
        cur = cur.parent;
    }
    let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    for (let i = chain.length - 1; i >= 0; i--)
        m = affMul(m, nodeAffine(chain[i]));
    return m;
}
/**
 * wrapper 已放在 slide 坐标 (originX, originY)。CSS transform-origin 为 0 0 时，
 * 用这个矩阵才能让视觉位置等于 accumulatedAffine。
 */
function cssAffineForBox(m, originX, originY) {
    return affMul(affMul(affTranslate(-originX, -originY), m), affTranslate(originX, originY));
}
function chainOpacity(node) {
    let alpha = 1;
    let cur = node;
    while (cur) {
        alpha *= cur.opacity;
        cur = cur.parent;
    }
    return alpha;
}
function chainHidden(node) {
    let cur = node;
    while (cur) {
        if ((cur.visibleOverride ?? cur.shape.visible) === false)
            return true;
        cur = cur.parent;
    }
    return false;
}
