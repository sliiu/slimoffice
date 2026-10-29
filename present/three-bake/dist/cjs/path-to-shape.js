"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathDToShapes = pathDToShapes;
const THREE = __importStar(require("three"));
function pathDToShapes(d) {
    const out = [];
    let current = null;
    let x = 0;
    let y = 0;
    let startX = 0;
    let startY = 0;
    let cpx = 0;
    let cpy = 0;
    let lastCmd = "";
    const minMax = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const track = (px, py) => {
        if (px < minMax.minX)
            minMax.minX = px;
        if (py < minMax.minY)
            minMax.minY = py;
        if (px > minMax.maxX)
            minMax.maxX = px;
        if (py > minMax.maxY)
            minMax.maxY = py;
    };
    const tokens = tokenizePath(d);
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i++];
        if (typeof t !== "string")
            continue;
        const cmd = t;
        const lower = cmd.toLowerCase();
        const isRel = cmd !== cmd.toUpperCase();
        const read = () => {
            const v = tokens[i++];
            return typeof v === "number" ? v : 0;
        };
        if (lower === "m") {
            const nx = read() + (isRel ? x : 0);
            const ny = read() + (isRel ? y : 0);
            if (current)
                out.push(current);
            current = new THREE.Shape();
            current.moveTo(nx, ny);
            x = nx;
            y = ny;
            startX = nx;
            startY = ny;
            track(x, y);
            while (i < tokens.length && typeof tokens[i] === "number") {
                const lx = read() + (isRel ? x : 0);
                const ly = read() + (isRel ? y : 0);
                current.lineTo(lx, ly);
                x = lx;
                y = ly;
                track(x, y);
            }
        }
        else if (lower === "l") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const lx = read() + (isRel ? x : 0);
                const ly = read() + (isRel ? y : 0);
                current?.lineTo(lx, ly);
                x = lx;
                y = ly;
                track(x, y);
            }
        }
        else if (lower === "h") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const lx = read() + (isRel ? x : 0);
                current?.lineTo(lx, y);
                x = lx;
                track(x, y);
            }
        }
        else if (lower === "v") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const ly = read() + (isRel ? y : 0);
                current?.lineTo(x, ly);
                y = ly;
                track(x, y);
            }
        }
        else if (lower === "c") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const c1x = read() + (isRel ? x : 0);
                const c1y = read() + (isRel ? y : 0);
                const c2x = read() + (isRel ? x : 0);
                const c2y = read() + (isRel ? y : 0);
                const ex = read() + (isRel ? x : 0);
                const ey = read() + (isRel ? y : 0);
                current?.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
                cpx = c2x;
                cpy = c2y;
                x = ex;
                y = ey;
                track(x, y);
            }
        }
        else if (lower === "s") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const c1x = lastCmd === "c" || lastCmd === "s" ? 2 * x - cpx : x;
                const c1y = lastCmd === "c" || lastCmd === "s" ? 2 * y - cpy : y;
                const c2x = read() + (isRel ? x : 0);
                const c2y = read() + (isRel ? y : 0);
                const ex = read() + (isRel ? x : 0);
                const ey = read() + (isRel ? y : 0);
                current?.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
                cpx = c2x;
                cpy = c2y;
                x = ex;
                y = ey;
                track(x, y);
            }
        }
        else if (lower === "q") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const c1x = read() + (isRel ? x : 0);
                const c1y = read() + (isRel ? y : 0);
                const ex = read() + (isRel ? x : 0);
                const ey = read() + (isRel ? y : 0);
                current?.quadraticCurveTo(c1x, c1y, ex, ey);
                cpx = c1x;
                cpy = c1y;
                x = ex;
                y = ey;
                track(x, y);
            }
        }
        else if (lower === "t") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const c1x = lastCmd === "q" || lastCmd === "t" ? 2 * x - cpx : x;
                const c1y = lastCmd === "q" || lastCmd === "t" ? 2 * y - cpy : y;
                const ex = read() + (isRel ? x : 0);
                const ey = read() + (isRel ? y : 0);
                current?.quadraticCurveTo(c1x, c1y, ex, ey);
                cpx = c1x;
                cpy = c1y;
                x = ex;
                y = ey;
                track(x, y);
            }
        }
        else if (lower === "a") {
            while (i < tokens.length && typeof tokens[i] === "number") {
                const rx = Math.abs(read());
                const ry = Math.abs(read());
                const phi = read();
                const large = read();
                const sweep = read();
                const ex = read() + (isRel ? x : 0);
                const ey = read() + (isRel ? y : 0);
                const curves = svgArcToCubics(x, y, rx, ry, phi, large, sweep, ex, ey);
                if (!current || curves.length === 0) {
                    current?.lineTo(ex, ey);
                }
                else {
                    for (const [c1x, c1y, c2x, c2y, px, py] of curves) {
                        current.bezierCurveTo(c1x, c1y, c2x, c2y, px, py);
                        track(c1x, c1y);
                        track(c2x, c2y);
                        track(px, py);
                    }
                }
                x = ex;
                y = ey;
                track(x, y);
                cpx = x;
                cpy = y;
            }
        }
        else if (lower === "z") {
            current?.lineTo(startX, startY);
            x = startX;
            y = startY;
        }
        lastCmd = lower;
    }
    if (current)
        out.push(current);
    if (!Number.isFinite(minMax.minX)) {
        minMax.minX = 0;
        minMax.minY = 0;
        minMax.maxX = 0;
        minMax.maxY = 0;
    }
    return {
        shapes: out,
        bbox: minMax,
    };
}
function tokenizePath(d) {
    const out = [];
    let i = 0;
    while (i < d.length) {
        const c = d[i];
        if (/[a-zA-Z]/.test(c)) {
            out.push(c);
            i++;
        }
        else if (/[\s,]/.test(c)) {
            i++;
        }
        else if (c === "-" || c === "+" || c === "." || /\d/.test(c)) {
            let j = i;
            if (d[j] === "-" || d[j] === "+")
                j++;
            while (j < d.length && /[0-9.]/.test(d[j]))
                j++;
            if (d[j] === "e" || d[j] === "E") {
                j++;
                if (d[j] === "-" || d[j] === "+")
                    j++;
                while (j < d.length && /\d/.test(d[j]))
                    j++;
            }
            const num = Number(d.slice(i, j));
            if (Number.isFinite(num))
                out.push(num);
            i = j > i ? j : i + 1;
        }
        else {
            i++;
        }
    }
    return out;
}
// SVG arc → 三次贝塞尔。端点参数按 SVG 1.1 附录 F.6 转成圆心，再按不超过 90° 分段。
function svgArcToCubics(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
    if (rx === 0 || ry === 0)
        return [];
    if (x1 === x2 && y1 === y2)
        return [];
    const phi = (phiDeg * Math.PI) / 180;
    const sinphi = Math.sin(phi);
    const cosphi = Math.cos(phi);
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const px = cosphi * dx + sinphi * dy;
    const py = -sinphi * dx + cosphi * dy;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const px2 = px * px;
    const py2 = py * py;
    let rx2 = rx * rx;
    let ry2 = ry * ry;
    const lam = px2 / rx2 + py2 / ry2;
    if (lam > 1) {
        const s = Math.sqrt(lam);
        rx *= s;
        ry *= s;
        rx2 = rx * rx;
        ry2 = ry * ry;
    }
    const sign = large === sweep ? -1 : 1;
    let sq = (rx2 * ry2 - rx2 * py2 - ry2 * px2) / (rx2 * py2 + ry2 * px2);
    if (!Number.isFinite(sq) || sq < 0)
        sq = 0;
    const coef = sign * Math.sqrt(sq);
    const cxp = (coef * rx * py) / ry;
    const cyp = (coef * -ry * px) / rx;
    const cx = cosphi * cxp - sinphi * cyp + (x1 + x2) / 2;
    const cy = sinphi * cxp + cosphi * cyp + (y1 + y2) / 2;
    const theta1 = vectorAngle(1, 0, (px - cxp) / rx, (py - cyp) / ry);
    let dtheta = vectorAngle((px - cxp) / rx, (py - cyp) / ry, (-px - cxp) / rx, (-py - cyp) / ry);
    if (!sweep && dtheta > 0)
        dtheta -= Math.PI * 2;
    if (sweep && dtheta < 0)
        dtheta += Math.PI * 2;
    const segs = Math.max(1, Math.ceil(Math.abs(dtheta) / (Math.PI / 2)));
    const delta = dtheta / segs;
    const t = (4 / 3) * Math.tan(delta / 4);
    const out = [];
    const map = (lx, ly) => [
        cosphi * lx - sinphi * ly + cx,
        sinphi * lx + cosphi * ly + cy,
    ];
    for (let i = 0; i < segs; i++) {
        const th = theta1 + i * delta;
        const th2 = th + delta;
        const cosTh = Math.cos(th);
        const sinTh = Math.sin(th);
        const cosTh2 = Math.cos(th2);
        const sinTh2 = Math.sin(th2);
        const p1 = map(rx * (cosTh - t * sinTh), ry * (sinTh + t * cosTh));
        const p2 = map(rx * (cosTh2 + t * sinTh2), ry * (sinTh2 - t * cosTh2));
        const end = map(rx * cosTh2, ry * sinTh2);
        out.push([p1[0], p1[1], p2[0], p2[1], end[0], end[1]]);
    }
    return out;
}
function vectorAngle(ux, uy, vx, vy) {
    const dot = ux * vx + uy * vy;
    const det = ux * vy - uy * vx;
    return Math.atan2(det, dot);
}
