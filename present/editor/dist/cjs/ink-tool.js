"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInkShapeId = isInkShapeId;
exports.pointsToSvgPath = pointsToSvgPath;
exports.bboxFromPoints = bboxFromPoints;
exports.inkStrokeStyle = inkStrokeStyle;
exports.buildInkPathShape = buildInkPathShape;
exports.hitInkShapeAt = hitInkShapeAt;
const core_1 = require("@sliiu/present-core");
const shape_factory_1 = require("./shape-factory");
function isInkShapeId(id) {
    return id.startsWith("sp_ink_");
}
function pointsToSvgPath(points) {
    if (points.length === 0)
        return "";
    const [first, ...rest] = points;
    let d = `M ${first.x} ${first.y}`;
    for (const p of rest)
        d += ` L ${p.x} ${p.y}`;
    return d;
}
function bboxFromPoints(points, pad) {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad;
    const maxY = Math.max(...ys) + pad;
    return { x: minX, y: minY, w: Math.max(4, maxX - minX), h: Math.max(4, maxY - minY) };
}
function inkStrokeStyle(mode, penColor, penWidth) {
    const width = Math.max(1, penWidth);
    if (mode === "highlighter") {
        return { color: penColor, alpha: 0.42, width };
    }
    return { color: penColor, alpha: 1, width };
}
function buildInkPathShape(points, mode, penColor = "#111827", penWidth = 3) {
    if (points.length < 2)
        return null;
    const { color, alpha, width: strokeWidth } = inkStrokeStyle(mode, penColor, penWidth);
    const pad = strokeWidth / 2 + 2;
    return {
        kind: "path",
        id: (0, shape_factory_1.genShapeId)("ink"),
        name: mode === "highlighter" ? "Ink highlight" : "Ink pen",
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: 1,
        bbox: bboxFromPoints(points, pad),
        transform: (0, core_1.identityTransform)(),
        fill: { kind: "none" },
        stroke: {
            paint: { kind: "solid", color, alpha },
            width: strokeWidth,
            cap: "round",
            join: "round",
        },
        d: pointsToSvgPath(points),
        ink: { mode },
    };
}
/** Squared distance from point to segment AB. */
function distSqToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) {
        const ex = p.x - a.x;
        const ey = p.y - a.y;
        return ex * ex + ey * ey;
    }
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const ex = p.x - px;
    const ey = p.y - py;
    return ex * ex + ey * ey;
}
/** Hit-test ink path shapes (top-most first). */
function hitInkShapeAt(shapes, pt, radius) {
    const r2 = radius * radius;
    for (let i = shapes.length - 1; i >= 0; i--) {
        const sh = shapes[i];
        if (sh.kind !== "path" || !isInkShapeId(sh.id) || !sh.d)
            continue;
        const b = sh.bbox;
        if (pt.x < b.x - radius || pt.y < b.y - radius || pt.x > b.x + b.w + radius || pt.y > b.y + b.h + radius) {
            continue;
        }
        const tokens = sh.d.match(/[ML]\s*[-\d.]+(?:\s+[-\d.]+)?/g) ?? [];
        const pts = [];
        for (const tok of tokens) {
            const parts = tok.trim().split(/\s+/);
            const x = Number(parts[1]);
            const y = Number(parts[2]);
            if (Number.isFinite(x) && Number.isFinite(y))
                pts.push({ x, y });
        }
        for (let j = 1; j < pts.length; j++) {
            if (distSqToSegment(pt, pts[j - 1], pts[j]) <= r2)
                return sh.id;
        }
    }
    return null;
}
