"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseChart = parseChart;
const xml_1 = require("./xml");
const theme_1 = require("./theme");
const parts_1 = require("./parts");
const units_1 = require("./units");
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
function parseChart(archive, chartPath, ctx) {
    const xml = (0, parts_1.loadXmlPart)(archive, chartPath);
    if (!xml)
        return null;
    const chartSpace = (0, xml_1.findByLocalName)(xml, "chartSpace");
    const chartEl = (0, xml_1.findByLocalName)(chartSpace, "chart");
    const plotArea = (0, xml_1.findByLocalName)(chartEl, "plotArea");
    if (!plotArea)
        return null;
    const title = readTitle((0, xml_1.findByLocalName)(chartEl, "title"));
    const legendEl = (0, xml_1.findByLocalName)(chartEl, "legend");
    const legend = !!legendEl;
    const axes = readPlotAreaAxes(plotArea);
    const view3D = readView3D((0, xml_1.findByLocalName)(chartEl, "view3D"));
    const is3DPlot = !!((0, xml_1.findByLocalName)(plotArea, "bar3DChart") ||
        (0, xml_1.findByLocalName)(plotArea, "line3DChart") ||
        (0, xml_1.findByLocalName)(plotArea, "pie3DChart") ||
        (0, xml_1.findByLocalName)(plotArea, "area3DChart") ||
        (0, xml_1.findByLocalName)(plotArea, "surface3DChart"));
    // ECMA-376 §21.2.2.216 chartSpace/txPr: the chart-level text default every label inherits.
    const chartText = readTextProps((0, xml_1.findByLocalName)(chartSpace, "txPr"), ctx);
    const axisLine = readAxisLineColor(plotArea, ctx);
    const decorate = (def, typeNode) => {
        if (!def)
            return def;
        if (axes)
            def.axes = axes;
        if (typeNode) {
            const vc = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(typeNode, "varyColors"), "val"));
            if (vc !== undefined)
                def.varyColors = vc;
            const dLbls = readDataLabels((0, xml_1.findByLocalName)(typeNode, "dLbls"));
            if (dLbls)
                def.dataLabels = dLbls;
        }
        if (is3DPlot)
            def.chart3D = true;
        if (view3D)
            def.view3D = view3D;
        if (chartText.color)
            def.textColor = chartText.color;
        if (chartText.size)
            def.textSize = chartText.size;
        if (axisLine)
            def.lineColor = axisLine;
        return def;
    };
    const plots = [];
    const push = (node, def) => {
        if (node && def)
            plots.push({ def, node });
    };
    for (const n of [
        ...(0, xml_1.findAllByLocalName)(plotArea, "barChart"),
        ...(0, xml_1.findAllByLocalName)(plotArea, "bar3DChart"),
    ]) {
        push(n, parseBarLike(n, ctx, title, legend));
    }
    for (const n of [
        ...(0, xml_1.findAllByLocalName)(plotArea, "lineChart"),
        ...(0, xml_1.findAllByLocalName)(plotArea, "line3DChart"),
    ]) {
        push(n, parseLine(n, ctx, title, legend));
    }
    for (const n of [
        ...(0, xml_1.findAllByLocalName)(plotArea, "pieChart"),
        ...(0, xml_1.findAllByLocalName)(plotArea, "pie3DChart"),
        ...(0, xml_1.findAllByLocalName)(plotArea, "ofPieChart"),
    ]) {
        push(n, parsePieLike(n, ctx, "pie", title, legend));
    }
    for (const n of (0, xml_1.findAllByLocalName)(plotArea, "doughnutChart")) {
        push(n, parsePieLike(n, ctx, "doughnut", title, legend));
    }
    for (const n of [
        ...(0, xml_1.findAllByLocalName)(plotArea, "areaChart"),
        ...(0, xml_1.findAllByLocalName)(plotArea, "area3DChart"),
    ]) {
        push(n, parseArea(n, ctx, title, legend));
    }
    for (const n of (0, xml_1.findAllByLocalName)(plotArea, "scatterChart")) {
        push(n, parseScatter(n, ctx, title, legend));
    }
    for (const n of (0, xml_1.findAllByLocalName)(plotArea, "bubbleChart")) {
        push(n, parseBubble(n, ctx, title, legend));
    }
    for (const n of (0, xml_1.findAllByLocalName)(plotArea, "radarChart")) {
        push(n, parseRadar(n, ctx, title, legend));
    }
    for (const n of (0, xml_1.findAllByLocalName)(plotArea, "stockChart")) {
        push(n, parseStock(n, ctx, title, legend));
    }
    for (const n of [
        ...(0, xml_1.findAllByLocalName)(plotArea, "surfaceChart"),
        ...(0, xml_1.findAllByLocalName)(plotArea, "surface3DChart"),
    ]) {
        push(n, parseSurface(n, ctx, title, legend));
    }
    if (plots.length === 0)
        return null;
    if (plots.length === 1)
        return decorate(plots[0].def, plots[0].node);
    // 组合图：plotArea 里多个 c:*Chart 并存（柱+折线，或柱+散点）。
    const CAT_COMBO = new Set(["bar", "column", "line", "area", "radar", "stock"]);
    const XY_COMBO = new Set(["scatter", "bubble"]);
    const comboPlots = plots.filter((p) => CAT_COMBO.has(p.def.type) || XY_COMBO.has(p.def.type));
    if (comboPlots.length >= 2) {
        const primary = comboPlots.find((p) => CAT_COMBO.has(p.def.type)) ?? comboPlots[0];
        const series = [];
        for (const p of comboPlots) {
            const ty = p.def.type;
            if (ty === "scatter" || ty === "bubble") {
                const pts = p.def.points ?? [];
                for (let i = 0; i < p.def.series.length; i++) {
                    series.push({ ...p.def.series[i], chartType: ty, points: pts[i] });
                }
            }
            else {
                for (const s of p.def.series) {
                    series.push({ ...s, chartType: ty });
                }
            }
        }
        return decorate({ ...primary.def, series }, primary.node);
    }
    return decorate(plots[0].def, plots[0].node);
}
function readTitle(titleEl) {
    if (!titleEl)
        return undefined;
    const tx = (0, xml_1.findByLocalName)(titleEl, "tx");
    const rich = (0, xml_1.findByLocalName)(tx, "rich");
    if (!rich)
        return undefined;
    const ps = (0, xml_1.findAllByLocalName)(rich, "p");
    const parts = [];
    for (const p of ps) {
        for (const r of (0, xml_1.findAllByLocalName)(p, "r")) {
            const t = (0, xml_1.findByLocalName)(r, "t");
            const text = typeof t === "string" ? t : t?.["#text"];
            if (text)
                parts.push(String(text));
        }
    }
    return parts.join("") || undefined;
}
function readView3D(el) {
    if (!el)
        return undefined;
    const num = (name) => {
        const v = Number((0, xml_1.attr)((0, xml_1.findByLocalName)(el, name), "val"));
        return Number.isFinite(v) ? v : undefined;
    };
    const out = {};
    const rotX = num("rotX");
    const rotY = num("rotY");
    const perspective = num("perspective");
    const depthPercent = num("depthPercent");
    const rAngAx = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(el, "rAngAx"), "val"));
    if (rotX !== undefined)
        out.rotX = rotX;
    if (rotY !== undefined)
        out.rotY = rotY;
    if (perspective !== undefined)
        out.perspective = perspective;
    if (depthPercent !== undefined)
        out.depthPercent = depthPercent;
    if (rAngAx !== undefined)
        out.rAngAx = rAngAx;
    return Object.keys(out).length ? out : undefined;
}
function readSeriesShared(ser, ctx, idxFallback) {
    const name = readSerName(ser);
    const values = readValues((0, xml_1.findByLocalName)(ser, "val"));
    const color = readShapeFill((0, xml_1.findByLocalName)(ser, "spPr"), ctx);
    const s = { name, values };
    if (color)
        s.color = color;
    if (!name)
        s.name = `Series ${idxFallback + 1}`;
    attachSerMeta(ser, s, ctx);
    return s;
}
function attachSerMeta(ser, s, ctx) {
    const color = s.color ?? readShapeFill((0, xml_1.findByLocalName)(ser, "spPr"), ctx);
    if (color && !s.color)
        s.color = color;
    // 数据点级颜色（从 dPt 列表填充 perPointColors，索引保留位置）。
    const dPts = (0, xml_1.findAllByLocalName)(ser, "dPt");
    if (dPts.length) {
        const palette = [];
        for (const dPt of dPts) {
            const idx = Number((0, xml_1.attr)((0, xml_1.findByLocalName)(dPt, "idx"), "val") ?? palette.length);
            const c = readShapeFill((0, xml_1.findByLocalName)(dPt, "spPr"), ctx);
            while (palette.length < idx)
                palette.push("");
            palette.push(c ?? "");
        }
        if (palette.some(Boolean))
            s.perPointColors = palette;
    }
    const dLbls = readDataLabels((0, xml_1.findByLocalName)(ser, "dLbls"));
    if (dLbls)
        s.dataLabels = dLbls;
    const trend = (0, xml_1.findByLocalName)(ser, "trendline");
    if (trend) {
        const tl = {
            type: (0, xml_1.attr)((0, xml_1.findByLocalName)(trend, "trendlineType"), "val") ?? "linear",
        };
        const order = (0, xml_1.attr)((0, xml_1.findByLocalName)(trend, "order"), "val");
        if (order)
            tl.order = Number(order);
        const period = (0, xml_1.attr)((0, xml_1.findByLocalName)(trend, "period"), "val");
        if (period)
            tl.period = Number(period);
        s.trendline = tl;
    }
    const errBar = (0, xml_1.findByLocalName)(ser, "errBars");
    if (errBar) {
        s.errorBars = {
            errBarType: (0, xml_1.attr)((0, xml_1.findByLocalName)(errBar, "errBarType"), "val"),
            errValType: (0, xml_1.attr)((0, xml_1.findByLocalName)(errBar, "errValType"), "val"),
            val: numAttrVal((0, xml_1.findByLocalName)(errBar, "val")),
        };
    }
    const exp = numAttrVal((0, xml_1.findByLocalName)(ser, "explosion"));
    if (exp !== undefined)
        s.explosion = exp;
}
function numAttrVal(el) {
    const v = (0, xml_1.attr)(el, "val");
    if (v === undefined)
        return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}
function readDataLabels(dLblsEl) {
    if (!dLblsEl)
        return undefined;
    const out = {};
    const sv = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "showVal"), "val"));
    if (sv !== undefined)
        out.showVal = sv;
    const sc = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "showCatName"), "val"));
    if (sc !== undefined)
        out.showCatName = sc;
    const ss = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "showSerName"), "val"));
    if (ss !== undefined)
        out.showSerName = ss;
    const sp = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "showPercent"), "val"));
    if (sp !== undefined)
        out.showPercent = sp;
    const sl = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "showLegendKey"), "val"));
    if (sl !== undefined)
        out.showLegendKey = sl;
    const sb = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "showBubbleSize"), "val"));
    if (sb !== undefined)
        out.showBubbleSize = sb;
    const sep = (0, xml_1.findByLocalName)(dLblsEl, "separator");
    if (sep) {
        const t = readText(sep);
        if (t)
            out.separator = t;
    }
    const pos = (0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "dLblPos"), "val");
    if (pos)
        out.position = pos;
    const numFmt = (0, xml_1.attr)((0, xml_1.findByLocalName)(dLblsEl, "numFmt"), "formatCode");
    if (numFmt)
        out.numFmt = numFmt;
    return Object.keys(out).length ? out : undefined;
}
function readAxis(axEl, type) {
    const ax = { type };
    ax.id = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "axId"), "val");
    const del = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "delete"), "val"));
    if (del !== undefined)
        ax.delete = del;
    const pos = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "axPos"), "val");
    if (pos)
        ax.position = pos;
    const title = readTitle((0, xml_1.findByLocalName)(axEl, "title"));
    if (title)
        ax.title = title;
    const scaling = (0, xml_1.findByLocalName)(axEl, "scaling");
    if (scaling) {
        const sc = {};
        const orient = (0, xml_1.attr)((0, xml_1.findByLocalName)(scaling, "orientation"), "val");
        if (orient)
            sc.orientation = orient;
        const min = numAttrVal((0, xml_1.findByLocalName)(scaling, "min"));
        if (min !== undefined)
            sc.min = min;
        const max = numAttrVal((0, xml_1.findByLocalName)(scaling, "max"));
        if (max !== undefined)
            sc.max = max;
        const log = numAttrVal((0, xml_1.findByLocalName)(scaling, "logBase"));
        if (log !== undefined)
            sc.logBase = log;
        if (Object.keys(sc).length)
            ax.scaling = sc;
    }
    const mu = numAttrVal((0, xml_1.findByLocalName)(axEl, "majorUnit"));
    if (mu !== undefined)
        ax.majorUnit = mu;
    const mi = numAttrVal((0, xml_1.findByLocalName)(axEl, "minorUnit"));
    if (mi !== undefined)
        ax.minorUnit = mi;
    const mt = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "majorTickMark"), "val");
    if (mt)
        ax.majorTickMark = mt;
    const mit = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "minorTickMark"), "val");
    if (mit)
        ax.minorTickMark = mit;
    if ((0, xml_1.findByLocalName)(axEl, "majorGridlines"))
        ax.majorGridlines = true;
    if ((0, xml_1.findByLocalName)(axEl, "minorGridlines"))
        ax.minorGridlines = true;
    const numFmt = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "numFmt"), "formatCode");
    if (numFmt)
        ax.numFmt = numFmt;
    const crossesEl = (0, xml_1.findByLocalName)(axEl, "crosses");
    const crossesAt = (0, xml_1.findByLocalName)(axEl, "crossesAt");
    if (crossesAt) {
        const v = numAttrVal(crossesAt);
        if (v !== undefined)
            ax.crosses = v;
    }
    else if (crossesEl) {
        const cv = (0, xml_1.attr)(crossesEl, "val");
        if (cv === "autoZero" || cv === "min" || cv === "max")
            ax.crosses = cv;
    }
    if (type === "date") {
        const bt = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "baseTimeUnit"), "val");
        if (bt)
            ax.baseTimeUnit = bt;
        const mtu = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "majorTimeUnit"), "val");
        if (mtu)
            ax.majorTimeUnit = mtu;
        const mintu = (0, xml_1.attr)((0, xml_1.findByLocalName)(axEl, "minorTimeUnit"), "val");
        if (mintu)
            ax.minorTimeUnit = mintu;
    }
    return ax;
}
function readPlotAreaAxes(plotArea) {
    if (!plotArea)
        return undefined;
    const out = [];
    for (const ax of (0, xml_1.findAllByLocalName)(plotArea, "catAx"))
        out.push(readAxis(ax, "cat"));
    for (const ax of (0, xml_1.findAllByLocalName)(plotArea, "valAx"))
        out.push(readAxis(ax, "val"));
    for (const ax of (0, xml_1.findAllByLocalName)(plotArea, "dateAx"))
        out.push(readAxis(ax, "date"));
    return out.length ? out : undefined;
}
function readSerName(ser) {
    const tx = (0, xml_1.findByLocalName)(ser, "tx");
    const strRef = (0, xml_1.findByLocalName)(tx, "strRef");
    if (strRef) {
        const cache = (0, xml_1.findByLocalName)(strRef, "strCache");
        const pts = (0, xml_1.findAllByLocalName)(cache, "pt");
        if (pts[0]) {
            const v = (0, xml_1.findByLocalName)(pts[0], "v");
            return readText(v);
        }
    }
    const v = (0, xml_1.findByLocalName)(tx, "v");
    return v ? readText(v) : undefined;
}
function readValues(valEl) {
    if (!valEl)
        return [];
    const numRef = (0, xml_1.findByLocalName)(valEl, "numRef");
    const numLit = (0, xml_1.findByLocalName)(valEl, "numLit");
    const src = numRef ? (0, xml_1.findByLocalName)(numRef, "numCache") : numLit;
    if (!src)
        return [];
    const pts = (0, xml_1.findAllByLocalName)(src, "pt");
    const out = [];
    for (const pt of pts) {
        const idx = Number((0, xml_1.attr)(pt, "idx") ?? out.length);
        const v = (0, xml_1.findByLocalName)(pt, "v");
        const n = Number(readText(v));
        while (out.length < idx)
            out.push(0);
        out.push(Number.isFinite(n) ? n : 0);
    }
    return out;
}
function readCategoryStrings(catEl) {
    if (!catEl)
        return [];
    const strRef = (0, xml_1.findByLocalName)(catEl, "strRef");
    const strLit = (0, xml_1.findByLocalName)(catEl, "strLit");
    const numRef = (0, xml_1.findByLocalName)(catEl, "numRef");
    const numLit = (0, xml_1.findByLocalName)(catEl, "numLit");
    const src = (strRef && (0, xml_1.findByLocalName)(strRef, "strCache")) ||
        (numRef && (0, xml_1.findByLocalName)(numRef, "numCache")) ||
        strLit ||
        numLit;
    if (!src)
        return [];
    const pts = (0, xml_1.findAllByLocalName)(src, "pt");
    const out = [];
    for (const pt of pts) {
        const idx = Number((0, xml_1.attr)(pt, "idx") ?? out.length);
        const v = (0, xml_1.findByLocalName)(pt, "v");
        while (out.length < idx)
            out.push("");
        out.push(readText(v));
    }
    return out;
}
function readShapeFill(spPr, ctx) {
    if (!spPr)
        return undefined;
    const solid = (0, xml_1.findByLocalName)(spPr, "solidFill");
    if (!solid)
        return undefined;
    return (0, theme_1.resolveColor)(solid, ctx.theme);
}
/** txPr → default run colour / size: a:p/a:pPr/a:defRPr (sz in hundredths of a point → px). */
function readTextProps(txPr, ctx) {
    if (!txPr)
        return {};
    const p = (0, xml_1.findByLocalName)(txPr, "p");
    const pPr = (0, xml_1.findByLocalName)(p, "pPr");
    const defRPr = (0, xml_1.findByLocalName)(pPr, "defRPr") ?? (0, xml_1.findByLocalName)(txPr, "defRPr");
    if (!defRPr)
        return {};
    const out = {};
    const solid = (0, xml_1.findByLocalName)(defRPr, "solidFill");
    const color = solid ? (0, theme_1.resolveColor)(solid, ctx.theme) : undefined;
    if (color)
        out.color = color;
    const sz = Number((0, xml_1.attr)(defRPr, "sz"));
    if (Number.isFinite(sz) && sz > 0)
        out.size = Math.round((sz / 100) * (96 / 72));
    return out;
}
/** First explicit axis / gridline stroke in the plot area (catAx · valAx · dateAx spPr/ln, majorGridlines spPr/ln). */
function readAxisLineColor(plotArea, ctx) {
    for (const ax of [...(0, xml_1.findAllByLocalName)(plotArea, "valAx"), ...(0, xml_1.findAllByLocalName)(plotArea, "catAx"), ...(0, xml_1.findAllByLocalName)(plotArea, "dateAx")]) {
        for (const holder of [(0, xml_1.findByLocalName)(ax, "majorGridlines"), ax]) {
            const ln = (0, xml_1.findByLocalName)((0, xml_1.findByLocalName)(holder, "spPr"), "ln");
            const solid = (0, xml_1.findByLocalName)(ln, "solidFill");
            const color = solid ? (0, theme_1.resolveColor)(solid, ctx.theme) : undefined;
            if (color)
                return color;
        }
    }
    return undefined;
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
        if (!s.color) {
            s.color = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
        }
        i++;
    }
}
function parseBarLike(node, ctx, title, legend) {
    const dir = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "barDir"), "val");
    const grouping = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "grouping"), "val");
    const sers = (0, xml_1.findAllByLocalName)(node, "ser");
    const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
    let categories = [];
    for (const s of sers) {
        const cat = (0, xml_1.findByLocalName)(s, "cat");
        const list = readCategoryStrings(cat);
        if (list.length > categories.length)
            categories = list;
    }
    ensurePalette(series);
    return {
        type: dir === "bar" ? "bar" : "column",
        title,
        categories,
        series,
        legend,
        stacked: grouping === "stacked",
        percentStacked: grouping === "percentStacked",
    };
}
function parseLine(node, ctx, title, legend) {
    const sers = (0, xml_1.findAllByLocalName)(node, "ser");
    const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
    let categories = [];
    for (const s of sers) {
        const list = readCategoryStrings((0, xml_1.findByLocalName)(s, "cat"));
        if (list.length > categories.length)
            categories = list;
    }
    ensurePalette(series);
    const smooth = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(sers[0], "smooth"), "val"));
    const chartMarker = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(node, "marker"), "val"));
    const serMarkers = sers.some((ser) => {
        const m = (0, xml_1.findByLocalName)(ser, "marker");
        const sym = (0, xml_1.attr)((0, xml_1.findByLocalName)(m, "symbol"), "val");
        return !!m && sym !== "none";
    });
    return {
        type: "line",
        title,
        categories,
        series,
        legend,
        smooth: smooth ?? false,
        markers: chartMarker === true || serMarkers,
    };
}
function parsePieLike(node, ctx, type, title, legend) {
    const sers = (0, xml_1.findAllByLocalName)(node, "ser");
    const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
    let categories = [];
    for (const s of sers) {
        const list = readCategoryStrings((0, xml_1.findByLocalName)(s, "cat"));
        if (list.length > categories.length)
            categories = list;
        const dPts = (0, xml_1.findAllByLocalName)(s, "dPt");
        if (dPts.length > 0 && series[sers.indexOf(s)]) {
            const palette = [];
            for (const dPt of dPts) {
                const c = readShapeFill((0, xml_1.findByLocalName)(dPt, "spPr"), ctx);
                if (c)
                    palette.push(c);
            }
            if (palette.length > 0) {
                const ser = series[sers.indexOf(s)];
                ser.color = palette[0] ?? ser.color;
                ser.perSliceColors = palette;
            }
        }
    }
    ensurePalette(series);
    const holeSize = Number((0, xml_1.attr)((0, xml_1.findByLocalName)(node, "holeSize"), "val") ?? "0");
    const startAng = Number((0, xml_1.attr)((0, xml_1.findByLocalName)(node, "firstSliceAng"), "val") ?? "0");
    const ofPieType = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "ofPieType"), "val");
    return {
        type,
        title,
        categories,
        series,
        legend,
        holeRatio: type === "doughnut" ? (holeSize > 0 ? holeSize / 100 : 0.5) : 0,
        startAngle: Number.isFinite(startAng) ? startAng : 0,
        ...(ofPieType === "pie" || ofPieType === "bar" ? { ofPie: ofPieType } : {}),
    };
}
function parseArea(node, ctx, title, legend) {
    const grouping = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "grouping"), "val");
    const sers = (0, xml_1.findAllByLocalName)(node, "ser");
    const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
    let categories = [];
    for (const s of sers) {
        const list = readCategoryStrings((0, xml_1.findByLocalName)(s, "cat"));
        if (list.length > categories.length)
            categories = list;
    }
    ensurePalette(series);
    return {
        type: "area",
        title,
        categories,
        series,
        legend,
        stacked: grouping === "stacked" || grouping === "percentStacked",
    };
}
function parseScatter(node, ctx, title, legend) {
    const sers = (0, xml_1.findAllByLocalName)(node, "ser");
    const series = [];
    const points = [];
    for (let i = 0; i < sers.length; i++) {
        const s = sers[i];
        const name = readSerName(s);
        const color = readShapeFill((0, xml_1.findByLocalName)(s, "spPr"), ctx);
        const xs = readValues((0, xml_1.findByLocalName)(s, "xVal"));
        const ys = readValues((0, xml_1.findByLocalName)(s, "yVal"));
        const pts = [];
        const n = Math.min(xs.length, ys.length);
        for (let k = 0; k < n; k++)
            pts.push({ x: xs[k], y: ys[k] });
        points.push(pts);
        const ser = { name: name ?? `Series ${i + 1}`, values: ys, color };
        attachSerMeta(s, ser, ctx);
        series.push(ser);
    }
    ensurePalette(series);
    return {
        type: "scatter",
        title,
        series,
        legend,
        points,
    };
}
function parseBubble(node, ctx, title, legend) {
    const sers = (0, xml_1.findAllByLocalName)(node, "ser");
    const series = [];
    const points = [];
    for (let i = 0; i < sers.length; i++) {
        const s = sers[i];
        const name = readSerName(s);
        const color = readShapeFill((0, xml_1.findByLocalName)(s, "spPr"), ctx);
        const xs = readValues((0, xml_1.findByLocalName)(s, "xVal"));
        const ys = readValues((0, xml_1.findByLocalName)(s, "yVal"));
        const zs = readValues((0, xml_1.findByLocalName)(s, "bubbleSize"));
        const pts = [];
        const n = Math.min(xs.length, ys.length);
        for (let k = 0; k < n; k++) {
            const z = zs[k];
            pts.push(z !== undefined ? { x: xs[k], y: ys[k], z } : { x: xs[k], y: ys[k] });
        }
        points.push(pts);
        const ser = { name: name ?? `Series ${i + 1}`, values: ys, color };
        attachSerMeta(s, ser, ctx);
        series.push(ser);
    }
    ensurePalette(series);
    return {
        type: "bubble",
        title,
        series,
        legend,
        points,
    };
}
function parseCategorySeries(node, ctx) {
    const sers = (0, xml_1.findAllByLocalName)(node, "ser");
    const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
    let categories = [];
    for (const s of sers) {
        const list = readCategoryStrings((0, xml_1.findByLocalName)(s, "cat"));
        if (list.length > categories.length)
            categories = list;
    }
    ensurePalette(series);
    return { series, categories };
}
function parseRadar(node, ctx, title, legend) {
    const { series, categories } = parseCategorySeries(node, ctx);
    const style = (0, xml_1.attr)((0, xml_1.findByLocalName)(node, "radarStyle"), "val");
    const radarStyle = style === "filled" || style === "marker" || style === "standard" ? style : "marker";
    return {
        type: "radar",
        title,
        categories,
        series,
        legend,
        radarStyle,
    };
}
function parseStock(node, ctx, title, legend) {
    const { series, categories } = parseCategorySeries(node, ctx);
    return {
        type: "stock",
        title,
        categories,
        series,
        legend,
    };
}
function parseSurface(node, ctx, title, legend) {
    const { series, categories } = parseCategorySeries(node, ctx);
    const wireframe = (0, units_1.boolish)((0, xml_1.attr)((0, xml_1.findByLocalName)(node, "wireframe"), "val")) ?? false;
    return {
        type: "surface",
        title,
        categories,
        series,
        legend,
        wireframe,
    };
}
