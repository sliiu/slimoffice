// §19.5.9 a:animMotion — 路径动画行为。
//
// path 坐标：归一化 [0,1]，相对 origin 指定的坐标系：
//   - origin="parent"（默认）→ 相对父容器（通常 = slide 尺寸）的归一化坐标
//   - origin="layout"        → 相对 slide layout 尺寸（实际尺寸相同，仅语义差异）
// PowerPoint 当前两种 origin 都映射到 slide 尺寸，但需保留 origin 信息以便
// renderer / serializer 不丢字段。
import { normalizeMotionPath, rotateMotionPath, samplePath } from "../path.js";
export function compileAnimMotion(node, ctx, parentEasing) {
    let d = node.path ? normalizeMotionPath(node.path) : pathFromFromTo(node);
    if (!d)
        return [];
    if (node.rAng)
        d = rotateMotionPath(d, node.rAng / 60000);
    // §19.5.9 origin 决定 path 归一坐标的参照系；slide 内 parent / layout 当前
    // 都映射到 slide 尺寸（layout 与 slide 一致）。group 嵌套时未来再细化。
    const pts = samplePath(d, 60, ctx.slideWidth, ctx.slideHeight, node.ptsTypes);
    if (pts.length < 2)
        return [];
    return [
        {
            kind: "motion",
            points: pts,
            origin: node.origin ?? "parent",
            // §19.5.9 pathEditMode：保留供 runtime 后续按 "fixed" 锁定坐标系使用。
            pathEditMode: node.pathEditMode,
            // §19.5.18 accel/decel/tmFilter 通过 parent easing 注入 motion 时间映射，
            // 让"路径上的进度推进"与其他 prop track 共用同一时间曲线。
            easing: parentEasing,
            // §19.5.14 cBhvr.additive / accumulate 在 leaf.ts 统一透传（与 prop track 同源）。
        },
    ];
}
function pathFromFromTo(node) {
    const f = node.from;
    const t = node.to;
    const b = node.by;
    const conv = (p) => [p.x / 100000, p.y / 100000];
    if (f && t) {
        const a = conv(f);
        const c = conv(t);
        return `M ${a[0]} ${a[1]} L ${c[0]} ${c[1]}`;
    }
    if (b) {
        const c = conv(b);
        return `M 0 0 l ${c[0]} ${c[1]}`;
    }
    if (t) {
        const c = conv(t);
        return `M 0 0 L ${c[0]} ${c[1]}`;
    }
    return undefined;
}
