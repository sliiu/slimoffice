"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHAPE_3D_PAD = exports.IMAGE_3D_PAD = void 0;
exports.shapeSupports3D = shapeSupports3D;
exports.shape3DPad = shape3DPad;
exports.shape3DInfo = shape3DInfo;
exports.shape3DPathD = shape3DPathD;
// 实时 WebGL 与离屏烘焙共用的形状范围。文字框用正面贴图（字形画进这张图）再挤出。
// 组合本身不进；组合里的子形状各自判断。
const SHAPE_3D_KINDS = new Set(["image", "rect", "ellipse", "path", "polygon", "text"]);
/** 与 bake-sp3d 的 image pad 一致：贴图几何收在 bbox 内。 */
exports.IMAGE_3D_PAD = 0.05;
/** 与 bake-sp3d 的非 image pad 一致：倒角会对称外扩。 */
exports.SHAPE_3D_PAD = 0.15;
function shapeSupports3D(s) {
    return SHAPE_3D_KINDS.has(s.kind);
}
function shape3DPad(kind) {
    // 文字正面是字形贴图，留白和 image slab 一样，避免倒角把字挤出画布。
    return kind === "image" || kind === "text" ? exports.IMAGE_3D_PAD : exports.SHAPE_3D_PAD;
}
/** 形状上真正参加 3D 的那份参数。文字只看 bodyPr，避免和形状自己的 spPr 3D 各挤出一次。 */
function shape3DInfo(s) {
    if (s.kind === "text")
        return s.body3D;
    return s.meta3D;
}
/**
 * 非 image 形状的挤出轮廓，坐标系是形状本地的 0..bbox。
 * image 不需要轮廓（正面是贴图 slab）。rect 也不返回：scene-builder 在没有 pathD
 * 时已经按 bbox 挤出一个矩形。path 的 `d` 原样传入，由场景构建器按路径自身包围盒居中。
 */
function shape3DPathD(s) {
    if (s.kind === "path")
        return s.d || undefined;
    if (s.kind === "ellipse")
        return ellipsePathD(s.bbox.w, s.bbox.h);
    if (s.kind === "polygon" && s.points.length > 0)
        return polygonPathD(s);
    return undefined;
}
function ellipsePathD(w, h) {
    const rx = w / 2;
    const ry = h / 2;
    const k = 0.5522847498;
    const cx = rx;
    const cy = ry;
    const kx = rx * k;
    const ky = ry * k;
    return [
        `M ${cx} 0`,
        `C ${cx + kx} 0 ${w} ${cy - ky} ${w} ${cy}`,
        `C ${w} ${cy + ky} ${cx + kx} ${h} ${cx} ${h}`,
        `C ${cx - kx} ${h} 0 ${cy + ky} 0 ${cy}`,
        `C 0 ${cy - ky} ${cx - kx} 0 ${cx} 0`,
        "Z",
    ].join(" ");
}
function polygonPathD(s) {
    const minX = Math.min(...s.points.map((p) => p[0]));
    const minY = Math.min(...s.points.map((p) => p[1]));
    const absolute = Math.abs(minX - s.bbox.x) < 2 && Math.abs(minY - s.bbox.y) < 2;
    const pts = absolute
        ? s.points.map(([x, y]) => [x - s.bbox.x, y - s.bbox.y])
        : s.points;
    const [x0, y0] = pts[0];
    let d = `M ${x0} ${y0}`;
    for (let i = 1; i < pts.length; i++)
        d += ` L ${pts[i][0]} ${pts[i][1]}`;
    return `${d} Z`;
}
