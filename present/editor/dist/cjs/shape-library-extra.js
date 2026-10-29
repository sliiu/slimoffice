"use strict";
// Additional OOXML §20.1.10.55 preset shapes (batch 2) — merged into SHAPE_LIBRARY.
// Keeps shape-library.ts readable while expanding the gallery past 100 entries.
Object.defineProperty(exports, "__esModule", { value: true });
exports.extraCalloutsEntries = exports.extraStarsBannersEntries = exports.extraFlowchartEntries = exports.extraArrowEntries = exports.extraBasicEntries = exports.extraRectEntries = exports.extraLineEntries = void 0;
function poly(points) {
    return { kind: "polygon", points };
}
function regularPolygon(b, n, rotateDeg = -90) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const rx = b.w / 2;
    const ry = b.h / 2;
    const pts = [];
    const start = (rotateDeg * Math.PI) / 180;
    for (let i = 0; i < n; i++) {
        const a = start + (Math.PI * 2 * i) / n;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
}
function starPts(b, n, innerRatio, rotateDeg = -90) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const rx = b.w / 2;
    const ry = b.h / 2;
    const start = (rotateDeg * Math.PI) / 180;
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const r = i % 2 === 0 ? 1 : innerRatio;
        const a = start + (Math.PI * i) / n;
        pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
    }
    return pts;
}
function arcPoints(cx, cy, rx, ry, a0, a1, segs) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
        const a = a0 + ((a1 - a0) * i) / segs;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
}
exports.extraLineEntries = [
    {
        id: "curvedConnector",
        category: "lines",
        labelKey: "shapeLib.curvedConnector",
        fallback: "Curved Connector",
        geom: (b) => {
            const segs = 16;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const t = i / segs;
                const x = b.x + b.w * t;
                const y = b.y + b.h - Math.sin(t * Math.PI) * b.h * 0.85;
                pts.push([x, y]);
            }
            return poly(pts);
        },
        icon: '<path d="M3,20 Q12,4 21,20" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "leftBrace",
        category: "lines",
        labelKey: "shapeLib.leftBrace",
        fallback: "Left Brace",
        geom: (b) => {
            const w = b.w * 0.35;
            const mid = b.y + b.h / 2;
            const bulge = b.w * 0.65;
            const segs = 8;
            const pts = [];
            pts.push(...arcPoints(b.x + w, b.y + w, w, w, Math.PI, Math.PI * 1.5, segs));
            pts.push(...arcPoints(b.x + bulge, mid, bulge - w, b.h * 0.22, Math.PI * 1.5, Math.PI / 2, segs));
            pts.push(...arcPoints(b.x + w, b.y + b.h - w, w, w, Math.PI / 2, 0, segs));
            return poly(pts);
        },
        icon: '<path d="M10,4 Q4,12 10,20 M10,4 Q16,12 10,20" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "rightBrace",
        category: "lines",
        labelKey: "shapeLib.rightBrace",
        fallback: "Right Brace",
        geom: (b) => {
            const w = b.w * 0.35;
            const mid = b.y + b.h / 2;
            const bulge = b.w * 0.65;
            const segs = 8;
            const pts = [];
            pts.push(...arcPoints(b.x + b.w - w, b.y + w, w, w, -Math.PI / 2, 0, segs));
            pts.push(...arcPoints(b.x + b.w - bulge, mid, bulge - w, b.h * 0.22, 0, Math.PI, segs));
            pts.push(...arcPoints(b.x + b.w - w, b.y + b.h - w, w, w, Math.PI, Math.PI / 2, segs));
            return poly(pts);
        },
        icon: '<path d="M14,4 Q20,12 14,20 M14,4 Q8,12 14,20" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
];
exports.extraRectEntries = [
    {
        id: "snip2DiagRect",
        category: "rect",
        labelKey: "shapeLib.snip2DiagRect",
        fallback: "Snip Diagonal Corners",
        geom: (b) => {
            const c = Math.min(b.w, b.h) * 0.18;
            return poly([
                [b.x + c, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h - c],
                [b.x + b.w - c, b.y + b.h],
                [b.x, b.y + b.h],
                [b.x, b.y + c],
            ]);
        },
        icon: '<polygon points="7,5 21,5 21,15 17,19 3,19 3,9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "round2DiagRect",
        category: "rect",
        labelKey: "shapeLib.round2DiagRect",
        fallback: "Round Diagonal Corners",
        geom: (b) => {
            const r = Math.min(b.w, b.h) * 0.18;
            const segs = 6;
            const pts = [];
            pts.push([b.x + r, b.y]);
            pts.push([b.x + b.w, b.y]);
            pts.push(...arcPoints(b.x + b.w - r, b.y + b.h - r, r, r, 0, Math.PI / 2, segs));
            pts.push([b.x, b.y + b.h]);
            pts.push(...arcPoints(b.x + r, b.y + r, r, r, Math.PI, (Math.PI * 3) / 2, segs));
            return poly(pts);
        },
        icon: '<path d="M7,5 H21 V15 A4,4 0 0,1 17,19 H3 V9 A4,4 0 0,1 7,5 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "snipRoundRect",
        category: "rect",
        labelKey: "shapeLib.snipRoundRect",
        fallback: "Snip and Round Corner",
        geom: (b) => {
            const c = Math.min(b.w, b.h) * 0.18;
            const r = c;
            const segs = 6;
            const pts = [];
            pts.push([b.x, b.y]);
            pts.push([b.x + b.w - c, b.y]);
            pts.push([b.x + b.w, b.y + c]);
            pts.push([b.x + b.w, b.y + b.h - r]);
            pts.push(...arcPoints(b.x + b.w - r, b.y + b.h - r, r, r, 0, Math.PI / 2, segs));
            pts.push([b.x, b.y + b.h]);
            return poly(pts);
        },
        icon: '<path d="M3,5 H17 L21,9 V19 H3 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "bevel",
        category: "rect",
        labelKey: "shapeLib.bevel",
        fallback: "Bevel",
        geom: (b) => {
            const c = Math.min(b.w, b.h) * 0.2;
            return poly([
                [b.x + c, b.y],
                [b.x + b.w - c, b.y],
                [b.x + b.w, b.y + c],
                [b.x + b.w, b.y + b.h - c],
                [b.x + b.w - c, b.y + b.h],
                [b.x + c, b.y + b.h],
                [b.x, b.y + b.h - c],
                [b.x, b.y + c],
            ]);
        },
        icon: '<polygon points="6,5 18,5 21,8 21,16 18,19 6,19 3,16 3,8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
];
exports.extraBasicEntries = [
    {
        id: "decagon",
        category: "basic",
        labelKey: "shapeLib.decagon",
        fallback: "Decagon",
        geom: (b) => poly(regularPolygon(b, 10)),
        icon: '<polygon points="12,2 18.5,5 21,12 18.5,19 12,22 5.5,19 3,12 5.5,5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "dodecagon",
        category: "basic",
        labelKey: "shapeLib.dodecagon",
        fallback: "Dodecagon",
        geom: (b) => poly(regularPolygon(b, 12)),
        icon: '<polygon points="12,2 17,4 20,8 22,12 20,16 17,20 12,22 7,20 4,16 2,12 4,8 7,4" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "cloud",
        category: "basic",
        labelKey: "shapeLib.cloud",
        fallback: "Cloud",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const lobes = 6;
            const segs = 6;
            const pts = [];
            for (let i = 0; i < lobes; i++) {
                const a = (Math.PI * 2 * i) / lobes - Math.PI / 2;
                const lx = cx + Math.cos(a) * b.w * 0.38;
                const ly = cy + Math.sin(a) * b.h * 0.32;
                const lr = Math.min(b.w, b.h) * 0.22;
                pts.push(...arcPoints(lx, ly, lr, lr * 0.85, a - Math.PI / 2, a + Math.PI / 2, segs));
            }
            return poly(pts);
        },
        icon: '<path d="M7,14 A4,4 0 0,1 7,8 A5,5 0 0,1 17,7 A4,4 0 0,1 19,14 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "chord",
        category: "basic",
        labelKey: "shapeLib.chord",
        fallback: "Chord",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const rx = b.w / 2;
            const ry = b.h / 2;
            const segs = 24;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const a = Math.PI + (Math.PI * i) / segs;
                pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
            }
            return poly(pts);
        },
        icon: '<path d="M4,12 A8,6 0 0,1 20,12 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "leftBracket",
        category: "basic",
        labelKey: "shapeLib.leftBracket",
        fallback: "Left Bracket",
        geom: (b) => {
            const t = Math.min(b.w, b.h) * 0.15;
            return poly([
                [b.x + b.w, b.y],
                [b.x + t, b.y],
                [b.x, b.y + t],
                [b.x, b.y + b.h - t],
                [b.x + t, b.y + b.h],
                [b.x + b.w, b.y + b.h],
            ]);
        },
        icon: '<path d="M18,4 H8 L4,8 V16 L8,20 H18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "rightBracket",
        category: "basic",
        labelKey: "shapeLib.rightBracket",
        fallback: "Right Bracket",
        geom: (b) => {
            const t = Math.min(b.w, b.h) * 0.15;
            return poly([
                [b.x, b.y],
                [b.x + b.w - t, b.y],
                [b.x + b.w, b.y + t],
                [b.x + b.w, b.y + b.h - t],
                [b.x + b.w - t, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<path d="M6,4 H16 L20,8 V16 L16,20 H6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "gear6",
        category: "basic",
        labelKey: "shapeLib.gear6",
        fallback: "Gear",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const outer = Math.min(b.w, b.h) / 2;
            const inner = outer * 0.72;
            const hole = outer * 0.35;
            const teeth = 6;
            const pts = [];
            for (let i = 0; i < teeth; i++) {
                const a0 = (Math.PI * 2 * i) / teeth - Math.PI / teeth;
                const a1 = (Math.PI * 2 * i) / teeth;
                const a2 = (Math.PI * 2 * (i + 0.5)) / teeth;
                pts.push([cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner]);
                pts.push([cx + Math.cos(a1) * outer, cy + Math.sin(a1) * outer]);
                pts.push([cx + Math.cos(a2) * outer, cy + Math.sin(a2) * outer]);
            }
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") +
                " Z" +
                ` M ${cx + hole} ${cy} A ${hole} ${hole} 0 1 0 ${cx - hole} ${cy} A ${hole} ${hole} 0 1 0 ${cx + hole} ${cy} Z`;
            return { kind: "path", d, fillRule: "evenodd" };
        },
        icon: '<path d="M12,3 L14,7 L18,6 L17,10 L21,12 L17,14 L18,18 L14,17 L12,21 L10,17 L6,18 L7,14 L3,12 L7,10 L6,6 L10,7 Z M12,9 A3,3 0 1,0 12,15 A3,3 0 1,0 12,9 Z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    },
    {
        id: "irregularSeal1",
        category: "basic",
        labelKey: "shapeLib.irregularSeal1",
        fallback: "Explosion",
        geom: (b) => poly(starPts(b, 12, 0.55, 0)),
        icon: '<polygon points="12,2 14,8 20,6 16,11 22,12 16,13 20,18 14,16 12,22 10,16 4,18 8,13 2,12 8,11 4,6 10,8" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    },
    {
        id: "funnel",
        category: "basic",
        labelKey: "shapeLib.funnel",
        fallback: "Funnel",
        geom: (b) => {
            const neck = b.w * 0.2;
            return poly([
                [b.x, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w / 2 + neck, b.y + b.h],
                [b.x + b.w / 2 - neck, b.y + b.h],
            ]);
        },
        icon: '<polygon points="3,5 21,5 14,19 10,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "arc",
        category: "basic",
        labelKey: "shapeLib.arc",
        fallback: "Arc",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h;
            const rx = b.w / 2;
            const ry = b.h;
            const segs = 24;
            const pts = [[b.x, cy], [b.x + b.w, cy]];
            for (let i = segs; i >= 0; i--) {
                const a = Math.PI + (Math.PI * i) / segs;
                pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
            }
            return poly(pts);
        },
        icon: '<path d="M4,20 A8,8 0 0,1 20,20 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "foldedCorner",
        category: "basic",
        labelKey: "shapeLib.foldedCorner",
        fallback: "Folded Corner",
        geom: (b) => {
            const c = Math.min(b.w, b.h) * 0.28;
            return poly([
                [b.x, b.y],
                [b.x + b.w - c, b.y],
                [b.x + b.w, b.y + c],
                [b.x + b.w, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<polygon points="3,5 15,5 21,11 21,19 3,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "halfFrame",
        category: "basic",
        labelKey: "shapeLib.halfFrame",
        fallback: "Half Frame",
        geom: (b) => {
            const t = Math.min(b.w, b.h) * 0.22;
            return {
                kind: "path",
                d: `M ${b.x} ${b.y} L ${b.x + b.w} ${b.y} L ${b.x + b.w} ${b.y + b.h} L ${b.x + t} ${b.y + b.h} L ${b.x + t} ${b.y + t} L ${b.x} ${b.y + t} Z`,
                fillRule: "evenodd",
            };
        },
        icon: '<path d="M3,5 H21 V19 H8 V10 H3 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
];
exports.extraArrowEntries = [
    {
        id: "notchedRightArrow",
        category: "arrows",
        labelKey: "shapeLib.notchedRightArrow",
        fallback: "Notched Right Arrow",
        geom: (b) => {
            const head = b.w * 0.38;
            const notch = b.h * 0.22;
            const tail = b.h * 0.28;
            return poly([
                [b.x, b.y + tail],
                [b.x + b.w - head, b.y + tail],
                [b.x + b.w - head, b.y + notch],
                [b.x + b.w, b.y + b.h / 2],
                [b.x + b.w - head, b.y + b.h - notch],
                [b.x + b.w - head, b.y + b.h - tail],
                [b.x, b.y + b.h - tail],
                [b.x + head * 0.35, b.y + b.h / 2],
            ]);
        },
        icon: '<polygon points="3,9 13,9 13,6 21,12 13,18 13,15 3,15 7,12" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "stripedRightArrow",
        category: "arrows",
        labelKey: "shapeLib.stripedRightArrow",
        fallback: "Striped Right Arrow",
        geom: (b) => {
            const head = b.w * 0.42;
            const tail = b.h * 0.3;
            return poly([
                [b.x, b.y + tail],
                [b.x + b.w - head, b.y + tail],
                [b.x + b.w - head, b.y],
                [b.x + b.w, b.y + b.h / 2],
                [b.x + b.w - head, b.y + b.h],
                [b.x + b.w - head, b.y + b.h - tail],
                [b.x, b.y + b.h - tail],
            ]);
        },
        icon: '<polygon points="3,9 14,9 14,4 21,12 14,20 14,15 3,15" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="9" x2="8" y2="15" stroke="currentColor" stroke-width="1.2"/>',
    },
    {
        id: "curvedRightArrow",
        category: "arrows",
        labelKey: "shapeLib.curvedRightArrow",
        fallback: "Curved Right Arrow",
        geom: (b) => {
            const head = Math.min(b.w, b.h) * 0.28;
            const segs = 14;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const t = i / segs;
                const a = Math.PI * 0.85 - t * Math.PI * 0.85;
                pts.push([b.x + b.w * 0.15 + Math.cos(a) * b.w * 0.55, b.y + b.h * 0.85 + Math.sin(a) * b.h * 0.55]);
            }
            pts.push([b.x + b.w, b.y + b.h * 0.55]);
            pts.push([b.x + b.w - head, b.y + b.h * 0.55 - head]);
            pts.push([b.x + b.w - head * 0.4, b.y + b.h * 0.55]);
            return poly(pts);
        },
        icon: '<path d="M4,18 Q4,6 16,8 L20,5 L16,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "curvedLeftArrow",
        category: "arrows",
        labelKey: "shapeLib.curvedLeftArrow",
        fallback: "Curved Left Arrow",
        geom: (b) => {
            const head = Math.min(b.w, b.h) * 0.28;
            const segs = 14;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const t = i / segs;
                const a = Math.PI * 0.15 + t * Math.PI * 0.85;
                pts.push([b.x + b.w * 0.85 + Math.cos(a) * b.w * 0.55, b.y + b.h * 0.85 + Math.sin(a) * b.h * 0.55]);
            }
            pts.push([b.x, b.y + b.h * 0.55]);
            pts.push([b.x + head, b.y + b.h * 0.55 - head]);
            pts.push([b.x + head * 0.4, b.y + b.h * 0.55]);
            return poly(pts);
        },
        icon: '<path d="M20,18 Q20,6 8,8 L4,5 L8,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "circularArrow",
        category: "arrows",
        labelKey: "shapeLib.circularArrow",
        fallback: "Circular Arrow",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const rx = b.w * 0.38;
            const ry = b.h * 0.38;
            const stem = Math.min(b.w, b.h) * 0.14;
            const head = stem * 1.5;
            const segs = 20;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const a = -Math.PI * 0.15 + (Math.PI * 1.35 * i) / segs;
                pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
            }
            const end = pts[pts.length - 1];
            pts.push([end[0] + head, end[1] - head * 0.3]);
            pts.push([end[0] + stem, end[1] + stem]);
            return poly(pts);
        },
        icon: '<path d="M18,8 A8,8 0 1,0 8,18 L5,15 L10,14" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "homePlate",
        category: "arrows",
        labelKey: "shapeLib.homePlate",
        fallback: "Home Plate",
        geom: (b) => {
            const point = b.w * 0.22;
            return poly([
                [b.x, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h],
                [b.x + b.w / 2 + point, b.y + b.h],
                [b.x + b.w / 2, b.y + b.h - point],
                [b.x + b.w / 2 - point, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<polygon points="3,5 21,5 21,19 14,19 12,15 10,19 3,19" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "leftUpArrow",
        category: "arrows",
        labelKey: "shapeLib.leftUpArrow",
        fallback: "Left-Up Arrow",
        geom: (b) => {
            const head = Math.min(b.w, b.h) * 0.32;
            const tail = Math.min(b.w, b.h) * 0.22;
            return poly([
                [b.x + b.w - tail, b.y + b.h],
                [b.x + b.w - tail, b.y + head],
                [b.x + b.w, b.y + head],
                [b.x + head, b.y],
                [b.x, b.y + head],
                [b.x + head, b.y + head],
                [b.x + head, b.y + b.h - tail],
                [b.x + b.w, b.y + b.h - tail],
            ]);
        },
        icon: '<polygon points="12,3 21,12 16,12 16,21 8,21 8,12 3,12" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "rightUpArrow",
        category: "arrows",
        labelKey: "shapeLib.rightUpArrow",
        fallback: "Right-Up Arrow",
        geom: (b) => {
            const head = Math.min(b.w, b.h) * 0.32;
            const tail = Math.min(b.w, b.h) * 0.22;
            return poly([
                [b.x + tail, b.y + b.h],
                [b.x + tail, b.y + head],
                [b.x, b.y + head],
                [b.x + b.w - head, b.y],
                [b.x + b.w, b.y + head],
                [b.x + b.w - head, b.y + head],
                [b.x + b.w - head, b.y + b.h - tail],
                [b.x, b.y + b.h - tail],
            ]);
        },
        icon: '<polygon points="12,3 3,12 8,12 8,21 16,21 16,12 21,12" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "leftCircularArrow",
        category: "arrows",
        labelKey: "shapeLib.leftCircularArrow",
        fallback: "Left Circular Arrow",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const rx = b.w * 0.36;
            const ry = b.h * 0.36;
            const head = Math.min(b.w, b.h) * 0.2;
            const segs = 18;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const a = Math.PI * 0.2 + (Math.PI * 1.2 * i) / segs;
                pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
            }
            const end = pts[pts.length - 1];
            pts.push([end[0] - head, end[1] - head * 0.4]);
            pts.push([end[0] - head * 0.3, end[1] + head * 0.2]);
            return poly(pts);
        },
        icon: '<path d="M6,16 A8,8 0 1,1 16,6 L19,9 L14,10" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "rightCircularArrow",
        category: "arrows",
        labelKey: "shapeLib.rightCircularArrow",
        fallback: "Right Circular Arrow",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const rx = b.w * 0.36;
            const ry = b.h * 0.36;
            const head = Math.min(b.w, b.h) * 0.2;
            const segs = 18;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const a = -Math.PI * 0.35 + (Math.PI * 1.2 * i) / segs;
                pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
            }
            const end = pts[pts.length - 1];
            pts.push([end[0] + head, end[1] - head * 0.4]);
            pts.push([end[0] + head * 0.3, end[1] + head * 0.2]);
            return poly(pts);
        },
        icon: '<path d="M18,16 A8,8 0 1,0 8,6 L5,9 L10,10" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
];
exports.extraFlowchartEntries = [
    {
        id: "flowChartAlternateProcess",
        category: "flowchart",
        labelKey: "shapeLib.flowChartAlternateProcess",
        fallback: "Alternate Process",
        geom: (b) => ({ kind: "rect", rx: Math.min(b.w, b.h) * 0.08 }),
        icon: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/>',
    },
    {
        id: "flowChartPredefinedProcess",
        category: "flowchart",
        labelKey: "shapeLib.flowChartPredefinedProcess",
        fallback: "Predefined Process",
        geom: (b) => {
            const bar = b.w * 0.12;
            return {
                kind: "path",
                d: `M ${b.x + bar} ${b.y} H ${b.x + b.w - bar} V ${b.y + b.h} H ${b.x + bar} Z` +
                    ` M ${b.x} ${b.y} H ${b.x + bar} V ${b.y + b.h} H ${b.x} Z` +
                    ` M ${b.x + b.w - bar} ${b.y} H ${b.x + b.w} V ${b.y + b.h} H ${b.x + b.w - bar} Z`,
                fillRule: "evenodd",
            };
        },
        icon: '<path d="M7,6 H17 V18 H7 Z M3,6 H7 V18 H3 Z M17,6 H21 V18 H17 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "flowChartInternalStorage",
        category: "flowchart",
        labelKey: "shapeLib.flowChartInternalStorage",
        fallback: "Internal Storage",
        geom: (b) => {
            const off = b.w * 0.15;
            return {
                kind: "path",
                d: `M ${b.x} ${b.y} H ${b.x + b.w} V ${b.y + b.h} H ${b.x} Z` +
                    ` M ${b.x + off} ${b.y + off} H ${b.x + b.w} V ${b.y + b.h} H ${b.x + off} Z`,
                fillRule: "evenodd",
            };
        },
        icon: '<path d="M3,6 H21 V18 H3 Z M6,9 H18 V15 H6 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "flowChartMagneticDisk",
        category: "flowchart",
        labelKey: "shapeLib.flowChartMagneticDisk",
        fallback: "Magnetic Disk",
        geom: (b) => ({ kind: "ellipse" }),
        icon: '<ellipse cx="12" cy="12" rx="9" ry="6" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="4" ry="2.5" fill="none" stroke="currentColor" stroke-width="1"/>',
    },
    {
        id: "flowChartDelay",
        category: "flowchart",
        labelKey: "shapeLib.flowChartDelay",
        fallback: "Delay",
        geom: (b) => {
            const r = b.h / 2;
            const segs = 10;
            const pts = [[b.x, b.y], [b.x, b.y + b.h]];
            pts.push(...arcPoints(b.x + b.w - r, b.y + r, r, r, Math.PI / 2, -Math.PI / 2, segs));
            pts.push([b.x + b.w - r, b.y]);
            return poly(pts);
        },
        icon: '<path d="M3,6 V18 H17 A5,6 0 0,0 17,6 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "flowChartDisplay",
        category: "flowchart",
        labelKey: "shapeLib.flowChartDisplay",
        fallback: "Display",
        geom: (b) => {
            const sk = b.w * 0.15;
            return poly([
                [b.x + sk, b.y],
                [b.x + b.w - sk, b.y],
                [b.x + b.w, b.y + b.h / 2],
                [b.x + b.w - sk, b.y + b.h],
                [b.x + sk, b.y + b.h],
                [b.x, b.y + b.h / 2],
            ]);
        },
        icon: '<polygon points="6,5 18,5 21,12 18,19 6,19 3,12" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "flowChartOffpageConnector",
        category: "flowchart",
        labelKey: "shapeLib.flowChartOffpageConnector",
        fallback: "Off-page Connector",
        geom: (b) => {
            const cut = b.w * 0.22;
            return poly([
                [b.x, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h - cut],
                [b.x + b.w / 2 + cut * 0.4, b.y + b.h - cut],
                [b.x + b.w / 2, b.y + b.h],
                [b.x + b.w / 2 - cut * 0.4, b.y + b.h - cut],
                [b.x, b.y + b.h - cut],
            ]);
        },
        icon: '<polygon points="3,5 21,5 21,15 14,15 12,19 10,15 3,15" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "flowChartSummingJunction",
        category: "flowchart",
        labelKey: "shapeLib.flowChartSummingJunction",
        fallback: "Summing Junction",
        geom: () => ({ kind: "ellipse" }),
        icon: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor"/><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor"/>',
    },
    {
        id: "flowChartOr",
        category: "flowchart",
        labelKey: "shapeLib.flowChartOr",
        fallback: "Or",
        geom: () => ({ kind: "ellipse" }),
        icon: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartMerge",
        category: "flowchart",
        labelKey: "shapeLib.flowChartMerge",
        fallback: "Merge",
        geom: (b) => poly([
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w / 2, b.y + b.h],
        ]),
        icon: '<polygon points="3,5 21,5 12,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartExtract",
        category: "flowchart",
        labelKey: "shapeLib.flowChartExtract",
        fallback: "Extract",
        geom: (b) => poly([
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y + b.h],
            [b.x, b.y + b.h],
        ]),
        icon: '<polygon points="12,5 21,19 3,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartSort",
        category: "flowchart",
        labelKey: "shapeLib.flowChartSort",
        fallback: "Sort",
        geom: (b) => poly([
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w / 2, b.y + b.h],
            [b.x, b.y + b.h / 2],
        ]),
        icon: '<polygon points="12,4 20,12 12,20 4,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartMultidocument",
        category: "flowchart",
        labelKey: "shapeLib.flowChartMultidocument",
        fallback: "Multi-document",
        geom: (b) => {
            const off = b.w * 0.12;
            const wave = b.h * 0.12;
            const outer = [
                [b.x + off, b.y + off],
                [b.x + b.w, b.y + off],
                [b.x + b.w, b.y + b.h],
                [b.x, b.y + b.h],
                [b.x, b.y + off + wave],
            ];
            return poly(outer);
        },
        icon: '<path d="M7,7 H21 V19 H5 V9 Z M3,5 H17 V17" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "flowChartCollate",
        category: "flowchart",
        labelKey: "shapeLib.flowChartCollate",
        fallback: "Collate",
        geom: (b) => {
            const sk = b.w * 0.18;
            return poly([
                [b.x, b.y],
                [b.x + b.w - sk, b.y],
                [b.x + b.w, b.y + sk],
                [b.x + b.w, b.y + b.h],
                [b.x + sk, b.y + b.h],
                [b.x, b.y + b.h - sk],
            ]);
        },
        icon: '<polygon points="3,5 17,5 21,9 21,19 7,19 3,15" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
];
exports.extraStarsBannersEntries = [
    {
        id: "star7",
        category: "starsBanners",
        labelKey: "shapeLib.star7",
        fallback: "7-Point Star",
        geom: (b) => poly(starPts(b, 7, 0.45, -90)),
        icon: '<polygon points="12,2 14,8 20,8 15,12 17,18 12,14 7,18 9,12 4,8 10,8" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "star16",
        category: "starsBanners",
        labelKey: "shapeLib.star16",
        fallback: "16-Point Star",
        geom: (b) => poly(starPts(b, 16, 0.75, -90)),
        icon: '<polygon points="12,2 12.8,6 16,4 14.5,7.5 18,8 15,10 17,13 13.5,12.5 14,16 12,13.5 10,16 10.5,12.5 7,13 9,10 6,8 9.5,7.5 8,4 11.2,6" fill="none" stroke="currentColor" stroke-width="1.2"/>',
    },
    {
        id: "star24",
        category: "starsBanners",
        labelKey: "shapeLib.star24",
        fallback: "24-Point Star",
        geom: (b) => poly(starPts(b, 24, 0.8, -90)),
        icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
    },
    {
        id: "horizontalScroll",
        category: "starsBanners",
        labelKey: "shapeLib.horizontalScroll",
        fallback: "Horizontal Scroll",
        geom: (b) => {
            const r = b.h * 0.12;
            const segs = 8;
            const pts = [];
            pts.push(...arcPoints(b.x + r, b.y + r, r, r, Math.PI, Math.PI / 2, segs));
            pts.push([b.x + b.w - r, b.y]);
            pts.push(...arcPoints(b.x + b.w - r, b.y + r, r, r, -Math.PI / 2, 0, segs));
            pts.push([b.x + b.w, b.y + b.h - r]);
            pts.push(...arcPoints(b.x + b.w - r, b.y + b.h - r, r, r, 0, Math.PI / 2, segs));
            pts.push([b.x + r, b.y + b.h]);
            pts.push(...arcPoints(b.x + r, b.y + b.h - r, r, r, Math.PI / 2, Math.PI, segs));
            return poly(pts);
        },
        icon: '<path d="M8,4 H20 A4,4 0 0,1 24,8 V16 A4,4 0 0,1 20,20 H4 A4,4 0 0,1 0,16 V8 A4,4 0 0,1 4,4 H8 Z" transform="translate(-2,2) scale(0.92)" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    },
    {
        id: "explosion1",
        category: "starsBanners",
        labelKey: "shapeLib.explosion1",
        fallback: "Explosion",
        geom: (b) => poly(starPts(b, 10, 0.35, 15)),
        icon: '<polygon points="12,2 13,7 18,5 15,9 21,10 16,12 19,17 13,14 12,22 11,14 5,17 8,12 3,10 9,9 6,5 11,7" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    },
    {
        id: "ellipseRibbon",
        category: "starsBanners",
        labelKey: "shapeLib.ellipseRibbon",
        fallback: "Ellipse Ribbon",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h * 0.42;
            const rx = b.w / 2;
            const ry = b.h * 0.35;
            const segs = 24;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const a = (Math.PI * 2 * i) / segs;
                pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
            }
            pts.push([b.x + b.w * 0.65, b.y + b.h]);
            pts.push([b.x + b.w * 0.35, b.y + b.h]);
            return poly(pts);
        },
        icon: '<path d="M3,10 A9,5 0 1,1 21,10 L16,19 L8,19 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
];
exports.extraCalloutsEntries = [
    {
        id: "accentCallout1",
        category: "callouts",
        labelKey: "shapeLib.accentCallout1",
        fallback: "Accent Callout",
        geom: (b) => {
            const r = Math.min(b.w, b.h) * 0.1;
            return poly([
                [b.x + r, b.y],
                [b.x + b.w - r, b.y],
                [b.x + b.w, b.y + r],
                [b.x + b.w, b.y + b.h * 0.72],
                [b.x + b.w * 0.55, b.y + b.h * 0.72],
                [b.x + b.w * 0.45, b.y + b.h],
                [b.x + b.w * 0.35, b.y + b.h * 0.72],
                [b.x, b.y + b.h * 0.72],
                [b.x, b.y + r],
            ]);
        },
        icon: '<polygon points="4,5 20,5 21,14 13,14 11,20 9,14 3,14" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "borderCallout1",
        category: "callouts",
        labelKey: "shapeLib.borderCallout1",
        fallback: "Border Callout",
        geom: (b) => {
            const inset = Math.min(b.w, b.h) * 0.12;
            return {
                kind: "path",
                d: `M ${b.x} ${b.y} H ${b.x + b.w} V ${b.y + b.h * 0.75} H ${b.x + b.w * 0.4} L ${b.x + b.w * 0.22} ${b.y + b.h} L ${b.x + b.w * 0.34} ${b.y + b.h * 0.75} H ${b.x} Z` +
                    ` M ${b.x + inset} ${b.y + inset} H ${b.x + b.w - inset} V ${b.y + b.h * 0.75 - inset} H ${b.x + inset} Z`,
                fillRule: "evenodd",
            };
        },
        icon: '<path d="M3,4 H21 V15 H11 L7,20 L9,15 H3 Z M6,7 H18 V12 H6 Z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    },
    {
        id: "callout1",
        category: "callouts",
        labelKey: "shapeLib.callout1",
        fallback: "Line Callout 1",
        geom: (b) => poly([
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h * 0.7],
            [b.x + b.w * 0.5, b.y + b.h * 0.7],
            [b.x + b.w * 0.35, b.y + b.h],
            [b.x + b.w * 0.42, b.y + b.h * 0.7],
            [b.x, b.y + b.h * 0.7],
        ]),
        icon: '<polygon points="3,4 21,4 21,14 12,14 8,20 10,14 3,14" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "callout2",
        category: "callouts",
        labelKey: "shapeLib.callout2",
        fallback: "Line Callout 2",
        geom: (b) => poly([
            [b.x, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h * 0.7],
            [b.x + b.w * 0.62, b.y + b.h * 0.7],
            [b.x + b.w * 0.72, b.y + b.h],
            [b.x + b.w * 0.5, b.y + b.h * 0.7],
            [b.x, b.y + b.h * 0.7],
        ]),
        icon: '<polygon points="3,4 21,4 21,14 15,14 17,20 12,14 3,14" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
];
