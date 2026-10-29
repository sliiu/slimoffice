"use strict";
// PowerPoint 8 大分类形状预设库。覆盖 ~115 个 OOXML §20.1.10.55 ST_PresetGeometry
// 中最常用的形状。每个形状提供：
//   - id：与 OOXML preset 名一致（如 roundRect / pentagon / leftArrow）
//   - category：lines / rect / basic / arrows / flowchart / starsBanners / callouts
//   - geom(bbox)：在给定 bbox 内生成可渲染几何（rect / ellipse / polygon / path / line）
//   - icon：picker 弹层用的 24x24 mini SVG 内容（color = currentColor）
//
// 设计原则：
//   1. 优先用 polygon —— editor.ts 的 translateInPlace / rescaleInPlace 已能正确
//      处理 polygon 的 points 数组，移动 / 缩放无需特殊化。
//   2. 必须含「孔」或自相交的形状（donut / blockArc / frame / 标注三角嘴）改用 path，
//      并附上 presetType 让编辑器在 bbox 变化时重新生成 d。
//   3. 圆角 / 切角矩形可用原生 RectShape (rx) 或 polygon 多点近似 —— 这里圆角矩形
//      用 RectShape + rx，切角矩形用 polygon。
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_ORDER = exports.SHAPE_BY_ID = exports.SHAPE_LIBRARY = void 0;
exports.entriesByCategory = entriesByCategory;
const shape_library_extra_1 = require("./shape-library-extra");
// ---------- 几何工具 ----------
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
// 多分量曲线近似：以 N 段直线模拟一段圆弧（poly 内嵌）。
function arcPoints(cx, cy, rx, ry, a0, a1, segs) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
        const a = a0 + ((a1 - a0) * i) / segs;
        pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return pts;
}
// ---------- 各分类形状几何 ----------
// 1) Lines —— 大多放在 line shape，需要时让 stroke.tailEnd / headEnd 自带箭头。
const lineEntries = [
    {
        id: "line",
        category: "lines",
        labelKey: "shapeLib.line",
        fallback: "Line",
        geom: (b) => ({ kind: "line", x1: b.x, y1: b.y + b.h / 2, x2: b.x + b.w, y2: b.y + b.h / 2 }),
        icon: '<line x1="3" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="1.6" />',
    },
    {
        id: "lineArrow",
        category: "lines",
        labelKey: "shapeLib.lineArrow",
        fallback: "Arrow",
        geom: (b) => ({ kind: "line", x1: b.x, y1: b.y + b.h / 2, x2: b.x + b.w, y2: b.y + b.h / 2, arrow: "tail" }),
        icon: '<g fill="none" stroke="currentColor" stroke-width="1.6"><line x1="3" y1="12" x2="18" y2="12"/><polyline points="14,8 18,12 14,16"/></g>',
    },
    {
        id: "lineDoubleArrow",
        category: "lines",
        labelKey: "shapeLib.lineDoubleArrow",
        fallback: "Double Arrow",
        geom: (b) => ({ kind: "line", x1: b.x, y1: b.y + b.h / 2, x2: b.x + b.w, y2: b.y + b.h / 2, arrow: "both" }),
        icon: '<g fill="none" stroke="currentColor" stroke-width="1.6"><line x1="6" y1="12" x2="18" y2="12"/><polyline points="10,8 6,12 10,16"/><polyline points="14,8 18,12 14,16"/></g>',
    },
    {
        id: "elbowConnector",
        category: "lines",
        labelKey: "shapeLib.elbowConnector",
        fallback: "Elbow Connector",
        geom: (b) => poly([
            [b.x, b.y + b.h],
            [b.x, b.y + b.h / 2],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w, b.y],
        ]),
        icon: '<polyline points="3,20 3,12 20,12 20,4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
];
// 2) Rectangles —— rect / roundRect / snipRect / snip2DiagRect / plaque
const rectEntries = [
    {
        id: "rect",
        category: "rect",
        labelKey: "shapeLib.rect",
        fallback: "Rectangle",
        geom: () => ({ kind: "rect" }),
        icon: '<rect x="3" y="5" width="18" height="14" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "roundRect",
        category: "rect",
        labelKey: "shapeLib.roundRect",
        fallback: "Rounded Rectangle",
        geom: (b) => ({ kind: "rect", rx: Math.min(b.w, b.h) * 0.15 }),
        icon: '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "snipRect",
        category: "rect",
        labelKey: "shapeLib.snipRect",
        fallback: "Snip Single Corner",
        geom: (b) => {
            const c = Math.min(b.w, b.h) * 0.18;
            return poly([
                [b.x, b.y],
                [b.x + b.w - c, b.y],
                [b.x + b.w, b.y + c],
                [b.x + b.w, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<polygon points="3,5 17,5 21,9 21,19 3,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "snip2SameRect",
        category: "rect",
        labelKey: "shapeLib.snip2SameRect",
        fallback: "Snip Same Side Corners",
        geom: (b) => {
            const c = Math.min(b.w, b.h) * 0.18;
            return poly([
                [b.x + c, b.y],
                [b.x + b.w - c, b.y],
                [b.x + b.w, b.y + c],
                [b.x + b.w, b.y + b.h],
                [b.x, b.y + b.h],
                [b.x, b.y + c],
            ]);
        },
        icon: '<polygon points="7,5 17,5 21,9 21,19 3,19 3,9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "round1Rect",
        category: "rect",
        labelKey: "shapeLib.round1Rect",
        fallback: "Round Single Corner",
        geom: (b) => {
            const r = Math.min(b.w, b.h) * 0.18;
            const segs = 8;
            const pts = [];
            pts.push([b.x, b.y]);
            pts.push([b.x + b.w - r, b.y]);
            pts.push(...arcPoints(b.x + b.w - r, b.y + r, r, r, -Math.PI / 2, 0, segs));
            pts.push([b.x + b.w, b.y + b.h]);
            pts.push([b.x, b.y + b.h]);
            return poly(pts);
        },
        icon: '<path d="M3 5 H17 A4 4 0 0 1 21 9 V19 H3 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "plaque",
        category: "rect",
        labelKey: "shapeLib.plaque",
        fallback: "Plaque",
        geom: (b) => {
            const r = Math.min(b.w, b.h) * 0.18;
            const segs = 8;
            const pts = [];
            pts.push(...arcPoints(b.x, b.y, r, r, 0, -Math.PI / 2, segs));
            pts.push(...arcPoints(b.x + b.w, b.y, r, r, Math.PI, Math.PI / 2, segs));
            pts.push(...arcPoints(b.x + b.w, b.y + b.h, r, r, -Math.PI / 2, -Math.PI, segs));
            pts.push(...arcPoints(b.x, b.y + b.h, r, r, 0, Math.PI / 2, segs));
            return poly(pts);
        },
        icon: '<path d="M3,9 A4,4 0 0,1 7,5 H17 A4,4 0 0,0 21,9 V15 A4,4 0 0,1 17,19 H7 A4,4 0 0,0 3,15 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
];
// 3) Basic Shapes —— ellipse / triangle / parallelogram / trapezoid / diamond /
//    pentagon / hexagon / octagon / cross / heart / can / cube / donut / blockArc
//    / pie / chord / teardrop / lightningBolt / sun / moon / smileyFace / frame
const basicEntries = [
    {
        id: "ellipse",
        category: "basic",
        labelKey: "shapeLib.ellipse",
        fallback: "Ellipse",
        geom: () => ({ kind: "ellipse" }),
        icon: '<ellipse cx="12" cy="12" rx="9" ry="7" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "triangle",
        category: "basic",
        labelKey: "shapeLib.triangle",
        fallback: "Triangle",
        geom: (b) => poly([
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y + b.h],
            [b.x, b.y + b.h],
        ]),
        icon: '<polygon points="12,4 21,20 3,20" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "rtTriangle",
        category: "basic",
        labelKey: "shapeLib.rtTriangle",
        fallback: "Right Triangle",
        geom: (b) => poly([
            [b.x, b.y],
            [b.x, b.y + b.h],
            [b.x + b.w, b.y + b.h],
        ]),
        icon: '<polygon points="4,4 4,20 20,20" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "parallelogram",
        category: "basic",
        labelKey: "shapeLib.parallelogram",
        fallback: "Parallelogram",
        geom: (b) => {
            const sk = b.w * 0.18;
            return poly([
                [b.x + sk, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w - sk, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<polygon points="7,5 21,5 17,19 3,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "trapezoid",
        category: "basic",
        labelKey: "shapeLib.trapezoid",
        fallback: "Trapezoid",
        geom: (b) => {
            const sk = b.w * 0.2;
            return poly([
                [b.x + sk, b.y],
                [b.x + b.w - sk, b.y],
                [b.x + b.w, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<polygon points="7,5 17,5 21,19 3,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "diamond",
        category: "basic",
        labelKey: "shapeLib.diamond",
        fallback: "Diamond",
        geom: (b) => poly([
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w / 2, b.y + b.h],
            [b.x, b.y + b.h / 2],
        ]),
        icon: '<polygon points="12,4 20,12 12,20 4,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "pentagon",
        category: "basic",
        labelKey: "shapeLib.pentagon",
        fallback: "Pentagon",
        geom: (b) => poly(regularPolygon(b, 5, -90)),
        icon: '<polygon points="12,3 21,9 18,20 6,20 3,9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "hexagon",
        category: "basic",
        labelKey: "shapeLib.hexagon",
        fallback: "Hexagon",
        geom: (b) => poly(regularPolygon(b, 6, 0)),
        icon: '<polygon points="21,12 16,21 8,21 3,12 8,3 16,3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "heptagon",
        category: "basic",
        labelKey: "shapeLib.heptagon",
        fallback: "Heptagon",
        geom: (b) => poly(regularPolygon(b, 7, -90)),
        icon: '<polygon points="12,3 20,8 19,17 14,21 10,21 5,17 4,8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "octagon",
        category: "basic",
        labelKey: "shapeLib.octagon",
        fallback: "Octagon",
        geom: (b) => {
            const k = 0.293; // 1 - sqrt(2)/2 的简化（等比八边形）
            return poly([
                [b.x + b.w * k, b.y],
                [b.x + b.w * (1 - k), b.y],
                [b.x + b.w, b.y + b.h * k],
                [b.x + b.w, b.y + b.h * (1 - k)],
                [b.x + b.w * (1 - k), b.y + b.h],
                [b.x + b.w * k, b.y + b.h],
                [b.x, b.y + b.h * (1 - k)],
                [b.x, b.y + b.h * k],
            ]);
        },
        icon: '<polygon points="8,4 16,4 20,8 20,16 16,20 8,20 4,16 4,8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "plus",
        category: "basic",
        labelKey: "shapeLib.plus",
        fallback: "Plus",
        geom: (b) => {
            const tw = b.w / 3;
            const th = b.h / 3;
            return poly([
                [b.x + tw, b.y],
                [b.x + b.w - tw, b.y],
                [b.x + b.w - tw, b.y + th],
                [b.x + b.w, b.y + th],
                [b.x + b.w, b.y + b.h - th],
                [b.x + b.w - tw, b.y + b.h - th],
                [b.x + b.w - tw, b.y + b.h],
                [b.x + tw, b.y + b.h],
                [b.x + tw, b.y + b.h - th],
                [b.x, b.y + b.h - th],
                [b.x, b.y + th],
                [b.x + tw, b.y + th],
            ]);
        },
        icon: '<polygon points="9,3 15,3 15,9 21,9 21,15 15,15 15,21 9,21 9,15 3,15 3,9 9,9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "heart",
        category: "basic",
        labelKey: "shapeLib.heart",
        fallback: "Heart",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const top = b.y + b.h * 0.3;
            const segs = 24;
            const pts = [];
            const lobeR = b.w / 4;
            const lobeY = b.y + b.h * 0.3;
            // 右半圆叶
            pts.push(...arcPoints(cx + lobeR, lobeY, lobeR, lobeR, -Math.PI, 0, segs));
            // 右下尖
            pts.push([b.x + b.w * 0.95, top + b.h * 0.15]);
            pts.push([cx, b.y + b.h]);
            pts.push([b.x + b.w * 0.05, top + b.h * 0.15]);
            // 左半圆叶
            pts.push(...arcPoints(cx - lobeR, lobeY, lobeR, lobeR, 0, Math.PI, segs));
            return poly(pts);
        },
        icon: '<path d="M12,21 C5,16 3,11 3,8 A4,4 0 0,1 12,7 A4,4 0 0,1 21,8 C21,11 19,16 12,21 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "donut",
        category: "basic",
        labelKey: "shapeLib.donut",
        fallback: "Donut",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const ro = Math.min(b.w, b.h) / 2;
            const ri = ro * 0.5;
            const d = `M ${cx - ro} ${cy} A ${ro} ${ro} 0 1 0 ${cx + ro} ${cy} A ${ro} ${ro} 0 1 0 ${cx - ro} ${cy} Z` +
                ` M ${cx - ri} ${cy} A ${ri} ${ri} 0 1 1 ${cx + ri} ${cy} A ${ri} ${ri} 0 1 1 ${cx - ri} ${cy} Z`;
            return { kind: "path", d, fillRule: "evenodd" };
        },
        icon: '<path d="M3,12 A9,9 0 1,0 21,12 A9,9 0 1,0 3,12 Z M8,12 A4,4 0 1,1 16,12 A4,4 0 1,1 8,12 Z" fill="none" stroke="currentColor" stroke-width="1.6" fill-rule="evenodd"/>',
    },
    {
        id: "noSmoking",
        category: "basic",
        labelKey: "shapeLib.noSmoking",
        fallback: "No",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const ro = Math.min(b.w, b.h) / 2;
            const ri = ro * 0.85;
            const ang = Math.PI / 4;
            const dx = Math.cos(ang) * ri;
            const dy = Math.sin(ang) * ri;
            const d = `M ${cx - ro} ${cy} A ${ro} ${ro} 0 1 0 ${cx + ro} ${cy} A ${ro} ${ro} 0 1 0 ${cx - ro} ${cy} Z` +
                ` M ${cx - ri} ${cy} A ${ri} ${ri} 0 1 1 ${cx + ri} ${cy} A ${ri} ${ri} 0 1 1 ${cx - ri} ${cy} Z` +
                ` M ${cx - dx} ${cy + dy} L ${cx + dx} ${cy - dy} L ${cx + dx + 6} ${cy - dy + 6} L ${cx - dx + 6} ${cy + dy + 6} Z`;
            return { kind: "path", d, fillRule: "evenodd" };
        },
        icon: '<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><line x1="6" y1="18" x2="18" y2="6"/></g>',
    },
    {
        id: "blockArc",
        category: "basic",
        labelKey: "shapeLib.blockArc",
        fallback: "Block Arc",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const ro = Math.min(b.w, b.h) / 2;
            const ri = ro * 0.55;
            const a0 = Math.PI;
            const a1 = 0;
            const d = `M ${cx + Math.cos(a0) * ro} ${cy + Math.sin(a0) * ro}` +
                ` A ${ro} ${ro} 0 0 1 ${cx + Math.cos(a1) * ro} ${cy + Math.sin(a1) * ro}` +
                ` L ${cx + Math.cos(a1) * ri} ${cy + Math.sin(a1) * ri}` +
                ` A ${ri} ${ri} 0 0 0 ${cx + Math.cos(a0) * ri} ${cy + Math.sin(a0) * ri} Z`;
            return { kind: "path", d };
        },
        icon: '<path d="M3,12 A9,9 0 0,1 21,12 L17,12 A5,5 0 0,0 7,12 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "pie",
        category: "basic",
        labelKey: "shapeLib.pie",
        fallback: "Pie",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const r = Math.min(b.w, b.h) / 2;
            const a0 = -Math.PI / 2;
            const a1 = Math.PI / 6;
            const d = `M ${cx} ${cy} L ${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r}` +
                ` A ${r} ${r} 0 1 1 ${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r} Z`;
            return { kind: "path", d };
        },
        icon: '<path d="M12,12 L12,3 A9,9 0 1,1 19,16 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "teardrop",
        category: "basic",
        labelKey: "shapeLib.teardrop",
        fallback: "Teardrop",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const r = Math.min(b.w, b.h) / 2;
            const segs = 8;
            const pts = [];
            pts.push([b.x + b.w, b.y]);
            pts.push(...arcPoints(cx, cy, r, r, -Math.PI / 2, Math.PI * 1.5, segs * 3));
            return poly(pts);
        },
        icon: '<path d="M21,3 L19,11 A9,9 0 1,1 11,3 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "lightningBolt",
        category: "basic",
        labelKey: "shapeLib.lightningBolt",
        fallback: "Lightning Bolt",
        geom: (b) => poly([
            [b.x + b.w * 0.55, b.y],
            [b.x + b.w * 0.18, b.y + b.h * 0.55],
            [b.x + b.w * 0.42, b.y + b.h * 0.55],
            [b.x + b.w * 0.30, b.y + b.h],
            [b.x + b.w * 0.85, b.y + b.h * 0.42],
            [b.x + b.w * 0.62, b.y + b.h * 0.42],
            [b.x + b.w * 0.85, b.y],
        ]),
        icon: '<polygon points="13,3 4,13 10,13 8,21 19,10 13,10 17,3" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "can",
        category: "basic",
        labelKey: "shapeLib.can",
        fallback: "Cylinder",
        geom: (b) => {
            const ry = b.h * 0.12;
            const segs = 16;
            const cx = b.x + b.w / 2;
            const top = arcPoints(cx, b.y + ry, b.w / 2, ry, Math.PI, 0, segs);
            const bot = arcPoints(cx, b.y + b.h - ry, b.w / 2, ry, 0, Math.PI, segs);
            return poly([...top, ...bot]);
        },
        icon: '<g fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="12" cy="6" rx="7" ry="2.4"/><line x1="5" y1="6" x2="5" y2="18"/><line x1="19" y1="6" x2="19" y2="18"/><path d="M5,18 A7,2.4 0 0,0 19,18"/></g>',
    },
    {
        id: "cube",
        category: "basic",
        labelKey: "shapeLib.cube",
        fallback: "Cube",
        geom: (b) => {
            const dx = b.w * 0.2;
            const dy = b.h * 0.2;
            return poly([
                [b.x, b.y + dy],
                [b.x + dx, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h - dy],
                [b.x + b.w - dx, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<g fill="none" stroke="currentColor" stroke-width="1.6"><polygon points="3,8 8,3 21,3 21,16 16,21 3,21"/><polyline points="3,8 16,8 16,21"/><line x1="16" y1="8" x2="21" y2="3"/></g>',
    },
    {
        id: "frame",
        category: "basic",
        labelKey: "shapeLib.frame",
        fallback: "Frame",
        geom: (b) => {
            const t = Math.min(b.w, b.h) * 0.12;
            const d = `M ${b.x} ${b.y} H ${b.x + b.w} V ${b.y + b.h} H ${b.x} Z` +
                ` M ${b.x + t} ${b.y + t} V ${b.y + b.h - t} H ${b.x + b.w - t} V ${b.y + t} Z`;
            return { kind: "path", d, fillRule: "evenodd" };
        },
        icon: '<path d="M3,5 H21 V19 H3 Z M6,8 H18 V16 H6 Z" fill="none" stroke="currentColor" stroke-width="1.6" fill-rule="evenodd"/>',
    },
    {
        id: "sun",
        category: "basic",
        labelKey: "shapeLib.sun",
        fallback: "Sun",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const ro = Math.min(b.w, b.h) / 2;
            const ri = ro * 0.6;
            const n = 12;
            const pts = starPts({ x: cx - ro, y: cy - ro, w: ro * 2, h: ro * 2 }, n, ri / ro, -90);
            return poly(pts);
        },
        icon: '<polygon points="12,2 14,8 20,5 17,11 23,12 17,13 20,19 14,16 12,22 10,16 4,19 7,13 1,12 7,11 4,5 10,8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "moon",
        category: "basic",
        labelKey: "shapeLib.moon",
        fallback: "Moon",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const r = Math.min(b.w, b.h) / 2;
            const r2 = r * 0.7;
            const d = `M ${cx + r * 0.5} ${cy - r}` +
                ` A ${r} ${r} 0 1 0 ${cx + r * 0.5} ${cy + r}` +
                ` A ${r2} ${r2} 0 1 1 ${cx + r * 0.5} ${cy - r} Z`;
            return { kind: "path", d };
        },
        icon: '<path d="M16,3 A9,9 0 1,0 16,21 A7,7 0 1,1 16,3 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "smileyFace",
        category: "basic",
        labelKey: "shapeLib.smileyFace",
        fallback: "Smiley Face",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            const r = Math.min(b.w, b.h) / 2;
            const eyeR = r * 0.08;
            const eyeY = cy - r * 0.25;
            const ex1 = cx - r * 0.35;
            const ex2 = cx + r * 0.35;
            const mr = r * 0.5;
            const d = `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z` +
                ` M ${ex1 - eyeR} ${eyeY} A ${eyeR} ${eyeR} 0 1 0 ${ex1 + eyeR} ${eyeY} A ${eyeR} ${eyeR} 0 1 0 ${ex1 - eyeR} ${eyeY} Z` +
                ` M ${ex2 - eyeR} ${eyeY} A ${eyeR} ${eyeR} 0 1 0 ${ex2 + eyeR} ${eyeY} A ${eyeR} ${eyeR} 0 1 0 ${ex2 - eyeR} ${eyeY} Z` +
                ` M ${cx - mr} ${cy + r * 0.1} A ${mr} ${mr} 0 0 0 ${cx + mr} ${cy + r * 0.1}`;
            return { kind: "path", d, fillRule: "evenodd" };
        },
        icon: '<g fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="0.8" fill="currentColor"/><circle cx="15" cy="10" r="0.8" fill="currentColor"/><path d="M8,14 A4,4 0 0,0 16,14"/></g>',
    },
];
// 4) Block Arrows —— rightArrow / leftArrow / upArrow / downArrow / leftRightArrow /
//    upDownArrow / quadArrow / pentagonArrow (chevron) / bentArrow / uTurnArrow /
//    notchedRightArrow / curvedRightArrow / circularArrow
const arrowEntries = [
    {
        id: "rightArrow",
        category: "arrows",
        labelKey: "shapeLib.rightArrow",
        fallback: "Right Arrow",
        geom: (b) => {
            const head = b.w * 0.4;
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
        icon: '<polygon points="3,9 14,9 14,4 21,12 14,20 14,15 3,15" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "leftArrow",
        category: "arrows",
        labelKey: "shapeLib.leftArrow",
        fallback: "Left Arrow",
        geom: (b) => {
            const head = b.w * 0.4;
            const tail = b.h * 0.3;
            return poly([
                [b.x + b.w, b.y + tail],
                [b.x + head, b.y + tail],
                [b.x + head, b.y],
                [b.x, b.y + b.h / 2],
                [b.x + head, b.y + b.h],
                [b.x + head, b.y + b.h - tail],
                [b.x + b.w, b.y + b.h - tail],
            ]);
        },
        icon: '<polygon points="21,9 10,9 10,4 3,12 10,20 10,15 21,15" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "upArrow",
        category: "arrows",
        labelKey: "shapeLib.upArrow",
        fallback: "Up Arrow",
        geom: (b) => {
            const head = b.h * 0.4;
            const tail = b.w * 0.3;
            return poly([
                [b.x + b.w / 2, b.y],
                [b.x + b.w, b.y + head],
                [b.x + b.w - tail, b.y + head],
                [b.x + b.w - tail, b.y + b.h],
                [b.x + tail, b.y + b.h],
                [b.x + tail, b.y + head],
                [b.x, b.y + head],
            ]);
        },
        icon: '<polygon points="12,3 21,12 16,12 16,21 8,21 8,12 3,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "downArrow",
        category: "arrows",
        labelKey: "shapeLib.downArrow",
        fallback: "Down Arrow",
        geom: (b) => {
            const head = b.h * 0.4;
            const tail = b.w * 0.3;
            return poly([
                [b.x + tail, b.y],
                [b.x + b.w - tail, b.y],
                [b.x + b.w - tail, b.y + b.h - head],
                [b.x + b.w, b.y + b.h - head],
                [b.x + b.w / 2, b.y + b.h],
                [b.x, b.y + b.h - head],
                [b.x + tail, b.y + b.h - head],
            ]);
        },
        icon: '<polygon points="8,3 16,3 16,12 21,12 12,21 3,12 8,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "leftRightArrow",
        category: "arrows",
        labelKey: "shapeLib.leftRightArrow",
        fallback: "Left-Right Arrow",
        geom: (b) => {
            const head = b.w * 0.22;
            const tail = b.h * 0.3;
            return poly([
                [b.x, b.y + b.h / 2],
                [b.x + head, b.y],
                [b.x + head, b.y + tail],
                [b.x + b.w - head, b.y + tail],
                [b.x + b.w - head, b.y],
                [b.x + b.w, b.y + b.h / 2],
                [b.x + b.w - head, b.y + b.h],
                [b.x + b.w - head, b.y + b.h - tail],
                [b.x + head, b.y + b.h - tail],
                [b.x + head, b.y + b.h],
            ]);
        },
        icon: '<polygon points="3,12 7,7 7,10 17,10 17,7 21,12 17,17 17,14 7,14 7,17" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "upDownArrow",
        category: "arrows",
        labelKey: "shapeLib.upDownArrow",
        fallback: "Up-Down Arrow",
        geom: (b) => {
            const head = b.h * 0.22;
            const tail = b.w * 0.3;
            return poly([
                [b.x + b.w / 2, b.y],
                [b.x + b.w, b.y + head],
                [b.x + b.w - tail, b.y + head],
                [b.x + b.w - tail, b.y + b.h - head],
                [b.x + b.w, b.y + b.h - head],
                [b.x + b.w / 2, b.y + b.h],
                [b.x, b.y + b.h - head],
                [b.x + tail, b.y + b.h - head],
                [b.x + tail, b.y + head],
                [b.x, b.y + head],
            ]);
        },
        icon: '<polygon points="12,3 17,7 14,7 14,17 17,17 12,21 7,17 10,17 10,7 7,7" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "quadArrow",
        category: "arrows",
        labelKey: "shapeLib.quadArrow",
        fallback: "Quad Arrow",
        geom: (b) => {
            const head = Math.min(b.w, b.h) * 0.22;
            const tail = Math.min(b.w, b.h) * 0.15;
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h / 2;
            return poly([
                [cx, b.y],
                [cx + head, b.y + head],
                [cx + tail, b.y + head],
                [cx + tail, cy - tail],
                [b.x + b.w - head, cy - tail],
                [b.x + b.w - head, cy - head],
                [b.x + b.w, cy],
                [b.x + b.w - head, cy + head],
                [b.x + b.w - head, cy + tail],
                [cx + tail, cy + tail],
                [cx + tail, b.y + b.h - head],
                [cx + head, b.y + b.h - head],
                [cx, b.y + b.h],
                [cx - head, b.y + b.h - head],
                [cx - tail, b.y + b.h - head],
                [cx - tail, cy + tail],
                [b.x + head, cy + tail],
                [b.x + head, cy + head],
                [b.x, cy],
                [b.x + head, cy - head],
                [b.x + head, cy - tail],
                [cx - tail, cy - tail],
                [cx - tail, b.y + head],
                [cx - head, b.y + head],
            ]);
        },
        icon: '<polygon points="12,3 15,6 13,6 13,11 18,11 18,9 21,12 18,15 18,13 13,13 13,18 15,18 12,21 9,18 11,18 11,13 6,13 6,15 3,12 6,9 6,11 11,11 11,6 9,6" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "chevron",
        category: "arrows",
        labelKey: "shapeLib.chevron",
        fallback: "Chevron",
        geom: (b) => {
            const notch = b.w * 0.25;
            return poly([
                [b.x, b.y],
                [b.x + b.w - notch, b.y],
                [b.x + b.w, b.y + b.h / 2],
                [b.x + b.w - notch, b.y + b.h],
                [b.x, b.y + b.h],
                [b.x + notch, b.y + b.h / 2],
            ]);
        },
        icon: '<polygon points="3,4 16,4 21,12 16,20 3,20 8,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "bentArrow",
        category: "arrows",
        labelKey: "shapeLib.bentArrow",
        fallback: "Bent Arrow",
        geom: (b) => {
            const tail = Math.min(b.w, b.h) * 0.22;
            const head = Math.min(b.w, b.h) * 0.32;
            return poly([
                [b.x, b.y + b.h - tail],
                [b.x, b.y + b.h * 0.5],
                [b.x + b.w * 0.5 - tail / 2, b.y + b.h * 0.5],
                [b.x + b.w * 0.5 - tail / 2, b.y + head],
                [b.x + b.w * 0.5 - head, b.y + head],
                [b.x + b.w * 0.7, b.y],
                [b.x + b.w * 0.7 + head, b.y + head],
                [b.x + b.w * 0.5 + tail / 2, b.y + head],
                [b.x + b.w * 0.5 + tail / 2, b.y + b.h - tail],
            ]);
        },
        icon: '<polygon points="3,21 3,12 11,12 11,7 7,7 14,3 18,7 14,7 14,21" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "uTurnArrow",
        category: "arrows",
        labelKey: "shapeLib.uTurnArrow",
        fallback: "U-Turn Arrow",
        geom: (b) => {
            const r = b.h * 0.5;
            const stem = b.w * 0.18;
            const head = stem * 1.6;
            const cx = b.x + b.w * 0.5;
            const segs = 12;
            const pts = [];
            pts.push([b.x, b.y + b.h]);
            pts.push([b.x, b.y + r]);
            pts.push(...arcPoints(cx, b.y + r, cx - b.x, r, Math.PI, 0, segs));
            pts.push([b.x + b.w, b.y + b.h - head]);
            pts.push([b.x + b.w + head / 2, b.y + b.h - head]);
            pts.push([b.x + b.w - stem / 2, b.y + b.h]);
            pts.push([b.x + b.w - stem - head / 2, b.y + b.h - head]);
            pts.push([b.x + b.w - stem, b.y + b.h - head]);
            pts.push([b.x + b.w - stem, b.y + r]);
            const cx2 = cx;
            const r2 = r - stem;
            pts.push(...arcPoints(cx2, b.y + r, cx2 - (b.x + stem), r2, 0, Math.PI, segs));
            pts.push([b.x + stem, b.y + b.h]);
            return poly(pts);
        },
        icon: '<polygon points="3,20 3,10 8,10 8,8 16,8 16,4 21,8 16,12 16,10 11,10 11,20" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
];
// 5) Flowchart —— ECMA-376 §20.1.10.55 ST_PresetGeometry: flowChart* prefix.
const flowchartEntries = [
    {
        id: "flowChartProcess",
        category: "flowchart",
        labelKey: "shapeLib.flowChartProcess",
        fallback: "Process",
        geom: () => ({ kind: "rect" }),
        icon: '<rect x="3" y="6" width="18" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartDecision",
        category: "flowchart",
        labelKey: "shapeLib.flowChartDecision",
        fallback: "Decision",
        geom: (b) => poly([
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w / 2, b.y + b.h],
            [b.x, b.y + b.h / 2],
        ]),
        icon: '<polygon points="12,4 20,12 12,20 4,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartTerminator",
        category: "flowchart",
        labelKey: "shapeLib.flowChartTerminator",
        fallback: "Terminator",
        geom: (b) => ({ kind: "rect", rx: b.h / 2 }),
        icon: '<rect x="3" y="7" width="18" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartData",
        category: "flowchart",
        labelKey: "shapeLib.flowChartData",
        fallback: "Data",
        geom: (b) => {
            const sk = b.w * 0.2;
            return poly([
                [b.x + sk, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w - sk, b.y + b.h],
                [b.x, b.y + b.h],
            ]);
        },
        icon: '<polygon points="7,5 21,5 17,19 3,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartConnector",
        category: "flowchart",
        labelKey: "shapeLib.flowChartConnector",
        fallback: "Connector",
        geom: () => ({ kind: "ellipse" }),
        icon: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartDocument",
        category: "flowchart",
        labelKey: "shapeLib.flowChartDocument",
        fallback: "Document",
        geom: (b) => {
            const wave = b.h * 0.15;
            const segs = 12;
            const cx = b.x + b.w / 2;
            const pts = [];
            pts.push([b.x, b.y]);
            pts.push([b.x + b.w, b.y]);
            pts.push([b.x + b.w, b.y + b.h - wave]);
            // 底部波浪：先下凸，后上凸
            const segL = arcPoints(b.x + b.w * 0.75, b.y + b.h - wave, b.w * 0.25, wave, 0, Math.PI, segs);
            const segR = arcPoints(b.x + b.w * 0.25, b.y + b.h - wave, b.w * 0.25, wave, 0, -Math.PI, segs);
            pts.push(...segL);
            pts.push(...segR);
            pts.push([b.x, b.y + b.h - wave]);
            return poly(pts);
        },
        icon: '<path d="M3,4 H21 V17 Q17,21 12,18 Q7,15 3,18 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartManualOperation",
        category: "flowchart",
        labelKey: "shapeLib.flowChartManualOperation",
        fallback: "Manual Operation",
        geom: (b) => {
            const sk = b.w * 0.12;
            return poly([
                [b.x, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w - sk, b.y + b.h],
                [b.x + sk, b.y + b.h],
            ]);
        },
        icon: '<polygon points="3,5 21,5 18,19 6,19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "flowChartPreparation",
        category: "flowchart",
        labelKey: "shapeLib.flowChartPreparation",
        fallback: "Preparation",
        geom: (b) => {
            const sk = b.w * 0.18;
            return poly([
                [b.x + sk, b.y],
                [b.x + b.w - sk, b.y],
                [b.x + b.w, b.y + b.h / 2],
                [b.x + b.w - sk, b.y + b.h],
                [b.x + sk, b.y + b.h],
                [b.x, b.y + b.h / 2],
            ]);
        },
        icon: '<polygon points="7,5 17,5 21,12 17,19 7,19 3,12" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
];
// 6) Stars and Banners —— star4/5/6/8/12 / ribbon / verticalScroll / wave
const starsBannersEntries = [
    {
        id: "star4",
        category: "starsBanners",
        labelKey: "shapeLib.star4",
        fallback: "4-Point Star",
        geom: (b) => poly(starPts(b, 4, 0.4, -90)),
        icon: '<polygon points="12,2 14,10 22,12 14,14 12,22 10,14 2,12 10,10" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "star5",
        category: "starsBanners",
        labelKey: "shapeLib.star5",
        fallback: "5-Point Star",
        geom: (b) => poly(starPts(b, 5, 0.4, -90)),
        icon: '<polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "star6",
        category: "starsBanners",
        labelKey: "shapeLib.star6",
        fallback: "6-Point Star",
        geom: (b) => poly(starPts(b, 6, 0.55, -90)),
        icon: '<polygon points="12,2 14,8 21,8 16,12 21,16 14,16 12,22 10,16 3,16 8,12 3,8 10,8" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    },
    {
        id: "star8",
        category: "starsBanners",
        labelKey: "shapeLib.star8",
        fallback: "8-Point Star",
        geom: (b) => poly(starPts(b, 8, 0.6, -90)),
        icon: '<polygon points="12,2 14,7 19,5 18,10 22,12 18,14 19,19 14,17 12,22 10,17 5,19 6,14 2,12 6,10 5,5 10,7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "star12",
        category: "starsBanners",
        labelKey: "shapeLib.star12",
        fallback: "12-Point Star",
        geom: (b) => poly(starPts(b, 12, 0.7, -90)),
        icon: '<polygon points="12,2 13.4,7 16.6,4.7 15.6,8.4 19.6,7 17.5,10.5 22,12 17.5,13.5 19.6,17 15.6,15.6 16.6,19.3 13.4,17 12,22 10.6,17 7.4,19.3 8.4,15.6 4.4,17 6.5,13.5 2,12 6.5,10.5 4.4,7 8.4,8.4 7.4,4.7 10.6,7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "ribbon",
        category: "starsBanners",
        labelKey: "shapeLib.ribbon",
        fallback: "Ribbon",
        geom: (b) => {
            const cut = b.w * 0.1;
            const fold = b.h * 0.25;
            return poly([
                [b.x, b.y + fold],
                [b.x + cut, b.y + fold * 0.5],
                [b.x + b.w * 0.18, b.y + fold],
                [b.x + b.w * 0.18, b.y],
                [b.x + b.w * 0.82, b.y],
                [b.x + b.w * 0.82, b.y + fold],
                [b.x + b.w - cut, b.y + fold * 0.5],
                [b.x + b.w, b.y + fold],
                [b.x + b.w * 0.85, b.y + b.h * 0.5],
                [b.x + b.w, b.y + b.h - fold * 0.5],
                [b.x + b.w * 0.82, b.y + b.h],
                [b.x + b.w * 0.18, b.y + b.h],
                [b.x, b.y + b.h - fold * 0.5],
                [b.x + b.w * 0.15, b.y + b.h * 0.5],
            ]);
        },
        icon: '<path d="M3,8 L5,6 L7,8 L7,4 L17,4 L17,8 L19,6 L21,8 L18,12 L21,16 L17,16 L17,20 L7,20 L7,16 L3,16 L6,12 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "verticalScroll",
        category: "starsBanners",
        labelKey: "shapeLib.verticalScroll",
        fallback: "Vertical Scroll",
        geom: (b) => {
            const r = b.w * 0.12;
            const segs = 8;
            const pts = [];
            pts.push(...arcPoints(b.x + r, b.y + r, r, r, -Math.PI, -Math.PI / 2, segs));
            pts.push([b.x + b.w - r, b.y]);
            pts.push(...arcPoints(b.x + b.w - r, b.y + r, r, r, -Math.PI / 2, 0, segs));
            pts.push([b.x + b.w, b.y + b.h - r]);
            pts.push(...arcPoints(b.x + b.w - r, b.y + b.h - r, r, r, 0, Math.PI / 2, segs));
            pts.push([b.x + r, b.y + b.h]);
            pts.push(...arcPoints(b.x + r, b.y + b.h - r, r, r, Math.PI / 2, Math.PI, segs));
            return poly(pts);
        },
        icon: '<path d="M5,4 H17 A4,4 0 0,1 21,8 V20 H7 A4,4 0 0,1 3,16 V8 A4,4 0 0,1 7,4 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "wave",
        category: "starsBanners",
        labelKey: "shapeLib.wave",
        fallback: "Wave",
        geom: (b) => {
            const segs = 24;
            const ampY = b.h * 0.2;
            const pts = [];
            // 顶部正弦
            for (let i = 0; i <= segs; i++) {
                const x = b.x + (b.w * i) / segs;
                const y = b.y + ampY + Math.sin((i / segs) * Math.PI * 2) * ampY;
                pts.push([x, y]);
            }
            // 底部反向正弦
            for (let i = segs; i >= 0; i--) {
                const x = b.x + (b.w * i) / segs;
                const y = b.y + b.h - ampY + Math.sin((i / segs) * Math.PI * 2) * ampY;
                pts.push([x, y]);
            }
            return poly(pts);
        },
        icon: '<path d="M3,9 Q9,3 12,9 T21,9 V15 Q15,21 12,15 T3,15 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
];
// 7) Callouts —— wedgeRectCallout / wedgeRoundRectCallout / wedgeEllipseCallout /
//    cloudCallout
const calloutsEntries = [
    {
        id: "wedgeRectCallout",
        category: "callouts",
        labelKey: "shapeLib.wedgeRectCallout",
        fallback: "Rectangular Callout",
        geom: (b) => {
            const tipBaseW = b.w * 0.18;
            // 嘴巴尖在底边偏左 25% 处
            return poly([
                [b.x, b.y],
                [b.x + b.w, b.y],
                [b.x + b.w, b.y + b.h * 0.78],
                [b.x + b.w * 0.4, b.y + b.h * 0.78],
                [b.x + b.w * 0.18, b.y + b.h],
                [b.x + b.w * 0.32, b.y + b.h * 0.78],
                [b.x, b.y + b.h * 0.78],
            ]);
            void tipBaseW;
        },
        icon: '<polygon points="3,4 21,4 21,16 11,16 6,21 8,16 3,16" fill="none" stroke="currentColor" stroke-width="1.5"/>',
    },
    {
        id: "wedgeRoundRectCallout",
        category: "callouts",
        labelKey: "shapeLib.wedgeRoundRectCallout",
        fallback: "Rounded Callout",
        geom: (b) => {
            const r = Math.min(b.w, b.h) * 0.12;
            const segs = 6;
            const pts = [];
            const top = b.y;
            const right = b.x + b.w;
            const bottom = b.y + b.h * 0.78;
            const left = b.x;
            pts.push(...arcPoints(left + r, top + r, r, r, -Math.PI, -Math.PI / 2, segs));
            pts.push([right - r, top]);
            pts.push(...arcPoints(right - r, top + r, r, r, -Math.PI / 2, 0, segs));
            pts.push([right, bottom - r]);
            pts.push(...arcPoints(right - r, bottom - r, r, r, 0, Math.PI / 2, segs));
            pts.push([b.x + b.w * 0.4, bottom]);
            pts.push([b.x + b.w * 0.18, b.y + b.h]);
            pts.push([b.x + b.w * 0.32, bottom]);
            pts.push([left + r, bottom]);
            pts.push(...arcPoints(left + r, bottom - r, r, r, Math.PI / 2, Math.PI, segs));
            return poly(pts);
        },
        icon: '<path d="M5,4 H19 A2,2 0 0,1 21,6 V14 A2,2 0 0,1 19,16 H11 L6,21 L8,16 H5 A2,2 0 0,1 3,14 V6 A2,2 0 0,1 5,4 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "wedgeEllipseCallout",
        category: "callouts",
        labelKey: "shapeLib.wedgeEllipseCallout",
        fallback: "Oval Callout",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h * 0.4;
            const rx = b.w / 2;
            const ry = b.h * 0.4;
            const segs = 36;
            const pts = [];
            // 椭圆主体
            for (let i = 0; i < segs; i++) {
                const a = (Math.PI * 2 * i) / segs;
                if (a > Math.PI * 0.55 && a < Math.PI * 0.7)
                    continue;
                pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
            }
            // 嘴巴尖
            pts.push([b.x + b.w * 0.25, b.y + b.h]);
            return poly(pts);
        },
        icon: '<path d="M3,10 A9,6 0 1,1 21,10 A9,6 0 0,1 13,16 L9,21 L11,16 A9,6 0 0,1 3,10 Z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
    },
    {
        id: "cloudCallout",
        category: "callouts",
        labelKey: "shapeLib.cloudCallout",
        fallback: "Cloud Callout",
        geom: (b) => {
            const cx = b.x + b.w / 2;
            const cy = b.y + b.h * 0.4;
            const rx = b.w / 2;
            const ry = b.h * 0.36;
            // 用云朵：多段半圆叠加（poly 近似），尖嘴接两个圆点
            const segs = 8;
            const lobes = 8;
            const pts = [];
            for (let i = 0; i < lobes; i++) {
                const a0 = (Math.PI * 2 * i) / lobes - Math.PI / lobes;
                const a1 = a0 + (Math.PI * 2) / lobes;
                const a = (a0 + a1) / 2;
                const lx = cx + Math.cos(a) * rx;
                const ly = cy + Math.sin(a) * ry;
                const lobeR = (rx + ry) / 2 * 0.28;
                pts.push(...arcPoints(lx, ly, lobeR, lobeR, a - Math.PI / 2, a + Math.PI / 2, segs));
            }
            pts.push([b.x + b.w * 0.2, b.y + b.h * 0.85]);
            pts.push([b.x + b.w * 0.1, b.y + b.h]);
            pts.push([b.x + b.w * 0.28, b.y + b.h * 0.78]);
            return poly(pts);
        },
        icon: '<path d="M6,10 A3,3 0 0,1 10,7 A3,3 0 0,1 16,7 A3,3 0 0,1 19,10 A3,3 0 0,1 17,15 A3,3 0 0,1 12,16 L8,21 L10,15 A3,3 0 0,1 6,10 Z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
    },
];
// ---------- 聚合导出 ----------
exports.SHAPE_LIBRARY = [
    ...lineEntries,
    ...shape_library_extra_1.extraLineEntries,
    ...rectEntries,
    ...shape_library_extra_1.extraRectEntries,
    ...basicEntries,
    ...shape_library_extra_1.extraBasicEntries,
    ...arrowEntries,
    ...shape_library_extra_1.extraArrowEntries,
    ...flowchartEntries,
    ...shape_library_extra_1.extraFlowchartEntries,
    ...starsBannersEntries,
    ...shape_library_extra_1.extraStarsBannersEntries,
    ...calloutsEntries,
    ...shape_library_extra_1.extraCalloutsEntries,
];
exports.SHAPE_BY_ID = Object.fromEntries(exports.SHAPE_LIBRARY.map((e) => [e.id, e]));
exports.CATEGORY_ORDER = [
    "lines",
    "rect",
    "basic",
    "arrows",
    "flowchart",
    "starsBanners",
    "callouts",
];
function entriesByCategory(c) {
    return exports.SHAPE_LIBRARY.filter((e) => e.category === c);
}
