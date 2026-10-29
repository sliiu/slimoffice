/** SVG path helpers for Morph transitions (normalize + interpolate). */
function tokenizePath(d) {
    const out = [];
    const re = /[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
    let m;
    while ((m = re.exec(d)) !== null) {
        const t = m[0];
        if (/^[a-zA-Z]$/.test(t))
            out.push(t);
        else
            out.push(Number(t));
    }
    return out;
}
export function parsePathCommands(d) {
    const tokens = tokenizePath(d);
    const cmds = [];
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];
        if (typeof t !== "string") {
            i++;
            continue;
        }
        const cmd = t;
        i++;
        const n = paramCount(cmd);
        const args = [];
        if (n === 0) {
            cmds.push({ cmd, args });
            continue;
        }
        while (i < tokens.length && typeof tokens[i] === "number") {
            args.push(tokens[i]);
            i++;
            if (args.length >= n) {
                cmds.push({ cmd, args: args.splice(0, n) });
                if (args.length)
                    continue;
                break;
            }
        }
        if (args.length)
            cmds.push({ cmd, args });
    }
    return cmds;
}
function paramCount(cmd) {
    switch (cmd.toUpperCase()) {
        case "M":
        case "L":
        case "T":
            return 2;
        case "H":
        case "V":
            return 1;
        case "C":
            return 6;
        case "S":
        case "Q":
            return 4;
        case "A":
            return 7;
        case "Z":
            return 0;
        default:
            return 0;
    }
}
/** Convert relative path commands to absolute (uppercase) equivalents. */
export function pathToAbsolute(commands) {
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let prevC2x = cx;
    let prevC2y = cy;
    const out = [];
    for (const { cmd, args } of commands) {
        const rel = cmd === cmd.toLowerCase();
        const C = cmd.toUpperCase();
        if (C === "Z") {
            cx = sx;
            cy = sy;
            out.push({ cmd: "Z", args: [] });
            continue;
        }
        if (C === "M") {
            for (let i = 0; i < args.length; i += 2) {
                const x = rel ? cx + args[i] : args[i];
                const y = rel ? cy + args[i + 1] : args[i + 1];
                cx = x;
                cy = y;
                if (i === 0) {
                    sx = x;
                    sy = y;
                    out.push({ cmd: "M", args: [x, y] });
                }
                else {
                    out.push({ cmd: "L", args: [x, y] });
                }
            }
            continue;
        }
        if (C === "L") {
            for (let i = 0; i < args.length; i += 2) {
                const x = rel ? cx + args[i] : args[i];
                const y = rel ? cy + args[i + 1] : args[i + 1];
                cx = x;
                cy = y;
                out.push({ cmd: "L", args: [x, y] });
            }
            continue;
        }
        if (C === "H") {
            for (const a of args) {
                cx = rel ? cx + a : a;
                out.push({ cmd: "L", args: [cx, cy] });
            }
            continue;
        }
        if (C === "V") {
            for (const a of args) {
                cy = rel ? cy + a : a;
                out.push({ cmd: "L", args: [cx, cy] });
            }
            continue;
        }
        if (C === "C") {
            for (let i = 0; i < args.length; i += 6) {
                const x1 = rel ? cx + args[i] : args[i];
                const y1 = rel ? cy + args[i + 1] : args[i + 1];
                const x2 = rel ? cx + args[i + 2] : args[i + 2];
                const y2 = rel ? cy + args[i + 3] : args[i + 3];
                const x = rel ? cx + args[i + 4] : args[i + 4];
                const y = rel ? cy + args[i + 5] : args[i + 5];
                out.push({ cmd: "C", args: [x1, y1, x2, y2, x, y] });
                prevC2x = x2;
                prevC2y = y2;
                cx = x;
                cy = y;
            }
            continue;
        }
        if (C === "Q") {
            for (let i = 0; i < args.length; i += 4) {
                const x1 = rel ? cx + args[i] : args[i];
                const y1 = rel ? cy + args[i + 1] : args[i + 1];
                const x = rel ? cx + args[i + 2] : args[i + 2];
                const y = rel ? cy + args[i + 3] : args[i + 3];
                out.push({ cmd: "Q", args: [x1, y1, x, y] });
                prevC2x = x1;
                prevC2y = y1;
                cx = x;
                cy = y;
            }
            continue;
        }
        if (C === "S") {
            for (let i = 0; i < args.length; i += 4) {
                const x2 = rel ? cx + args[i] : args[i];
                const y2 = rel ? cy + args[i + 1] : args[i + 1];
                const x = rel ? cx + args[i + 2] : args[i + 2];
                const y = rel ? cy + args[i + 3] : args[i + 3];
                const x1 = 2 * cx - prevC2x;
                const y1 = 2 * cy - prevC2y;
                out.push({ cmd: "C", args: [x1, y1, x2, y2, x, y] });
                prevC2x = x2;
                prevC2y = y2;
                cx = x;
                cy = y;
            }
            continue;
        }
        if (C === "T") {
            for (let i = 0; i < args.length; i += 2) {
                const x = rel ? cx + args[i] : args[i];
                const y = rel ? cy + args[i + 1] : args[i + 1];
                const x1 = 2 * cx - prevC2x;
                const y1 = 2 * cy - prevC2y;
                out.push({ cmd: "Q", args: [x1, y1, x, y] });
                prevC2x = x1;
                prevC2y = y1;
                cx = x;
                cy = y;
            }
            continue;
        }
        if (C === "A") {
            for (let i = 0; i < args.length; i += 7) {
                const rx = args[i];
                const ry = args[i + 1];
                const rot = args[i + 2];
                const laf = args[i + 3];
                const sf = args[i + 4];
                const x = rel ? cx + args[i + 5] : args[i + 5];
                const y = rel ? cy + args[i + 6] : args[i + 6];
                out.push({ cmd: "A", args: [rx, ry, rot, laf, sf, x, y] });
                cx = x;
                cy = y;
            }
            continue;
        }
    }
    return out;
}
function commandsToNumbers(commands) {
    const cmds = [];
    const nums = [];
    for (const c of commands) {
        cmds.push(c.cmd);
        nums.push(...c.args);
    }
    return { cmds, nums };
}
function lerp(a, b, t) {
    return a + (b - a) * t;
}
function buildPathFromInterp(cmds, from, to, t) {
    const out = [];
    let p = 0;
    for (const c of cmds) {
        out.push(c);
        const n = paramCount(c);
        for (let i = 0; i < n; i++) {
            // Arc large-arc/sweep flags must be a bare 0 or 1; "1.000" stops the browser's path parser.
            const isArcFlag = c.toUpperCase() === "A" && (i % 7 === 3 || i % 7 === 4);
            out.push(isArcFlag ? String(Math.round(t < 0.5 ? from[p] : to[p])) : lerp(from[p], to[p], t).toFixed(3));
            p++;
        }
    }
    return out.join(" ");
}
function asPolyline(commands) {
    const points = [];
    let closed = false;
    for (const { cmd, args } of commands) {
        if (cmd === "M" || cmd === "L") {
            points.push({ x: args[0], y: args[1] });
        }
        else if (cmd === "Z") {
            closed = true;
        }
        else {
            return null;
        }
    }
    if (points.length < 2)
        return null;
    return { points, closed };
}
function perimeter(points, closed) {
    let sum = 0;
    const n = points.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        sum += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return sum;
}
function pointAt(points, closed, dist) {
    let acc = 0;
    const n = points.length;
    const segCount = closed ? n : n - 1;
    for (let i = 0; i < segCount; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (acc + len >= dist || i === segCount - 1) {
            const t = len > 0 ? Math.min(1, (dist - acc) / len) : 0;
            return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
        }
        acc += len;
    }
    return points[points.length - 1];
}
function resamplePolyline(points, closed, count) {
    const per = perimeter(points, closed);
    if (per <= 0)
        return points.slice(0, count);
    const out = [];
    for (let i = 0; i < count; i++) {
        const d = closed ? (per * i) / count : count <= 1 ? 0 : (per * i) / (count - 1);
        out.push(pointAt(points, closed, d));
    }
    return out;
}
function polylinePath(points, closed) {
    if (!points.length)
        return "";
    const parts = [`M ${points[0].x.toFixed(3)} ${points[0].y.toFixed(3)}`];
    for (let i = 1; i < points.length; i++) {
        parts.push(`L ${points[i].x.toFixed(3)} ${points[i].y.toFixed(3)}`);
    }
    if (closed)
        parts.push("Z");
    return parts.join(" ");
}
/** Open line path in local coordinates. */
export function linePathFromPoints(x1, y1, x2, y2) {
    return `M ${x1.toFixed(3)} ${y1.toFixed(3)} L ${x2.toFixed(3)} ${y2.toFixed(3)}`;
}
/** Closed rectangle path in local coordinates (0,0)–(w,h). */
export function rectPathFromSize(w, h) {
    if (w <= 0 || h <= 0)
        return "";
    return polylinePath([
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
    ], true);
}
/** Closed ellipse path approximated as a polyline in local bbox (w×h). */
export function ellipsePathFromSize(w, h, segments = 16) {
    if (w <= 0 || h <= 0)
        return "";
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const pts = [];
    for (let i = 0; i < segments; i++) {
        const ang = (2 * Math.PI * i) / segments;
        pts.push({ x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) });
    }
    return polylinePath(pts, true);
}
/** Convert SVG polygon/polyline `points` attribute to a path `d` string. */
export function polygonPointsToPath(points, closed) {
    const pts = points
        .trim()
        .split(/\s+|,/)
        .map(Number)
        .filter((n) => Number.isFinite(n));
    if (pts.length < 2)
        return "";
    const out = [`M ${pts[0]} ${pts[1]}`];
    for (let i = 2; i < pts.length; i += 2)
        out.push(`L ${pts[i]} ${pts[i + 1]}`);
    if (closed)
        out.push("Z");
    return out.join(" ");
}
function reversePoints(points) {
    return [...points].reverse();
}
function rotatePoints(points, offset) {
    if (!points.length || offset === 0)
        return points;
    const o = ((offset % points.length) + points.length) % points.length;
    if (o === 0)
        return points;
    return [...points.slice(o), ...points.slice(0, o)];
}
function polylinePairScore(a, b) {
    const n = Math.min(a.length, b.length);
    let score = 0;
    for (let i = 0; i < n; i++)
        score += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
    return score;
}
/**
 * Rotate / reverse `b` so closed polylines align for smoother morph tweens.
 * Exported for regression tests.
 */
export function alignClosedPolylines(a, b) {
    if (!a.length || a.length !== b.length || a.length < 3)
        return { a, b };
    let bestB = b;
    let bestScore = Infinity;
    for (const candidate of [b, reversePoints(b)]) {
        for (let offset = 0; offset < candidate.length; offset++) {
            const rotated = rotatePoints(candidate, offset);
            const score = polylinePairScore(a, rotated);
            if (score < bestScore) {
                bestScore = score;
                bestB = rotated;
            }
        }
    }
    return { a, b: bestB };
}
/** Align open polylines by optional reverse (same point count). */
function alignOpenPolylines(a, b) {
    if (!a.length || a.length !== b.length)
        return b;
    const rev = reversePoints(b);
    return polylinePairScore(a, rev) < polylinePairScore(a, b) ? rev : b;
}
function alignResampledPolylines(a, b, closed) {
    if (!a.length || a.length !== b.length)
        return b;
    if (closed)
        return alignClosedPolylines(a, b).b;
    return alignOpenPolylines(a, b);
}
function cubicAt(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    return {
        x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
        y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
    };
}
function quadAt(p0, p1, p2, t) {
    const u = 1 - t;
    return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
}
/** SVG arc endpoint → center parameterization (W3C implementation notes). */
function arcCenter(x0, y0, rx, ry, phi, largeArc, sweep, x1, y1) {
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || Math.abs(rx) < 1e-6 || Math.abs(ry) < 1e-6)
        return null;
    if (Math.hypot(x0 - x1, y0 - y1) < 1e-4)
        return null;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const dx = (x0 - x1) / 2;
    const dy = (y0 - y1) / 2;
    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;
    let rx2 = Math.abs(rx);
    let ry2 = Math.abs(ry);
    const lam = (x1p * x1p) / (rx2 * rx2) + (y1p * y1p) / (ry2 * ry2);
    if (lam > 1) {
        const s = Math.sqrt(lam);
        rx2 *= s;
        ry2 *= s;
    }
    const sq = Math.max(0, (rx2 * rx2 * ry2 * ry2 - rx2 * rx2 * y1p * y1p - ry2 * ry2 * x1p * x1p) /
        (rx2 * rx2 * y1p * y1p + ry2 * ry2 * x1p * x1p));
    const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(sq);
    const cxp = (coef * rx2 * y1p) / ry2;
    const cyp = (coef * -ry2 * x1p) / rx2;
    const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;
    const angleBetween = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const theta1 = angleBetween(1, 0, (x1p - cxp) / rx2, (y1p - cyp) / ry2);
    let delta = angleBetween((x1p - cxp) / rx2, (y1p - cyp) / ry2, (-x1p - cxp) / rx2, (-y1p - cyp) / ry2);
    if (sweep === 0 && delta > 0)
        delta -= 2 * Math.PI;
    if (sweep === 1 && delta < 0)
        delta += 2 * Math.PI;
    return { cx, cy, start: theta1, delta };
}
function lineSamples(x0, y0, x1, y1, segments) {
    const n = Math.max(2, segments);
    const out = [];
    for (let i = 1; i <= n; i++) {
        const t = i / n;
        out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
    return out;
}
function ellipseSamples(cx, cy, rx, ry, phi, segments) {
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const out = [];
    const n = Math.max(8, segments);
    for (let i = 1; i <= n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const lx = rx * Math.cos(ang);
        const ly = ry * Math.sin(ang);
        out.push({
            x: cosPhi * lx - sinPhi * ly + cx,
            y: sinPhi * lx + cosPhi * ly + cy,
        });
    }
    return out;
}
function arcToPoints(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1, segments) {
    const phi = (rotDeg * Math.PI) / 180;
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || Math.abs(rx) < 1e-6 || Math.abs(ry) < 1e-6) {
        return lineSamples(x0, y0, x1, y1, Math.max(2, segments));
    }
    if (Math.hypot(x0 - x1, y0 - y1) < 1e-3) {
        if (largeArc)
            return ellipseSamples(x0, y0, Math.abs(rx), Math.abs(ry), phi, Math.max(8, segments));
        return lineSamples(x0, y0, x1, y1, 2);
    }
    const center = arcCenter(x0, y0, rx, ry, phi, largeArc, sweep, x1, y1);
    if (!center || !Number.isFinite(center.cx) || !Number.isFinite(center.cy) || !Number.isFinite(center.delta)) {
        return lineSamples(x0, y0, x1, y1, Math.max(2, segments));
    }
    const { cx, cy, start, delta } = center;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    const out = [];
    for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const ang = start + delta * t;
        const lx = rx * Math.cos(ang);
        const ly = ry * Math.sin(ang);
        out.push({
            x: cosPhi * lx - sinPhi * ly + cx,
            y: sinPhi * lx + cosPhi * ly + cy,
        });
    }
    return out;
}
/** Sample absolute path commands into a polyline (Bezier / arc aware). */
export function flattenPathToPoints(commands, segmentsPerCurve = 8) {
    const out = [];
    let cx = 0;
    let cy = 0;
    let closed = false;
    for (const { cmd, args } of commands) {
        if (cmd === "Z") {
            closed = true;
            continue;
        }
        if (cmd === "M") {
            cx = args[0];
            cy = args[1];
            out.push({ x: cx, y: cy });
            continue;
        }
        if (cmd === "L") {
            cx = args[0];
            cy = args[1];
            out.push({ x: cx, y: cy });
            continue;
        }
        if (cmd === "C") {
            const p0 = { x: cx, y: cy };
            const p1 = { x: args[0], y: args[1] };
            const p2 = { x: args[2], y: args[3] };
            const p3 = { x: args[4], y: args[5] };
            for (let i = 1; i <= segmentsPerCurve; i++) {
                out.push(cubicAt(p0, p1, p2, p3, i / segmentsPerCurve));
            }
            cx = p3.x;
            cy = p3.y;
            continue;
        }
        if (cmd === "Q") {
            const p0 = { x: cx, y: cy };
            const p1 = { x: args[0], y: args[1] };
            const p2 = { x: args[2], y: args[3] };
            for (let i = 1; i <= segmentsPerCurve; i++) {
                out.push(quadAt(p0, p1, p2, i / segmentsPerCurve));
            }
            cx = p2.x;
            cy = p2.y;
            continue;
        }
        if (cmd === "A") {
            const pts = arcToPoints(cx, cy, args[0], args[1], args[2], args[3], args[4], args[5], args[6], Math.max(4, segmentsPerCurve));
            out.push(...pts);
            if (pts.length) {
                cx = pts[pts.length - 1].x;
                cy = pts[pts.length - 1].y;
            }
            continue;
        }
    }
    if (closed && out.length > 1)
        out.push({ ...out[0] });
    return out;
}
function pathIsClosed(commands) {
    return commands.some((c) => c.cmd === "Z");
}
function normalizePathD(d) {
    return pathToAbsolute(parsePathCommands(d));
}
/** Build a tween for morphing `fromD` → `toD`, or null when only FLIP should apply. */
export function makeMorphPathTween(fromD, toD) {
    const a = normalizePathD(fromD);
    const b = normalizePathD(toD);
    const na = commandsToNumbers(a);
    const nb = commandsToNumbers(b);
    if (na.cmds.join("") === nb.cmds.join("") && na.nums.length === nb.nums.length && na.nums.length > 0) {
        return (t) => buildPathFromInterp(na.cmds, na.nums, nb.nums, t);
    }
    const polyA = asPolyline(a);
    const polyB = asPolyline(b);
    if (polyA && polyB) {
        const closed = polyA.closed || polyB.closed;
        const n = Math.max(polyA.points.length, polyB.points.length, closed ? 8 : 4);
        const ra = resamplePolyline(polyA.points, polyA.closed, n);
        const rb = alignResampledPolylines(ra, resamplePolyline(polyB.points, polyB.closed, n), closed);
        return (t) => {
            const mid = ra.map((p, i) => ({
                x: lerp(p.x, rb[i].x, t),
                y: lerp(p.y, rb[i].y, t),
            }));
            return polylinePath(mid, closed);
        };
    }
    const flatA = flattenPathToPoints(a, 8);
    const flatB = flattenPathToPoints(b, 8);
    if (flatA.length >= 2 && flatB.length >= 2) {
        const closed = pathIsClosed(a) || pathIsClosed(b);
        const n = Math.max(flatA.length, flatB.length, 16);
        const ra = resamplePolyline(flatA, closed, n);
        const rb = alignResampledPolylines(ra, resamplePolyline(flatB, closed, n), closed);
        return (t) => {
            const mid = ra.map((p, i) => ({
                x: lerp(p.x, rb[i].x, t),
                y: lerp(p.y, rb[i].y, t),
            }));
            return polylinePath(mid, closed);
        };
    }
    return null;
}
/** Whether path geometry can morph (vs FLIP-only). */
export function morphPathCompatible(fromD, toD) {
    return makeMorphPathTween(fromD, toD) !== null;
}
/** Compare two paths after normalization (for shape matching). */
export function morphPathSignature(d) {
    const cmds = normalizePathD(d);
    const flat = flattenPathToPoints(cmds, 6);
    if (flat.length >= 2) {
        const closed = pathIsClosed(cmds);
        const rs = resamplePolyline(flat, closed, 8);
        return `flat|${closed ? 1 : 0}|${rs.map((p) => `${Math.round(p.x / 8)},${Math.round(p.y / 8)}`).join(";")}`;
    }
    const poly = asPolyline(cmds);
    if (poly) {
        const n = 6;
        const rs = resamplePolyline(poly.points, poly.closed, n);
        return `poly|${poly.closed ? 1 : 0}|${rs.map((p) => `${Math.round(p.x / 8)},${Math.round(p.y / 8)}`).join(";")}`;
    }
    const { cmds: c, nums } = commandsToNumbers(cmds);
    const rounded = nums.map((v) => Math.round(v / 4));
    return `${c.join("")}|${rounded.join(",")}`;
}
