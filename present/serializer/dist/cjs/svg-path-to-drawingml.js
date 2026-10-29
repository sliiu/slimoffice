"use strict";
// SVG path data → DrawingML `<a:pathLst>` 命令序列转换。
//
// 背景：PathShape.d 保存的是 SVG 语法的路径（parser 从 custGeom/prstGeom 求值
// 得到，或 shape-library 预设生成）。from-scratch 导出时必须把它还原成
// ECMA-376 §20.1.9 的 moveTo/lnTo/cubicBezTo/quadBezTo/close 命令 —— 之前的
// 实现只写"对角线"占位，导致 AI 插入的箭头 / 流程图导出后几何完全丢失。
//
// 支持命令：M L H V C S Q T A Z（大小写；A 弧线按标准端点参数化转成 cubic 段）。
// 坐标输入为绝对 slide px（与 bbox 同空间），输出为相对 bbox 原点的 EMU。
Object.defineProperty(exports, "__esModule", { value: true });
exports.svgPathToDrawingML = svgPathToDrawingML;
function svgPathToDrawingML(d, origin, pxToEmu) {
    const tokens = tokenize(d);
    if (!tokens.length)
        return { commands: "", ok: false };
    const out = [];
    let cur = { x: 0, y: 0 };
    let start = { x: 0, y: 0 };
    // S/T 反射控制点跟踪
    let prevCmd = "";
    let prevCubicCtrl = null;
    let prevQuadCtrl = null;
    const emit = (x, y) => `<a:pt x="${pxToEmu(x - origin.x)}" y="${pxToEmu(y - origin.y)}"/>`;
    const moveTo = (p) => out.push(`<a:moveTo>${emit(p.x, p.y)}</a:moveTo>`);
    const lnTo = (p) => out.push(`<a:lnTo>${emit(p.x, p.y)}</a:lnTo>`);
    const cubic = (c1, c2, p) => out.push(`<a:cubicBezTo>${emit(c1.x, c1.y)}${emit(c2.x, c2.y)}${emit(p.x, p.y)}</a:cubicBezTo>`);
    const quad = (c, p) => out.push(`<a:quadBezTo>${emit(c.x, c.y)}${emit(p.x, p.y)}</a:quadBezTo>`);
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];
        if (typeof t !== "string")
            return { commands: "", ok: false }; // 裸数字开头：非法
        const cmd = t;
        i++;
        const rel = cmd === cmd.toLowerCase() && cmd !== "Z" && cmd !== "z";
        const C = cmd.toUpperCase();
        const num = () => {
            const v = tokens[i];
            i++;
            return typeof v === "number" ? v : NaN;
        };
        const pt = (relative) => {
            const x = num();
            const y = num();
            return relative ? { x: cur.x + x, y: cur.y + y } : { x, y };
        };
        // 各命令允许重复参数组（如 "L 1 2 3 4" 是两条线段）
        let first = true;
        do {
            switch (C) {
                case "M": {
                    const p = pt(rel);
                    if (Number.isNaN(p.x) || Number.isNaN(p.y))
                        return { commands: "", ok: false };
                    if (first) {
                        moveTo(p);
                        start = p;
                    }
                    else {
                        lnTo(p); // 规范：M 的后续坐标组按 implicit L 处理
                    }
                    cur = p;
                    break;
                }
                case "L": {
                    const p = pt(rel);
                    if (Number.isNaN(p.x))
                        return { commands: "", ok: false };
                    lnTo(p);
                    cur = p;
                    break;
                }
                case "H": {
                    const x = num();
                    if (Number.isNaN(x))
                        return { commands: "", ok: false };
                    const p = { x: rel ? cur.x + x : x, y: cur.y };
                    lnTo(p);
                    cur = p;
                    break;
                }
                case "V": {
                    const y = num();
                    if (Number.isNaN(y))
                        return { commands: "", ok: false };
                    const p = { x: cur.x, y: rel ? cur.y + y : y };
                    lnTo(p);
                    cur = p;
                    break;
                }
                case "C": {
                    const c1 = pt(rel);
                    const c2 = pt(rel);
                    const p = pt(rel);
                    if (Number.isNaN(p.x))
                        return { commands: "", ok: false };
                    cubic(c1, c2, p);
                    prevCubicCtrl = c2;
                    cur = p;
                    break;
                }
                case "S": {
                    const c2 = pt(rel);
                    const p = pt(rel);
                    if (Number.isNaN(p.x))
                        return { commands: "", ok: false };
                    const reflect = prevCmd === "C" || prevCmd === "S";
                    const c1 = reflect && prevCubicCtrl ? { x: 2 * cur.x - prevCubicCtrl.x, y: 2 * cur.y - prevCubicCtrl.y } : cur;
                    cubic(c1, c2, p);
                    prevCubicCtrl = c2;
                    cur = p;
                    break;
                }
                case "Q": {
                    const ctrl = pt(rel);
                    const p = pt(rel);
                    if (Number.isNaN(p.x))
                        return { commands: "", ok: false };
                    quad(ctrl, p);
                    prevQuadCtrl = ctrl;
                    cur = p;
                    break;
                }
                case "T": {
                    const p = pt(rel);
                    if (Number.isNaN(p.x))
                        return { commands: "", ok: false };
                    const reflect = prevCmd === "Q" || prevCmd === "T";
                    const ctrl = reflect && prevQuadCtrl ? { x: 2 * cur.x - prevQuadCtrl.x, y: 2 * cur.y - prevQuadCtrl.y } : cur;
                    quad(ctrl, p);
                    prevQuadCtrl = ctrl;
                    cur = p;
                    break;
                }
                case "A": {
                    const rx = num();
                    const ry = num();
                    const rot = num();
                    const largeArc = num();
                    const sweep = num();
                    const p = pt(rel);
                    if (Number.isNaN(p.x))
                        return { commands: "", ok: false };
                    const beziers = arcToCubics(cur, p, rx, ry, rot, largeArc !== 0, sweep !== 0);
                    for (const bz of beziers) {
                        cubic(bz.c1, bz.c2, bz.p);
                        prevCubicCtrl = bz.c2;
                    }
                    cur = p;
                    break;
                }
                case "Z": {
                    out.push("<a:close/>");
                    cur = start;
                    break;
                }
                default:
                    return { commands: "", ok: false };
            }
            first = false;
            prevCmd = C === "M" ? "L" : C; // M 的 implicit 后续按 L
            if (C !== "C" && C !== "S")
                prevCubicCtrl = null;
            if (C !== "Q" && C !== "T")
                prevQuadCtrl = null;
        } while (C !== "Z" && typeof tokens[i] === "number");
    }
    return { commands: out.join(""), ok: out.length > 0 };
}
function tokenize(d) {
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
    const tokens = [];
    let m;
    while ((m = re.exec(d))) {
        if (m[1])
            tokens.push(m[1]);
        else
            tokens.push(Number(m[2]));
    }
    return tokens;
}
// SVG A 弧 → cubic bezier 段（W3C SVG 附录 B.2 的端点→中心参数化）。
function arcToCubics(p0, p1, rx, ry, xAxisRotDeg, largeArc, sweep) {
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    if (rx < 1e-9 || ry < 1e-9 || (p0.x === p1.x && p0.y === p1.y)) {
        return [{ c1: p0, c2: p1, p: p1 }]; // 退化：直线
    }
    const phi = (xAxisRotDeg * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const dx2 = (p0.x - p1.x) / 2;
    const dy2 = (p0.y - p1.y) / 2;
    const x1p = cosPhi * dx2 + sinPhi * dy2;
    const y1p = -sinPhi * dx2 + cosPhi * dy2;
    // 半径不足时按规范放大
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rx *= s;
        ry *= s;
    }
    const sign = largeArc !== sweep ? 1 : -1;
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const coef = sign * Math.sqrt(Math.max(0, num / den));
    const cxp = (coef * (rx * y1p)) / ry;
    const cyp = (coef * (-ry * x1p)) / rx;
    const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;
    const angle = (ux, uy, vx, vy) => {
        const dot = ux * vx + uy * vy;
        const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
        let ang = Math.acos(Math.min(1, Math.max(-1, dot / len)));
        if (ux * vy - uy * vx < 0)
            ang = -ang;
        return ang;
    };
    const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dTheta > 0)
        dTheta -= 2 * Math.PI;
    if (sweep && dTheta < 0)
        dTheta += 2 * Math.PI;
    // 每段 ≤ 90°
    const segCount = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
    const delta = dTheta / segCount;
    const t = ((4 / 3) * Math.tan(delta / 4));
    const segs = [];
    let theta = theta1;
    for (let s = 0; s < segCount; s++) {
        const cos1 = Math.cos(theta);
        const sin1 = Math.sin(theta);
        const theta2 = theta + delta;
        const cos2 = Math.cos(theta2);
        const sin2 = Math.sin(theta2);
        const toAbs = (ex, ey) => ({
            x: cosPhi * rx * ex - sinPhi * ry * ey + cx,
            y: sinPhi * rx * ex + cosPhi * ry * ey + cy,
        });
        const e1 = toAbs(cos1, sin1);
        const e2 = toAbs(cos2, sin2);
        const c1 = {
            x: e1.x + t * (-(cosPhi * rx * sin1) - sinPhi * ry * cos1),
            y: e1.y + t * (-(sinPhi * rx * sin1) + cosPhi * ry * cos1),
        };
        const c2 = {
            x: e2.x - t * (-(cosPhi * rx * sin2) - sinPhi * ry * cos2),
            y: e2.y - t * (-(sinPhi * rx * sin2) + cosPhi * ry * cos2),
        };
        segs.push({ c1, c2, p: e2 });
        theta = theta2;
    }
    return segs;
}
