import { adjFromAdjustHandleDrag, evalPresetAdjustHandles, evalPresetDef, } from "./cust-geom.js";
import { OFFICIAL_PRESETS } from "./preset-shapes.gen.js";
function presetFromDef(def, bbox, adj) {
    const result = evalPresetDef(def, bbox, adj);
    if (!result.paths || result.paths.length === 0)
        return null;
    // Collapse to a single `<path>` only when the preset truly is one filled
    // path with no stroke-only ornaments and no per-path fill modulation.
    // ECMA-376 ornaments like scroll curls use `fill="none"` paths whose stroke
    // we MUST preserve, so any such mix forces multiPath rendering.
    const allNormStroke = result.paths.length === 1 &&
        result.paths[0].fillMod === "norm" &&
        result.paths[0].stroke;
    if (allNormStroke) {
        return { kind: "path", d: result.paths[0].d };
    }
    const paths = result.paths.map((p) => ({
        d: p.d,
        fillMod: p.fillMod,
        stroke: p.stroke,
    }));
    return { kind: "multiPath", paths };
}
// ECMA-376 §20.1.9.15 — DrawingML 路径的填充约定使用偶奇填充：当一条 path 内有
// 多条子路径（M…Z…M…Z），后续子路径在外层封闭区域内会成为「孔」（hole），渲染
// 出 noSmoking 的禁止符内圈、verticalScroll 卷边内圆、actionButton 三角缺口等
// 几何造型。SVG 默认是 nonzero（按缠绕数判断），用 nonzero 会把孔填满；这里在
// 路径包含 ≥2 个 `M`（即真正含子路径）时显式设置 fillRule="evenodd"。
export function pathHasSubPaths(d) {
    if (!d)
        return false;
    let count = 0;
    for (let i = 0; i < d.length; i++) {
        const c = d[i];
        if (c === "M" || c === "m") {
            count++;
            if (count >= 2)
                return true;
        }
    }
    return false;
}
// All preset shape geometry now flows through the official OOXML
// presetShapeDefinitions.xml (bundled as `preset-shapes.gen.ts`). For the few
// names where a native primitive renders better than a path (rect/ellipse for
// example), we expose a thin wrapper that the renderer can specialize.
export function presetToShape(name, bbox, adj = {}) {
    switch (name) {
        case "rect":
            return { kind: "rect" };
        case "line":
        case "straightConnector1":
            return { kind: "line", x1: bbox.x, y1: bbox.y, x2: bbox.x + bbox.w, y2: bbox.y + bbox.h };
    }
    const officialDef = OFFICIAL_PRESETS[name];
    if (officialDef) {
        const r = presetFromDef(officialDef, bbox, adj);
        if (r)
            return r;
    }
    return { kind: "rect" };
}
export function officialPresetAdjDefaults(name) {
    const def = OFFICIAL_PRESETS[name];
    if (!def?.avLst)
        return undefined;
    return { ...def.avLst };
}
export function listOfficialAdjustHandles(name, bbox, adj = {}) {
    const def = OFFICIAL_PRESETS[name];
    if (!def)
        return [];
    return evalPresetAdjustHandles(def, bbox, adj);
}
export function dragOfficialAdjustHandle(name, bbox, adj, handleIndex, localX, localY) {
    const def = OFFICIAL_PRESETS[name];
    if (!def)
        return { ...adj };
    return adjFromAdjustHandleDrag(def, bbox, adj, handleIndex, localX, localY);
}
