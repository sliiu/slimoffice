"use strict";
// 拖动取色时直接改已挂上的 SVG 填充，避免每帧拆掉整页再重建。
// 调用方负责在松手时把模型还原并落一条命令。
Object.defineProperty(exports, "__esModule", { value: true });
exports.paintedTextColor = paintedTextColor;
exports.captureFills = captureFills;
exports.writeFills = writeFills;
exports.restoreFills = restoreFills;
exports.captureRunColors = captureRunColors;
exports.writeRunColors = writeRunColors;
exports.restoreRunColors = restoreRunColors;
exports.solidHex = solidHex;
exports.patchSolidFill = patchSolidFill;
exports.patchTextColor = patchTextColor;
exports.syncLiveColorInputs = syncLiveColorInputs;
/** 画面上的字色：纯色 `run.fill` 盖过 `run.color`。 */
function paintedTextColor(run) {
    if (run?.fill?.kind === "solid" && run.fill.color)
        return run.fill.color;
    return run?.color;
}
function captureFills(shapes) {
    return shapes.map((shape) => ({ shape, prev: shape.fill }));
}
function writeFills(snaps, paint) {
    for (const snap of snaps)
        snap.shape.fill = paint;
}
function restoreFills(snaps) {
    for (const snap of snaps)
        snap.shape.fill = snap.prev;
}
function captureRunColors(runs) {
    return runs.map((run) => ({
        run,
        prev: run.color,
        prevFill: run.fill?.kind === "solid" ? run.fill : undefined,
    }));
}
function writeRunColors(snaps, color) {
    for (const snap of snaps) {
        snap.run.color = color;
        if (snap.prevFill?.kind === "solid")
            snap.run.fill = { ...snap.prevFill, color };
    }
}
function restoreRunColors(snaps) {
    for (const snap of snaps) {
        snap.run.color = snap.prev;
        if (snap.prevFill)
            snap.run.fill = snap.prevFill;
    }
}
/** `#rgb` / `#rrggbb` → `#rrggbb`。其它写法色块控件吃不进去。 */
function solidHex(color) {
    if (!color)
        return null;
    const c = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c))
        return c.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(c)) {
        const r = c[1] ?? "0";
        const g = c[2] ?? "0";
        const b = c[3] ?? "0";
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return null;
}
function attrEscape(id) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
        return CSS.escape(id);
    return id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function shapeGroup(root, shapeId) {
    return root.querySelector(`g[data-id="${attrEscape(shapeId)}"]`);
}
function paintSolid(el, paint) {
    if (!paint || paint.kind === "none") {
        el.setAttribute("fill", "none");
        el.removeAttribute("fill-opacity");
        return;
    }
    if (paint.kind !== "solid")
        return;
    el.setAttribute("fill", paint.color);
    if (paint.alpha !== undefined && paint.alpha < 1)
        el.setAttribute("fill-opacity", String(paint.alpha));
    else
        el.removeAttribute("fill-opacity");
}
/**
 * 把纯色写到形状自己的图形上。文本框只改背景矩形，不改字形。
 * 渐变等非纯色返回 false，调用方应整页 flush。
 */
function patchSolidFill(root, shapeId, paint) {
    if (paint && paint.kind !== "solid" && paint.kind !== "none")
        return false;
    const g = shapeGroup(root, shapeId);
    if (!g)
        return false;
    const graphic = g.querySelector(":scope > rect, :scope > ellipse, :scope > path, :scope > polygon, :scope > line");
    const bg = graphic ?? g.querySelector(":scope > rect, :scope > g > rect");
    if (!bg)
        return false;
    paintSolid(bg, paint);
    return true;
}
/** 把文字色写到该形状里的 text / tspan 上，不动背景矩形。 */
function patchTextColor(root, shapeId, color) {
    const g = shapeGroup(root, shapeId);
    if (!g)
        return false;
    const nodes = g.querySelectorAll("text, tspan");
    if (nodes.length === 0)
        return false;
    for (const n of nodes)
        n.setAttribute("fill", color);
    return true;
}
/** 拖动中让另一侧没在操作的色块跟上。正在拖的那颗跳过，避免打断系统取色器。 */
function syncLiveColorInputs(doc, slot, color) {
    const next = solidHex(color);
    if (!next)
        return;
    for (const input of doc.querySelectorAll(`input[data-live-color="${slot}"]`)) {
        if (doc.activeElement === input)
            continue;
        if (input.value.toLowerCase() !== next)
            input.value = next;
    }
}
