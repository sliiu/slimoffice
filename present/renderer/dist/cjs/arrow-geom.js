"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.arrowSize = arrowSize;
exports.arrowPathD = arrowPathD;
exports.arrowRefX = arrowRefX;
// 线端箭头（headEnd / tailEnd）的几何，SVG 与 Canvas 两个 backend 共用，保证导出一致。
// 尺寸单位为 strokeWidth 的倍数（与 SVG markerUnits="strokeWidth" 一致）。
function arrowSize(spec) {
    const wMap = { sm: 3, med: 5, lg: 8 };
    const lMap = { sm: 3, med: 5, lg: 8 };
    return { w: wMap[spec.w ?? "med"], l: lMap[spec.len ?? "med"] };
}
function arrowPathD(kind, w, l, side) {
    if (kind === "oval") {
        return `M 0 ${-w / 2} a ${l / 2} ${w / 2} 0 1 0 0 ${w} a ${l / 2} ${w / 2} 0 1 0 0 ${-w} z`;
    }
    if (kind === "diamond") {
        return `M 0 0 L ${l / 2} ${-w / 2} L ${l} 0 L ${l / 2} ${w / 2} Z`;
    }
    if (kind === "stealth") {
        return side === "end"
            ? `M 0 ${-w / 2} L ${l} 0 L 0 ${w / 2} L ${l * 0.3} 0 Z`
            : `M ${l} ${-w / 2} L 0 0 L ${l} ${w / 2} L ${l * 0.7} 0 Z`;
    }
    return side === "end"
        ? `M 0 ${-w / 2} L ${l} 0 L 0 ${w / 2} Z`
        : `M ${l} ${-w / 2} L 0 0 L ${l} ${w / 2} Z`;
}
// PowerPoint / WPS 约定下，三角 / 隐身箭头的"基底"锚定在线端点，"尖端"向外延伸；
// 圆 / 菱形等中心对称形状骑跨在线端点上（中心 = 端点）。orient="auto" 让 +X 沿线方向，
// 因此 end 侧 refX=0（基底在端点、尖端向 +X 外延），start 侧 path 已镜像、refX=l。
function arrowRefX(kind, side, l) {
    if (kind === "oval")
        return 0;
    if (kind === "diamond")
        return l / 2;
    return side === "end" ? 0 : l;
}
