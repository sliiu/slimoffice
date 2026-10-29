// §19.5.3 bldLst 索引 + chart/diagram series/category 拆分。
//
// PowerPoint 写出的 PPT 通常已在 timing 树中按段落展开 spTgt.txEl.pRg；编译器
// 仅需把 bldP 的 animBg / bldLvl 元数据附加到 Atom，让 renderer 决定是否带动背景。
//
// 对 bldGraphic / bldOleChart series/category 模式：当 timing 引用了整个 chart shape
// 而未显式 graphicEl.chartEl 时，根据 BuildEnumerator 提供的 series/category 数克隆
// leaf，使每个 chart 子元素独立参与动画。
export function buildBuildIndex(builds) {
    const idx = new Map();
    if (!builds)
        return idx;
    for (const b of builds) {
        const list = idx.get(b.shapeId);
        if (list)
            list.push(b);
        else
            idx.set(b.shapeId, [b]);
    }
    return idx;
}
// shapeId 形如 "sp_<spid>"；BuildSpec.shapeId 与此一致。
// grpId 缺省视为 0；多个 build 共享同一 spid 但 grpId 不同时按 grpId 选择。
export function findBuild(index, shapeId, grpId) {
    const list = index.get(shapeId);
    if (!list || list.length === 0)
        return undefined;
    if (grpId !== undefined) {
        const exact = list.find((b) => b.grpId === grpId);
        if (exact)
            return exact;
    }
    // 未指定 grpId 或没找到：返回第一项作为兜底（PowerPoint 单 grp 时也是这种）。
    return list[0];
}
// §19.5.3 bldGraphic / §19.5.5 bldOleChart 的 build 值集合（ST_TLChartSubelementType / ST_TLOleChartBuildType）。
const CHART_SUBELEMENT_BUILDS = new Set([
    "series",
    "category",
    "seriesElement",
    "seriesEl",
    "categoryElement",
    "categoryEl",
]);
// 返回需要克隆的子元素数；undefined 表示不拆分。
export function chartSplitCount(spec, enumerator) {
    if (!spec)
        return undefined;
    if (spec.kind !== "chart" && spec.kind !== "graphic" && spec.kind !== "ole") {
        return undefined;
    }
    const build = spec.build ?? "allAtOnce";
    if (!CHART_SUBELEMENT_BUILDS.has(build))
        return undefined;
    const isSeries = build.startsWith("series");
    const isCategory = build.startsWith("category");
    if (isSeries) {
        const n = enumerator?.chartSeriesCount?.(stripSp(spec.shapeId));
        if (n && n > 0)
            return { count: n, field: "series" };
    }
    if (isCategory) {
        const n = enumerator?.chartCategoryCount?.(stripSp(spec.shapeId));
        if (n && n > 0)
            return { count: n, field: "category" };
    }
    return undefined;
}
function stripSp(shapeId) {
    return shapeId.startsWith("sp_") ? shapeId.slice(3) : shapeId;
}
