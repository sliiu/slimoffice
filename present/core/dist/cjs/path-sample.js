"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSegments = buildSegments;
exports.translatePathD = translatePathD;
exports.samplePath = samplePath;
const CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
const NUM_RE = /-?\d*\.?\d+(?:[eE][+-]?\d+)?/g;
function tokenize(d) {
    const cmds = [];
    let m;
    CMD_RE.lastIndex = 0;
    while ((m = CMD_RE.exec(d)) !== null) {
        const op = m[1];
        const raw = m[2] ?? "";
        const args = [];
        let n;
        NUM_RE.lastIndex = 0;
        while ((n = NUM_RE.exec(raw)) !== null)
            args.push(Number(n[0]));
        cmds.push({ op, args });
    }
    return cmds;
}
function lineSegment(p0, p1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const length = Math.hypot(dx, dy);
    return {
        length,
        fn: (t) => ({ x: p0.x + dx * t, y: p0.y + dy * t }),
    };
}
function cubicAt(p0, c1, c2, p1, t) {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    const a = uu * u;
    const b = 3 * uu * t;
    const c = 3 * u * tt;
    const e = tt * t;
    return {
        x: a * p0.x + b * c1.x + c * c2.x + e * p1.x,
        y: a * p0.y + b * c1.y + c * c2.y + e * p1.y,
    };
}
function cubicSegment(p0, c1, c2, p1) {
    const steps = 24;
    let length = 0;
    let prev = p0;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const pt = cubicAt(p0, c1, c2, p1, t);
        length += Math.hypot(pt.x - prev.x, pt.y - prev.y);
        prev = pt;
    }
    return { length, fn: (t) => cubicAt(p0, c1, c2, p1, t) };
}
function quadAt(p0, c, p1, t) {
    const u = 1 - t;
    return {
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
    };
}
function quadSegment(p0, c, p1) {
    const steps = 18;
    let length = 0;
    let prev = p0;
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const pt = quadAt(p0, c, p1, t);
        length += Math.hypot(pt.x - prev.x, pt.y - prev.y);
        prev = pt;
    }
    return { length, fn: (t) => quadAt(p0, c, p1, t) };
}
function buildSegments(d, sx = 1, sy = 1) {
    const cmds = tokenize(d);
    const segs = [];
    let cur = { x: 0, y: 0 };
    let start = { x: 0, y: 0 };
    let prevCtrl = null;
    for (const cmd of cmds) {
        const op = cmd.op;
        const a = cmd.args;
        const rel = op === op.toLowerCase();
        const up = op.toUpperCase();
        const tx = (v) => v * sx;
        const ty = (v) => v * sy;
        let i = 0;
        while (i < a.length || (up === "Z" && i === 0)) {
            switch (up) {
                case "M": {
                    const x = rel ? cur.x + tx(a[i]) : tx(a[i]);
                    const y = rel ? cur.y + ty(a[i + 1]) : ty(a[i + 1]);
                    cur = { x, y };
                    start = cur;
                    i += 2;
                    while (i + 1 < a.length) {
                        const nx = rel ? cur.x + tx(a[i]) : tx(a[i]);
                        const ny = rel ? cur.y + ty(a[i + 1]) : ty(a[i + 1]);
                        const next = { x: nx, y: ny };
                        segs.push(lineSegment(cur, next));
                        cur = next;
                        i += 2;
                    }
                    prevCtrl = null;
                    break;
                }
                case "L": {
                    const x = rel ? cur.x + tx(a[i]) : tx(a[i]);
                    const y = rel ? cur.y + ty(a[i + 1]) : ty(a[i + 1]);
                    const next = { x, y };
                    segs.push(lineSegment(cur, next));
                    cur = next;
                    i += 2;
                    prevCtrl = null;
                    break;
                }
                case "H": {
                    const x = rel ? cur.x + tx(a[i]) : tx(a[i]);
                    const next = { x, y: cur.y };
                    segs.push(lineSegment(cur, next));
                    cur = next;
                    i += 1;
                    prevCtrl = null;
                    break;
                }
                case "V": {
                    const y = rel ? cur.y + ty(a[i]) : ty(a[i]);
                    const next = { x: cur.x, y };
                    segs.push(lineSegment(cur, next));
                    cur = next;
                    i += 1;
                    prevCtrl = null;
                    break;
                }
                case "C": {
                    const c1 = {
                        x: rel ? cur.x + tx(a[i]) : tx(a[i]),
                        y: rel ? cur.y + ty(a[i + 1]) : ty(a[i + 1]),
                    };
                    const c2 = {
                        x: rel ? cur.x + tx(a[i + 2]) : tx(a[i + 2]),
                        y: rel ? cur.y + ty(a[i + 3]) : ty(a[i + 3]),
                    };
                    const p1 = {
                        x: rel ? cur.x + tx(a[i + 4]) : tx(a[i + 4]),
                        y: rel ? cur.y + ty(a[i + 5]) : ty(a[i + 5]),
                    };
                    segs.push(cubicSegment(cur, c1, c2, p1));
                    cur = p1;
                    prevCtrl = c2;
                    i += 6;
                    break;
                }
                case "S": {
                    const c1 = prevCtrl ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y } : cur;
                    const c2 = {
                        x: rel ? cur.x + tx(a[i]) : tx(a[i]),
                        y: rel ? cur.y + ty(a[i + 1]) : ty(a[i + 1]),
                    };
                    const p1 = {
                        x: rel ? cur.x + tx(a[i + 2]) : tx(a[i + 2]),
                        y: rel ? cur.y + ty(a[i + 3]) : ty(a[i + 3]),
                    };
                    segs.push(cubicSegment(cur, c1, c2, p1));
                    cur = p1;
                    prevCtrl = c2;
                    i += 4;
                    break;
                }
                case "Q": {
                    const c = {
                        x: rel ? cur.x + tx(a[i]) : tx(a[i]),
                        y: rel ? cur.y + ty(a[i + 1]) : ty(a[i + 1]),
                    };
                    const p1 = {
                        x: rel ? cur.x + tx(a[i + 2]) : tx(a[i + 2]),
                        y: rel ? cur.y + ty(a[i + 3]) : ty(a[i + 3]),
                    };
                    segs.push(quadSegment(cur, c, p1));
                    cur = p1;
                    prevCtrl = c;
                    i += 4;
                    break;
                }
                case "T": {
                    const ctrl = prevCtrl
                        ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y }
                        : cur;
                    const p1 = {
                        x: rel ? cur.x + tx(a[i]) : tx(a[i]),
                        y: rel ? cur.y + ty(a[i + 1]) : ty(a[i + 1]),
                    };
                    segs.push(quadSegment(cur, ctrl, p1));
                    cur = p1;
                    prevCtrl = ctrl;
                    i += 2;
                    break;
                }
                case "Z": {
                    segs.push(lineSegment(cur, start));
                    cur = start;
                    prevCtrl = null;
                    if (i === 0)
                        i = a.length || 1;
                    else
                        i = a.length;
                    break;
                }
                default:
                    i = a.length;
            }
            if (up === "Z")
                break;
        }
    }
    return segs;
}
// 每个 SVG path 指令一组参数里，各 slot 是 x 坐标 / y 坐标 / 非坐标（半径、旗标、
// 旋转角）。平移整条路径时只能给坐标 slot 加 dx/dy，绝不能动 A 的 rx/ry/flags。
const PATH_AXIS = {
    M: ["x", "y"],
    L: ["x", "y"],
    T: ["x", "y"],
    H: ["x"],
    V: ["y"],
    C: ["x", "y", "x", "y", "x", "y"],
    S: ["x", "y", "x", "y"],
    Q: ["x", "y", "x", "y"],
    A: ["-", "-", "-", "-", "-", "x", "y"],
    Z: [],
};
function fmtCoord(n) {
    // 四舍五入到 3 位小数并去掉多余尾零，避免浮点噪声把 d 串撑长。
    const r = Math.round(n * 1000) / 1000;
    return Object.is(r, -0) ? "0" : String(r);
}
// 把一条 SVG path 的 d 串整体平移 (dx, dy)。绝对指令（大写）的坐标加偏移；
// 相对指令（小写）是增量，保持不变 —— 只有路径起始的相对 moveto 的首对坐标
// 才等价绝对坐标，需要平移。这样无论绝对还是相对路径，整形都会跟着 bbox 一起移动。
function translatePathD(d, dx, dy) {
    if (!d || (dx === 0 && dy === 0))
        return d;
    const cmds = tokenize(d);
    const out = [];
    let first = true;
    for (const { op, args } of cmds) {
        const isRel = op >= "a" && op <= "z";
        const up = op.toUpperCase();
        let shifted = args;
        if (!isRel) {
            shifted = shiftByAxis(up, args, dx, dy);
        }
        else if (first && up === "M" && args.length >= 2) {
            // 起始的相对 m：首对坐标按绝对处理，其余增量保持不变。
            shifted = args.slice();
            shifted[0] = shifted[0] + dx;
            shifted[1] = shifted[1] + dy;
        }
        out.push(shifted.length ? `${op} ${shifted.map(fmtCoord).join(" ")}` : op);
        first = false;
    }
    return out.join(" ");
}
function shiftByAxis(up, args, dx, dy) {
    const pat = PATH_AXIS[up];
    if (!pat || pat.length === 0)
        return args;
    const out = args.slice();
    for (let i = 0; i < out.length; i++) {
        const axis = pat[i % pat.length];
        if (axis === "x")
            out[i] = out[i] + dx;
        else if (axis === "y")
            out[i] = out[i] + dy;
    }
    return out;
}
function samplePath(d, count, sx = 1, sy = 1) {
    const segs = buildSegments(d, sx, sy);
    const total = segs.reduce((s, x) => s + x.length, 0);
    if (total === 0 || segs.length === 0)
        return [{ x: 0, y: 0 }];
    const out = [];
    for (let i = 0; i <= count; i++) {
        const target = (total * i) / count;
        let acc = 0;
        let placed = false;
        for (const s of segs) {
            if (acc + s.length >= target) {
                const local = s.length === 0 ? 0 : (target - acc) / s.length;
                out.push(s.fn(local));
                placed = true;
                break;
            }
            acc += s.length;
        }
        if (!placed)
            out.push(segs[segs.length - 1].fn(1));
    }
    return out;
}
