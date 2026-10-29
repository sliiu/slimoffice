"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseChartEx = parseChartEx;
const xml_1 = require("./xml");
const theme_1 = require("./theme");
const units_1 = require("./units");
const parts_1 = require("./parts");
const DEFAULT_PALETTE = [
    "#4E79A7",
    "#F28E2B",
    "#E15759",
    "#76B7B2",
    "#59A14F",
    "#EDC948",
    "#B07AA1",
    "#FF9DA7",
    "#9C755F",
    "#BAB0AC",
];
// 把 chartEx 的 layoutId 字符串映射到 ChartDef.type。
const LAYOUT_MAP = {
    sunburst: "sunburst",
    treemap: "treemap",
    waterfall: "waterfall",
    funnel: "funnel",
    paretoLine: "pareto",
    clusteredColumn: "histogram",
    histogram: "histogram",
    boxWhisker: "boxWhisker",
    regionMap: "region",
};
function parseChartEx(archive, chartPath, ctx) {
    const xml = (0, parts_1.loadXmlPart)(archive, chartPath);
    if (!xml)
        return null;
    // 兼容 cx: 与 cx14: 等命名空间，stripNs 已经统一去前缀。
    const chartSpace = (0, xml_1.findByLocalName)(xml, "chartSpace");
    if (!chartSpace)
        return null;
    const chart = (0, xml_1.findByLocalName)(chartSpace, "chart");
    const plotArea = (0, xml_1.findByLocalName)(chart, "plotArea");
    if (!plotArea)
        return null;
    const title = readChartExTitle((0, xml_1.findByLocalName)(chart, "title"));
    const legend = !!(0, xml_1.findByLocalName)(chart, "legend");
    const dataEl = (0, xml_1.findByLocalName)(chartSpace, "chartData");
    // chartEx 的每个 plotArea/plotAreaRegion/series 上有 layoutId；多 series 时取首个。
    const region = (0, xml_1.findByLocalName)(plotArea, "plotAreaRegion");
    const seriesList = (0, xml_1.findAllByLocalName)(region ?? plotArea, "series");
    const firstLayoutId = (0, xml_1.attr)(seriesList[0], "layoutId") ?? (0, xml_1.attr)(plotArea, "layoutId") ?? "unknown";
    const type = LAYOUT_MAP[firstLayoutId] ?? "unknown";
    // 数据维度通过 plotArea/plotAreaRegion/series/dataPt(numCache) + chartData/data 中的
    // strDim/numDim 解析。这里做一个统一通道：把每个 series 的数值列与分类列收集出来。
    const series = [];
    const categories = readCategoriesFromChartData(dataEl);
    for (let i = 0; i < seriesList.length; i++) {
        const ser = seriesList[i];
        const name = readSeriesName(ser);
        const dataIdRef = (0, xml_1.attr)((0, xml_1.findByLocalName)(ser, "tx"), "dataId");
        void dataIdRef;
        const values = readSeriesValues(ser, dataEl);
        const color = readSpFill((0, xml_1.findByLocalName)(ser, "spPr"), ctx);
        const s = { name: name ?? `Series ${i + 1}`, values };
        if (color)
            s.color = color;
        const dLbls = readDataLabels((0, xml_1.findByLocalName)(ser, "dataLabels"));
        if (dLbls)
            s.dataLabels = dLbls;
        series.push(s);
    }
    ensurePalette(series);
    // varyColors 在 chartEx 中没有显式开关；sunburst/treemap/funnel 默认按数据点着色。
    const varyColors = type === "sunburst" || type === "treemap" || type === "funnel";
    const base = {
        title,
        categories,
        series,
        legend,
        varyColors,
    };
    if (type === "histogram") {
        const binCountEl = (0, xml_1.findByLocalName)(seriesList[0], "binCount");
        const binSizeEl = (0, xml_1.findByLocalName)(seriesList[0], "binSize");
        const binCount = binCountEl ? Number((0, xml_1.attr)(binCountEl, "val")) : undefined;
        const binSize = binSizeEl ? Number((0, xml_1.attr)(binSizeEl, "val")) : undefined;
        return {
            type: "histogram",
            ...base,
            binCount: Number.isFinite(binCount) ? binCount : undefined,
            binSize: Number.isFinite(binSize) ? binSize : undefined,
        };
    }
    if (type === "unknown") {
        return { type: "unknown", ...base, rawType: firstLayoutId };
    }
    return { type, ...base };
}
function readChartExTitle(titleEl) {
    if (!titleEl)
        return undefined;
    const tx = (0, xml_1.findByLocalName)(titleEl, "tx");
    const rich = (0, xml_1.findByLocalName)(tx, "rich");
    if (!rich)
        return undefined;
    const parts = [];
    for (const p of (0, xml_1.findAllByLocalName)(rich, "p")) {
        for (const r of (0, xml_1.findAllByLocalName)(p, "r")) {
            const t = (0, xml_1.findByLocalName)(r, "t");
            const text = typeof t === "string" ? t : t?.["#text"];
            if (text)
                parts.push(String(text));
        }
    }
    return parts.join("") || undefined;
}
function readSeriesName(ser) {
    const tx = (0, xml_1.findByLocalName)(ser, "tx");
    const txData = (0, xml_1.findByLocalName)(tx, "txData");
    const v = (0, xml_1.findByLocalName)(txData, "v");
    if (v)
        return readText(v);
    return undefined;
}
// chartEx 数据有两种位置：series 内联 numCache/strCache，或在外层 chartData/data 内。
function readSeriesValues(ser, dataEl) {
    const dataIdEl = (0, xml_1.findByLocalName)(ser, "dataId");
    const dataId = dataIdEl ? Number((0, xml_1.attr)(dataIdEl, "val")) : undefined;
    const numDim = (0, xml_1.findByLocalName)(ser, "numDim") ??
        (0, xml_1.findByLocalName)((0, xml_1.findByLocalName)(ser, "data"), "numDim");
    if (numDim)
        return readNumLevel(numDim);
    if (dataEl && dataId !== undefined && Number.isFinite(dataId)) {
        for (const d of (0, xml_1.findAllByLocalName)(dataEl, "data")) {
            if (Number((0, xml_1.attr)(d, "id")) !== dataId)
                continue;
            const nd = (0, xml_1.findByLocalName)(d, "numDim");
            if (nd)
                return readNumLevel(nd);
        }
    }
    if (dataEl) {
        for (const d of (0, xml_1.findAllByLocalName)(dataEl, "data")) {
            const nd = (0, xml_1.findByLocalName)(d, "numDim");
            if (nd)
                return readNumLevel(nd);
        }
    }
    return [];
}
function readCategoriesFromChartData(dataEl) {
    if (!dataEl)
        return [];
    const data = (0, xml_1.findAllByLocalName)(dataEl, "data");
    for (const d of data) {
        const sd = (0, xml_1.findByLocalName)(d, "strDim");
        if (sd)
            return readStrLevel(sd);
    }
    return [];
}
function readNumLevel(numDim) {
    const lvl = (0, xml_1.findByLocalName)(numDim, "lvl") ?? numDim;
    const out = [];
    for (const pt of (0, xml_1.findAllByLocalName)(lvl, "pt")) {
        const idx = Number((0, xml_1.attr)(pt, "idx") ?? out.length);
        while (out.length < idx)
            out.push(0);
        const v = (0, xml_1.findByLocalName)(pt, "v");
        const n = Number(v ? readText(v) : readText(pt));
        out.push(Number.isFinite(n) ? n : 0);
    }
    return out;
}
function readStrLevel(strDim) {
    const lvl = (0, xml_1.findByLocalName)(strDim, "lvl") ?? strDim;
    const out = [];
    for (const pt of (0, xml_1.findAllByLocalName)(lvl, "pt")) {
        const idx = Number((0, xml_1.attr)(pt, "idx") ?? out.length);
        while (out.length < idx)
            out.push("");
        const v = (0, xml_1.findByLocalName)(pt, "v");
        out.push(v ? readText(v) : readText(pt));
    }
    return out;
}
function readSpFill(spPr, ctx) {
    if (!spPr)
        return undefined;
    const solid = (0, xml_1.findByLocalName)(spPr, "solidFill");
    if (!solid)
        return undefined;
    return (0, theme_1.resolveColor)(solid, ctx.theme);
}
function readText(n) {
    if (!n)
        return "";
    if (typeof n === "string")
        return n;
    const t = n["#text"];
    return t === undefined || t === null ? "" : String(t);
}
function ensurePalette(series) {
    let i = 0;
    for (const s of series) {
        if (!s.color)
            s.color = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
        i++;
    }
}
function readDataLabels(dLblsEl) {
    if (!dLblsEl)
        return undefined;
    const out = {};
    const visibility = (0, xml_1.findByLocalName)(dLblsEl, "visibility");
    if (visibility) {
        const sv = (0, units_1.boolish)((0, xml_1.attr)(visibility, "value"));
        if (sv !== undefined)
            out.showVal = sv;
        const sc = (0, units_1.boolish)((0, xml_1.attr)(visibility, "categoryName"));
        if (sc !== undefined)
            out.showCatName = sc;
        const ss = (0, units_1.boolish)((0, xml_1.attr)(visibility, "seriesName"));
        if (ss !== undefined)
            out.showSerName = ss;
    }
    const sep = (0, xml_1.attr)(dLblsEl, "separator");
    if (sep)
        out.separator = sep;
    const pos = (0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "dataLabel"), "pos");
    if (pos)
        out.position = pos;
    return Object.keys(out).length ? out : undefined;
}
