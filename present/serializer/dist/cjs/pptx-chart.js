"use strict";
// c:chart 部件渲染（ECMA-376 §21.2 DrawingML Charts）。
//
// from-scratch 导出 ChartShape：之前 chart 被降级成 rect 占位（导出后数据图
// 直接变灰块）。现在按 ChartDef 生成真正的 chartSpace 部件 + graphicFrame 引用：
//   - 数据用 strLit / numLit 字面量（合法 OOXML，无需内嵌 xlsx workbook；
//     PowerPoint 打开正常渲染，点"编辑数据"时会自动生成新表格）
//   - 支持 bar / column / line / pie / doughnut / area / scatter /
//     bubble / radar / stock / surface，以及柱+折线等组合图
//   - chartEx 现代类型（sunburst / treemap / …）见 pptx-chart-ex.ts
//
// 解析侧 packages/parser/src/chart.ts 读 numLit/strLit 与 c:tx/c:v，本文件的输出
// 可被自家 parser 完整读回（round-trip 自洽）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.chartExportSupported = chartExportSupported;
exports.renderChartSpaceXml = renderChartSpaceXml;
const xml_util_1 = require("./xml-util");
// 与 parser/src/chart.ts DEFAULT_PALETTE 一致（导出→解析回来颜色不漂移）。
const DEFAULT_PALETTE = [
    "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
    "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
];
const CAT_AX_ID = 111111111;
const VAL_AX_ID = 222222222;
const SER_AX_ID = 333333333;
const CLASSIC_EXPORT = new Set([
    "bar",
    "column",
    "line",
    "pie",
    "doughnut",
    "area",
    "scatter",
    "bubble",
    "radar",
    "stock",
    "surface",
]);
/** 该 ChartDef 类型是否能渲染成 c:chart 部件。 */
function chartExportSupported(def) {
    return CLASSIC_EXPORT.has(def.type);
}
function renderChartSpaceXml(def) {
    const titleXml = def.title
        ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${(0, xml_util_1.esc)(def.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
        : `<c:autoTitleDeleted val="1"/>`;
    const legendXml = def.legend
        ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>`
        : "";
    const plotXml = renderPlot(def);
    const view3DXml = renderView3DXml(def.view3D, def.chart3D);
    // CT_ChartSpace order: … chart → spPr → txPr. A chart-wide text colour implies the chart is set
    // on a slide whose background it must show through, so the chart area goes transparent too.
    const spaceStyleXml = def.textColor
        ? `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPrXml(def.textColor, def.textSize)}`
        : "";
    return `${(0, xml_util_1.xmlHeader)()}
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    ${titleXml}
    ${view3DXml}
    <c:plotArea>
      <c:layout/>
      ${plotXml}
    </c:plotArea>
    ${legendXml}
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  ${spaceStyleXml}
</c:chartSpace>`;
}
/** c:txPr with one default run: colour + optional size (px → hundredths of a point). */
function txPrXml(color, sizePx) {
    const sz = sizePx && sizePx > 0 ? ` sz="${Math.round((sizePx * 72) / 96) * 100}"` : "";
    return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr${sz}><a:solidFill><a:srgbClr val="${(0, xml_util_1.parseColor)(color).hex}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
}
/** Axis / gridline stroke from `lineColor`; empty when unset so PowerPoint keeps its chart-style default. */
function lineSpPrXml(def) {
    if (!def?.lineColor)
        return "";
    return `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${(0, xml_util_1.parseColor)(def.lineColor).hex}"/></a:solidFill></a:ln></c:spPr>`;
}
function renderView3DXml(v, chart3D) {
    if (!v && !chart3D)
        return "";
    const rotX = Math.round(v?.rotX ?? 15);
    const rotY = Math.round(v?.rotY ?? 20);
    const persp = Math.round(v?.perspective ?? 30);
    const rAng = v?.rAngAx === false ? 0 : 1;
    const depth = v?.depthPercent != null ? `<c:depthPercent val="${Math.round(v.depthPercent)}"/>` : "";
    return `<c:view3D><c:rotX val="${rotX}"/><c:rotY val="${rotY}"/><c:rAngAx val="${rAng}"/>${depth}<c:perspective val="${persp}"/></c:view3D>`;
}
function isCombo(def) {
    return def.series.some((s) => s.chartType && s.chartType !== def.type);
}
function renderPlot(def) {
    if (isCombo(def))
        return renderCombo(def);
    return renderSinglePlot(def, def.series) + plotAxes(def);
}
function renderCombo(def) {
    const groups = new Map();
    for (const s of def.series) {
        const ty = (s.chartType ?? def.type);
        const list = groups.get(ty) ?? [];
        list.push(s);
        groups.set(ty, list);
    }
    let xml = "";
    let hasCat = false;
    let hasXy = false;
    for (const [ty, sers] of groups) {
        if (ty === "scatter" || ty === "bubble")
            hasXy = true;
        else
            hasCat = true;
        if (ty === "scatter") {
            const points = sers.map((s) => scatterPointsOf(def, s));
            xml += renderSinglePlot({ ...def, type: "scatter", points }, sers);
        }
        else if (ty === "bubble") {
            const points = sers.map((s) => scatterPointsOf(def, s));
            xml += renderSinglePlot({ ...def, type: "bubble", points }, sers);
        }
        else {
            xml += renderSinglePlot({ ...def, type: ty }, sers);
        }
    }
    if (hasCat)
        return xml + catValAxes(def);
    if (hasXy)
        return xml + scatterAxes(def);
    return xml + catValAxes(def);
}
function scatterPointsOf(def, s) {
    if (s.points?.length)
        return s.points;
    const defPts = def.points;
    const idx = def.series.indexOf(s);
    if (idx >= 0 && defPts?.[idx]?.length)
        return defPts[idx];
    return s.values.map((y, i) => ({ x: i, y }));
}
function renderSinglePlot(def, series) {
    switch (def.type) {
        case "bar":
        case "column": {
            const grouping = def.percentStacked ? "percentStacked" : def.stacked ? "stacked" : "clustered";
            const sers = series.map((s, i) => serXml(def, s, i, "bar")).join("");
            const overlap = grouping === "clustered" ? `<c:gapWidth val="150"/>` : `<c:gapWidth val="150"/><c:overlap val="100"/>`;
            const tag = def.chart3D || def.view3D ? "bar3DChart" : "barChart";
            const shape = tag === "bar3DChart" ? `<c:shape val="box"/>` : overlap;
            return `<c:${tag}><c:barDir val="${def.type === "bar" ? "bar" : "col"}"/><c:grouping val="${grouping}"/><c:varyColors val="${def.varyColors ? 1 : 0}"/>${sers}${dLblsXml(def)}${shape}${axIdPair()}</c:${tag}>`;
        }
        case "line": {
            const sers = series.map((s, i) => serXml(def, s, i, "line")).join("");
            const tag = def.chart3D || def.view3D ? "line3DChart" : "lineChart";
            return `<c:${tag}><c:grouping val="standard"/><c:varyColors val="0"/>${sers}${dLblsXml(def)}${tag === "lineChart" ? `<c:marker val="${def.markers ? 1 : 0}"/>` : ""}${axIdPair()}</c:${tag}>`;
        }
        case "area": {
            const grouping = def.stacked ? "stacked" : "standard";
            const sers = series.map((s, i) => serXml(def, s, i, "area")).join("");
            return `<c:areaChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}${dLblsXml(def)}${axIdPair()}</c:areaChart>`;
        }
        case "pie": {
            const sers = series.slice(0, 1).map((s, i) => serXml(def, s, i, "pie")).join("");
            const ang = Math.round(def.startAngle ?? 0);
            const ofPie = def.ofPie;
            if (ofPie) {
                return `<c:ofPieChart><c:ofPieType val="${ofPie}"/><c:varyColors val="${def.varyColors === false ? 0 : 1}"/>${sers}${dLblsXml(def)}<c:gapWidth val="100"/><c:secondPieSize val="75"/><c:serLines/></c:ofPieChart>`;
            }
            const tag = def.chart3D || def.view3D ? "pie3DChart" : "pieChart";
            return `<c:${tag}><c:varyColors val="${def.varyColors === false ? 0 : 1}"/>${sers}${dLblsXml(def)}${tag === "pieChart" ? `<c:firstSliceAng val="${ang}"/>` : ""}</c:${tag}>`;
        }
        case "doughnut": {
            const sers = series.slice(0, 1).map((s, i) => serXml(def, s, i, "pie")).join("");
            const hole = Math.max(10, Math.min(90, Math.round((def.holeRatio ?? 0.5) * 100)));
            const ang = Math.round(def.startAngle ?? 0);
            return `<c:doughnutChart><c:varyColors val="${def.varyColors === false ? 0 : 1}"/>${sers}${dLblsXml(def)}<c:firstSliceAng val="${ang}"/><c:holeSize val="${hole}"/></c:doughnutChart>`;
        }
        case "scatter": {
            const pts = def.points ?? [];
            const sers = series
                .map((s, i) => scatterSerXml(def, s, i, s.points ?? pts[i] ?? scatterPointsOf(def, s)))
                .join("");
            return `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers}${dLblsXml(def)}${axIdPair()}</c:scatterChart>`;
        }
        case "bubble": {
            const pts = def.points ?? [];
            const sers = series
                .map((s, i) => bubbleSerXml(def, s, i, s.points ?? pts[i] ?? scatterPointsOf(def, s)))
                .join("");
            return `<c:bubbleChart><c:varyColors val="0"/>${sers}${dLblsXml(def)}<c:bubble3D val="0"/>${axIdPair()}</c:bubbleChart>`;
        }
        case "radar": {
            const style = def.radarStyle ?? "marker";
            const sers = series.map((s, i) => serXml(def, s, i, "radar")).join("");
            return `<c:radarChart><c:radarStyle val="${style}"/><c:varyColors val="0"/>${sers}${dLblsXml(def)}${axIdPair()}</c:radarChart>`;
        }
        case "stock": {
            const sers = series.map((s, i) => serXml(def, s, i, "line")).join("");
            return `<c:stockChart>${sers}${dLblsXml(def)}<c:hiLowLines/><c:upDownBars><c:gapWidth val="150"/><c:upBars/><c:downBars/></c:upDownBars>${axIdPair()}</c:stockChart>`;
        }
        case "surface": {
            const sers = series.map((s, i) => serXml(def, s, i, "area")).join("");
            const wire = def.wireframe ? `<c:wireframe val="1"/>` : `<c:wireframe val="0"/>`;
            return `<c:surfaceChart>${wire}${sers}<c:bandFmts/>${axIdTriple()}</c:surfaceChart>`;
        }
        default:
            return "";
    }
}
function plotAxes(def) {
    if (def.type === "pie" || def.type === "doughnut")
        return "";
    if (def.type === "scatter" || def.type === "bubble")
        return scatterAxes(def);
    if (def.type === "surface")
        return surfaceAxes(def);
    return catValAxes(def);
}
function pickAx(def, type, pos) {
    const all = def?.axes ?? [];
    if (pos) {
        const hit = all.find((a) => a.type === type && a.position === pos);
        if (hit)
            return hit;
    }
    return all.find((a) => a.type === type);
}
function scalingXml(ax) {
    const orient = ax?.scaling?.orientation ?? "minMax";
    const log = ax?.scaling?.logBase != null ? `<c:logBase val="${ax.scaling.logBase}"/>` : "";
    const max = ax?.scaling?.max != null ? `<c:max val="${ax.scaling.max}"/>` : "";
    const min = ax?.scaling?.min != null ? `<c:min val="${ax.scaling.min}"/>` : "";
    return `<c:scaling><c:orientation val="${orient}"/>${log}${max}${min}</c:scaling>`;
}
function axTitleXml(ax) {
    if (!ax?.title)
        return "";
    return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${(0, xml_util_1.esc)(ax.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}
function gridXml(ax, fallbackMajor = false, def) {
    const major = ax?.majorGridlines ?? fallbackMajor;
    const minor = !!ax?.minorGridlines;
    const ln = lineSpPrXml(def);
    return (major ? (ln ? `<c:majorGridlines>${ln}</c:majorGridlines>` : `<c:majorGridlines/>`) : "") + (minor ? `<c:minorGridlines/>` : "");
}
function dateAxExtras(ax) {
    if (!ax || ax.type !== "date")
        return "";
    let s = "";
    if (ax.baseTimeUnit)
        s += `<c:baseTimeUnit val="${ax.baseTimeUnit}"/>`;
    if (ax.majorTimeUnit)
        s += `<c:majorTimeUnit val="${ax.majorTimeUnit}"/>`;
    if (ax.minorTimeUnit)
        s += `<c:minorTimeUnit val="${ax.minorTimeUnit}"/>`;
    return s;
}
function catValAxes(def) {
    const cat = pickAx(def, "date") ?? pickAx(def, "cat");
    const val = pickAx(def, "val", "l") ?? pickAx(def, "val");
    const tag = cat?.type === "date" ? "dateAx" : "catAx";
    return (`<c:${tag}><c:axId val="${CAT_AX_ID}"/>${scalingXml(cat)}<c:delete val="${cat?.delete ? 1 : 0}"/><c:axPos val="${cat?.position ?? "b"}"/>${gridXml(cat, false, def)}${axTitleXml(cat)}${lineSpPrXml(def)}<c:crossAx val="${VAL_AX_ID}"/>${dateAxExtras(cat)}</c:${tag}>` +
        `<c:valAx><c:axId val="${VAL_AX_ID}"/>${scalingXml(val)}<c:delete val="${val?.delete ? 1 : 0}"/><c:axPos val="${val?.position ?? "l"}"/>${gridXml(val, true, def)}${axTitleXml(val)}${lineSpPrXml(def)}<c:crossAx val="${CAT_AX_ID}"/></c:valAx>`);
}
function scatterAxes(def) {
    const xAx = pickAx(def, "val", "b");
    const yAx = pickAx(def, "val", "l") ?? (xAx ? def?.axes?.find((a) => a.type === "val" && a !== xAx) : pickAx(def, "val"));
    return (`<c:valAx><c:axId val="${CAT_AX_ID}"/>${scalingXml(xAx)}<c:delete val="${xAx?.delete ? 1 : 0}"/><c:axPos val="${xAx?.position ?? "b"}"/>${gridXml(xAx, false, def)}${axTitleXml(xAx)}${lineSpPrXml(def)}<c:crossAx val="${VAL_AX_ID}"/></c:valAx>` +
        `<c:valAx><c:axId val="${VAL_AX_ID}"/>${scalingXml(yAx)}<c:delete val="${yAx?.delete ? 1 : 0}"/><c:axPos val="${yAx?.position ?? "l"}"/>${gridXml(yAx, true, def)}${axTitleXml(yAx)}${lineSpPrXml(def)}<c:crossAx val="${CAT_AX_ID}"/></c:valAx>`);
}
function surfaceAxes(def) {
    const cat = pickAx(def, "cat");
    const val = pickAx(def, "val", "l") ?? pickAx(def, "val");
    return (`<c:catAx><c:axId val="${CAT_AX_ID}"/>${scalingXml(cat)}<c:delete val="${cat?.delete ? 1 : 0}"/><c:axPos val="${cat?.position ?? "b"}"/>${gridXml(cat, false, def)}${axTitleXml(cat)}${lineSpPrXml(def)}<c:crossAx val="${VAL_AX_ID}"/></c:catAx>` +
        `<c:serAx><c:axId val="${SER_AX_ID}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="${VAL_AX_ID}"/></c:serAx>` +
        `<c:valAx><c:axId val="${VAL_AX_ID}"/>${scalingXml(val)}<c:delete val="${val?.delete ? 1 : 0}"/><c:axPos val="${val?.position ?? "l"}"/>${gridXml(val, true, def)}${axTitleXml(val)}${lineSpPrXml(def)}<c:crossAx val="${CAT_AX_ID}"/></c:valAx>`);
}
// ---- series ---------------------------------------------------------------
function seriesColor(def, s, idx) {
    const raw = s.color ?? def.colors?.[idx] ?? DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
    return (0, xml_util_1.parseColor)(raw).hex;
}
function serXml(def, s, idx, style) {
    const hex = seriesColor(def, s, idx);
    // line / radar 系列的颜色在描边上；bar/area/pie 在填充上。
    const spPr = style === "line" || style === "radar"
        ? `<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:ln></c:spPr>`
        : `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
    // 饼/环图的分片色：perPointColors 或默认调色板逐点着色。
    let dPts = "";
    if (style === "pie") {
        const n = s.values.length;
        for (let i = 0; i < n; i++) {
            const c = s.perPointColors?.[i] || def.colors?.[i] || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
            dPts += `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${(0, xml_util_1.parseColor)(c).hex}"/></a:solidFill></c:spPr></c:dPt>`;
        }
    }
    const marker = style === "line" || style === "radar" ? `<c:marker><c:symbol val="${def.markers || style === "radar" ? "circle" : "none"}"/></c:marker>` : "";
    const smooth = style === "line" ? `<c:smooth val="${def.smooth ? 1 : 0}"/>` : "";
    const explosion = style === "pie" && s.explosion != null && Number.isFinite(s.explosion)
        ? `<c:explosion val="${Math.max(0, Math.round(s.explosion))}"/>`
        : "";
    // CT_*Ser 子元素顺序：idx → order → tx → spPr → explosion → (marker) → dPt → dLbls → trendline → errBars → cat → val → (smooth)
    return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${serNameXml(s, idx)}${spPr}${explosion}${marker}${dPts}${serDLblsXml(s)}${trendlineXml(s)}${errBarsXml(s)}${catXml(def)}${valXml(s.values)}${smooth}</c:ser>`;
}
function scatterSerXml(def, s, idx, points) {
    const hex = seriesColor(def, s, idx);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const spPr = `<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr>`;
    const marker = `<c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr></c:marker>`;
    return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${serNameXml(s, idx)}${spPr}${marker}${serDLblsXml(s)}${trendlineXml(s)}${errBarsXml(s)}<c:xVal>${numLit(xs)}</c:xVal><c:yVal>${numLit(ys)}</c:yVal><c:smooth val="0"/></c:ser>`;
}
function bubbleSerXml(def, s, idx, points) {
    const hex = seriesColor(def, s, idx);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const zs = points.map((p) => p.z ?? 1);
    const spPr = `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
    return `<c:ser><c:idx val="${idx}"/><c:order val="${idx}"/>${serNameXml(s, idx)}${spPr}${serDLblsXml(s)}${trendlineXml(s)}${errBarsXml(s)}<c:xVal>${numLit(xs)}</c:xVal><c:yVal>${numLit(ys)}</c:yVal><c:bubbleSize>${numLit(zs)}</c:bubbleSize><c:bubble3D val="0"/></c:ser>`;
}
function serNameXml(s, idx) {
    const name = s.name ?? `Series ${idx + 1}`;
    return `<c:tx><c:v>${(0, xml_util_1.esc)(name)}</c:v></c:tx>`;
}
function catXml(def) {
    const cats = def.categories ?? [];
    if (!cats.length)
        return "";
    const pts = cats.map((c, i) => `<c:pt idx="${i}"><c:v>${(0, xml_util_1.esc)(c)}</c:v></c:pt>`).join("");
    return `<c:cat><c:strLit><c:ptCount val="${cats.length}"/>${pts}</c:strLit></c:cat>`;
}
function valXml(values) {
    return `<c:val>${numLit(values)}</c:val>`;
}
function numLit(values) {
    const pts = values
        .map((v, i) => `<c:pt idx="${i}"><c:v>${Number.isFinite(v) ? v : 0}</c:v></c:pt>`)
        .join("");
    return `<c:numLit><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts}</c:numLit>`;
}
// ---- data labels ----------------------------------------------------------
function dLblsBody(d, showValuesFallback) {
    const showVal = d?.showVal ?? showValuesFallback;
    if (!d && !showVal)
        return null;
    // CT_DLbls 子序列：showLegendKey → showVal → showCatName → showSerName → showPercent → showBubbleSize → separator
    const flag = (v) => (v ? "1" : "0");
    return (`<c:showLegendKey val="${flag(d?.showLegendKey)}"/>` +
        `<c:showVal val="${flag(showVal)}"/>` +
        `<c:showCatName val="${flag(d?.showCatName)}"/>` +
        `<c:showSerName val="${flag(d?.showSerName)}"/>` +
        `<c:showPercent val="${flag(d?.showPercent)}"/>` +
        `<c:showBubbleSize val="${flag(d?.showBubbleSize)}"/>` +
        (d?.separator ? `<c:separator>${(0, xml_util_1.esc)(d.separator)}</c:separator>` : ""));
}
function dLblsXml(def) {
    const body = dLblsBody(def.dataLabels, def.showValues);
    return body ? `<c:dLbls>${body}</c:dLbls>` : "";
}
function serDLblsXml(s) {
    const body = dLblsBody(s.dataLabels, undefined);
    return body ? `<c:dLbls>${body}</c:dLbls>` : "";
}
function trendlineXml(s) {
    const t = s.trendline;
    if (!t)
        return "";
    const type = t.type || "linear";
    const order = t.order != null && Number.isFinite(t.order) ? `<c:order val="${Math.max(2, Math.round(t.order))}"/>` : "";
    const period = t.period != null && Number.isFinite(t.period) ? `<c:period val="${Math.max(2, Math.round(t.period))}"/>` : "";
    return `<c:trendline><c:trendlineType val="${(0, xml_util_1.esc)(type)}"/>${order}${period}<c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>`;
}
function errBarsXml(s) {
    const e = s.errorBars;
    if (!e)
        return "";
    const barType = e.errBarType || "both";
    const valType = e.errValType || "fixedVal";
    const val = e.val != null && Number.isFinite(e.val) ? `<c:val val="${e.val}"/>` : "";
    return `<c:errBars><c:errDir val="y"/><c:errBarType val="${(0, xml_util_1.esc)(barType)}"/><c:errValType val="${(0, xml_util_1.esc)(valType)}"/><c:noEndCap val="0"/>${val}</c:errBars>`;
}
// ---- axes -----------------------------------------------------------------
function axIdPair() {
    return `<c:axId val="${CAT_AX_ID}"/><c:axId val="${VAL_AX_ID}"/>`;
}
function axIdTriple() {
    return `<c:axId val="${CAT_AX_ID}"/><c:axId val="${SER_AX_ID}"/><c:axId val="${VAL_AX_ID}"/>`;
}
