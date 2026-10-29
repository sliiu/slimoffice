import { needs3DRender, shape3DInfo, shapeSupports3D } from "@sliiu/present-three-bake";
const BITMAP_KINDS = new Set(["image", "chart"]);
function shapeIsLive3D(s) {
    return shapeSupports3D(s) && needs3DRender(shape3DInfo(s));
}
function shapeIsLiveModel3D(s) {
    return s.kind === "model3d" && Boolean(s.glbSrc);
}
function classifyBucket(node) {
    if (shapeIsLive3D(node.shape))
        return "webgl";
    if (shapeIsLiveModel3D(node.shape))
        return "webglm3d";
    if (node.shape.kind === "model3d")
        return "canvas";
    return BITMAP_KINDS.has(node.shape.kind) ? "canvas" : "svg";
}
/**
 * 按绘制顺序切段。组合不单独成段：非 3D 子形状留在组合被归入的那一类（图片在组合里
 * 仍走 SVG），3D 子形状在它自己的 z 序位置拆成 webgl 段，这样字可以盖在挤出体上面。
 */
export function buildHybridSegments(children) {
    const segments = [];
    for (const child of children)
        walk(child, segments, classifyBucket(child));
    return segments;
}
function walk(node, segments, bucket) {
    if (shapeIsLive3D(node.shape)) {
        push(segments, "webgl", node.id);
        return;
    }
    if (shapeIsLiveModel3D(node.shape)) {
        push(segments, "webglm3d", node.id);
        return;
    }
    if (node.shape.kind === "group") {
        for (const c of node.children)
            walk(c, segments, bucket);
        return;
    }
    push(segments, bucket, node.id);
}
function push(segments, kind, id) {
    const prev = segments[segments.length - 1];
    if (prev && prev.kind === kind && kind !== "webgl" && kind !== "webglm3d") {
        prev.ids.push(id);
        return;
    }
    segments.push({ kind, ids: [id] });
}
