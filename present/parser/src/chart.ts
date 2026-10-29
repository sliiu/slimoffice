import type {
  ChartAxis,
  ChartDataLabels,
  ChartDef,
  ChartSeries,
  ChartView3D,
  ClassicChartType,
  RadarChartDef,
} from "@ppt/core";
import { findAllByLocalName, findByLocalName, attr, type XmlNode } from "./xml";
import type { ThemeData } from "./theme";
import { resolveColor } from "./theme";
import type { PptxArchive } from "./zip";
import { loadXmlPart } from "./parts";
import { boolish } from "./units";

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

export interface ChartCtx {
  theme?: ThemeData;
}

export function parseChart(archive: PptxArchive, chartPath: string, ctx: ChartCtx): ChartDef | null {
  const xml = loadXmlPart(archive, chartPath);
  if (!xml) return null;
  const chartSpace = findByLocalName(xml, "chartSpace");
  const chartEl = findByLocalName(chartSpace, "chart");
  const plotArea = findByLocalName(chartEl, "plotArea");
  if (!plotArea) return null;

  const title = readTitle(findByLocalName(chartEl, "title"));
  const legendEl = findByLocalName(chartEl, "legend");
  const legend = !!legendEl;
  const axes = readPlotAreaAxes(plotArea);

  const view3D = readView3D(findByLocalName(chartEl, "view3D"));
  const is3DPlot = !!(
    findByLocalName(plotArea, "bar3DChart") ||
    findByLocalName(plotArea, "line3DChart") ||
    findByLocalName(plotArea, "pie3DChart") ||
    findByLocalName(plotArea, "area3DChart") ||
    findByLocalName(plotArea, "surface3DChart")
  );

  // ECMA-376 §21.2.2.216 chartSpace/txPr: the chart-level text default every label inherits.
  const chartText = readTextProps(findByLocalName(chartSpace, "txPr"), ctx);
  const axisLine = readAxisLineColor(plotArea, ctx);

  const decorate = (def: ChartDef | null, typeNode: XmlNode | undefined): ChartDef | null => {
    if (!def) return def;
    if (axes) (def as ChartDef & { axes?: ChartAxis[] }).axes = axes;
    if (typeNode) {
      const vc = boolish(attr(findByLocalName(typeNode, "varyColors"), "val"));
      if (vc !== undefined) (def as ChartDef & { varyColors?: boolean }).varyColors = vc;
      const dLbls = readDataLabels(findByLocalName(typeNode, "dLbls"));
      if (dLbls) (def as ChartDef & { dataLabels?: ChartDataLabels }).dataLabels = dLbls;
    }
    if (is3DPlot) (def as ChartDef & { chart3D?: boolean }).chart3D = true;
    if (view3D) (def as ChartDef & { view3D?: typeof view3D }).view3D = view3D;
    if (chartText.color) def.textColor = chartText.color;
    if (chartText.size) def.textSize = chartText.size;
    if (axisLine) def.lineColor = axisLine;
    return def;
  };

  type PlotHit = { def: ChartDef; node: XmlNode };
  const plots: PlotHit[] = [];
  const push = (node: XmlNode | undefined, def: ChartDef | null): void => {
    if (node && def) plots.push({ def, node });
  };

  for (const n of [
    ...findAllByLocalName(plotArea, "barChart"),
    ...findAllByLocalName(plotArea, "bar3DChart"),
  ]) {
    push(n, parseBarLike(n, ctx, title, legend));
  }
  for (const n of [
    ...findAllByLocalName(plotArea, "lineChart"),
    ...findAllByLocalName(plotArea, "line3DChart"),
  ]) {
    push(n, parseLine(n, ctx, title, legend));
  }
  for (const n of [
    ...findAllByLocalName(plotArea, "pieChart"),
    ...findAllByLocalName(plotArea, "pie3DChart"),
    ...findAllByLocalName(plotArea, "ofPieChart"),
  ]) {
    push(n, parsePieLike(n, ctx, "pie", title, legend));
  }
  for (const n of findAllByLocalName(plotArea, "doughnutChart")) {
    push(n, parsePieLike(n, ctx, "doughnut", title, legend));
  }
  for (const n of [
    ...findAllByLocalName(plotArea, "areaChart"),
    ...findAllByLocalName(plotArea, "area3DChart"),
  ]) {
    push(n, parseArea(n, ctx, title, legend));
  }
  for (const n of findAllByLocalName(plotArea, "scatterChart")) {
    push(n, parseScatter(n, ctx, title, legend));
  }
  for (const n of findAllByLocalName(plotArea, "bubbleChart")) {
    push(n, parseBubble(n, ctx, title, legend));
  }
  for (const n of findAllByLocalName(plotArea, "radarChart")) {
    push(n, parseRadar(n, ctx, title, legend));
  }
  for (const n of findAllByLocalName(plotArea, "stockChart")) {
    push(n, parseStock(n, ctx, title, legend));
  }
  for (const n of [
    ...findAllByLocalName(plotArea, "surfaceChart"),
    ...findAllByLocalName(plotArea, "surface3DChart"),
  ]) {
    push(n, parseSurface(n, ctx, title, legend));
  }

  if (plots.length === 0) return null;
  if (plots.length === 1) return decorate(plots[0]!.def, plots[0]!.node);

  // 组合图：plotArea 里多个 c:*Chart 并存（柱+折线，或柱+散点）。
  const CAT_COMBO = new Set<ClassicChartType>(["bar", "column", "line", "area", "radar", "stock"]);
  const XY_COMBO = new Set<ClassicChartType>(["scatter", "bubble"]);
  const comboPlots = plots.filter(
    (p) => CAT_COMBO.has(p.def.type as ClassicChartType) || XY_COMBO.has(p.def.type as ClassicChartType),
  );
  if (comboPlots.length >= 2) {
    const primary = comboPlots.find((p) => CAT_COMBO.has(p.def.type as ClassicChartType)) ?? comboPlots[0]!;
    const series: ChartSeries[] = [];
    for (const p of comboPlots) {
      const ty = p.def.type as ClassicChartType;
      if (ty === "scatter" || ty === "bubble") {
        const pts = (p.def as { points?: Array<Array<{ x: number; y: number; z?: number }>> }).points ?? [];
        for (let i = 0; i < p.def.series.length; i++) {
          series.push({ ...p.def.series[i]!, chartType: ty, points: pts[i] });
        }
      } else {
        for (const s of p.def.series) {
          series.push({ ...s, chartType: ty });
        }
      }
    }
    return decorate({ ...primary.def, series }, primary.node);
  }
  return decorate(plots[0]!.def, plots[0]!.node);
}

function readTitle(titleEl: XmlNode | undefined): string | undefined {
  if (!titleEl) return undefined;
  const tx = findByLocalName(titleEl, "tx");
  const rich = findByLocalName(tx, "rich");
  if (!rich) return undefined;
  const ps = findAllByLocalName(rich, "p");
  const parts: string[] = [];
  for (const p of ps) {
    for (const r of findAllByLocalName(p, "r")) {
      const t = findByLocalName(r, "t");
      const text = typeof t === "string" ? t : (t as { "#text"?: string })?.["#text"];
      if (text) parts.push(String(text));
    }
  }
  return parts.join("") || undefined;
}

function readView3D(el: XmlNode | undefined): ChartView3D | undefined {
  if (!el) return undefined;
  const num = (name: string): number | undefined => {
    const v = Number(attr(findByLocalName(el, name), "val"));
    return Number.isFinite(v) ? v : undefined;
  };
  const out: ChartView3D = {};
  const rotX = num("rotX");
  const rotY = num("rotY");
  const perspective = num("perspective");
  const depthPercent = num("depthPercent");
  const rAngAx = boolish(attr(findByLocalName(el, "rAngAx"), "val"));
  if (rotX !== undefined) out.rotX = rotX;
  if (rotY !== undefined) out.rotY = rotY;
  if (perspective !== undefined) out.perspective = perspective;
  if (depthPercent !== undefined) out.depthPercent = depthPercent;
  if (rAngAx !== undefined) out.rAngAx = rAngAx;
  return Object.keys(out).length ? out : undefined;
}

function readSeriesShared(ser: XmlNode, ctx: ChartCtx, idxFallback: number): ChartSeries {
  const name = readSerName(ser);
  const values = readValues(findByLocalName(ser, "val"));
  const color = readShapeFill(findByLocalName(ser, "spPr"), ctx);
  const s: ChartSeries = { name, values };
  if (color) s.color = color;
  if (!name) s.name = `Series ${idxFallback + 1}`;
  attachSerMeta(ser, s, ctx);
  return s;
}

function attachSerMeta(ser: XmlNode, s: ChartSeries, ctx: ChartCtx): void {
  const color = s.color ?? readShapeFill(findByLocalName(ser, "spPr"), ctx);
  if (color && !s.color) s.color = color;
  // 数据点级颜色（从 dPt 列表填充 perPointColors，索引保留位置）。
  const dPts = findAllByLocalName(ser, "dPt");
  if (dPts.length) {
    const palette: string[] = [];
    for (const dPt of dPts) {
      const idx = Number(attr(findByLocalName(dPt, "idx"), "val") ?? palette.length);
      const c = readShapeFill(findByLocalName(dPt, "spPr"), ctx);
      while (palette.length < idx) palette.push("");
      palette.push(c ?? "");
    }
    if (palette.some(Boolean)) s.perPointColors = palette;
  }
  const dLbls = readDataLabels(findByLocalName(ser, "dLbls"));
  if (dLbls) s.dataLabels = dLbls;
  const trend = findByLocalName(ser, "trendline");
  if (trend) {
    const tl: NonNullable<ChartSeries["trendline"]> = {
      type: attr(findByLocalName(trend, "trendlineType"), "val") ?? "linear",
    };
    const order = attr(findByLocalName(trend, "order"), "val");
    if (order) tl.order = Number(order);
    const period = attr(findByLocalName(trend, "period"), "val");
    if (period) tl.period = Number(period);
    s.trendline = tl;
  }
  const errBar = findByLocalName(ser, "errBars");
  if (errBar) {
    s.errorBars = {
      errBarType: attr(findByLocalName(errBar, "errBarType"), "val"),
      errValType: attr(findByLocalName(errBar, "errValType"), "val"),
      val: numAttrVal(findByLocalName(errBar, "val")),
    };
  }
  const exp = numAttrVal(findByLocalName(ser, "explosion"));
  if (exp !== undefined) s.explosion = exp;
}

function numAttrVal(el: XmlNode | undefined): number | undefined {
  const v = attr(el, "val");
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function readDataLabels(dLblsEl: XmlNode | undefined): ChartDataLabels | undefined {
  if (!dLblsEl) return undefined;
  const out: ChartDataLabels = {};
  const sv = boolish(attr(findByLocalName(dLblsEl, "showVal"), "val"));
  if (sv !== undefined) out.showVal = sv;
  const sc = boolish(attr(findByLocalName(dLblsEl, "showCatName"), "val"));
  if (sc !== undefined) out.showCatName = sc;
  const ss = boolish(attr(findByLocalName(dLblsEl, "showSerName"), "val"));
  if (ss !== undefined) out.showSerName = ss;
  const sp = boolish(attr(findByLocalName(dLblsEl, "showPercent"), "val"));
  if (sp !== undefined) out.showPercent = sp;
  const sl = boolish(attr(findByLocalName(dLblsEl, "showLegendKey"), "val"));
  if (sl !== undefined) out.showLegendKey = sl;
  const sb = boolish(attr(findByLocalName(dLblsEl, "showBubbleSize"), "val"));
  if (sb !== undefined) out.showBubbleSize = sb;
  const sep = findByLocalName(dLblsEl, "separator");
  if (sep) {
    const t = readText(sep);
    if (t) out.separator = t;
  }
  const pos = attr(findByLocalName(dLblsEl, "dLblPos"), "val");
  if (pos) out.position = pos;
  const numFmt = attr(findByLocalName(dLblsEl, "numFmt"), "formatCode");
  if (numFmt) out.numFmt = numFmt;
  return Object.keys(out).length ? out : undefined;
}

function readAxis(axEl: XmlNode, type: "cat" | "val" | "date"): ChartAxis {
  const ax: ChartAxis = { type };
  ax.id = attr(findByLocalName(axEl, "axId"), "val");
  const del = boolish(attr(findByLocalName(axEl, "delete"), "val"));
  if (del !== undefined) ax.delete = del;
  const pos = attr(findByLocalName(axEl, "axPos"), "val") as ChartAxis["position"];
  if (pos) ax.position = pos;
  const title = readTitle(findByLocalName(axEl, "title"));
  if (title) ax.title = title;
  const scaling = findByLocalName(axEl, "scaling");
  if (scaling) {
    const sc: NonNullable<ChartAxis["scaling"]> = {};
    const orient = attr(findByLocalName(scaling, "orientation"), "val") as
      | "minMax"
      | "maxMin"
      | undefined;
    if (orient) sc.orientation = orient;
    const min = numAttrVal(findByLocalName(scaling, "min"));
    if (min !== undefined) sc.min = min;
    const max = numAttrVal(findByLocalName(scaling, "max"));
    if (max !== undefined) sc.max = max;
    const log = numAttrVal(findByLocalName(scaling, "logBase"));
    if (log !== undefined) sc.logBase = log;
    if (Object.keys(sc).length) ax.scaling = sc;
  }
  const mu = numAttrVal(findByLocalName(axEl, "majorUnit"));
  if (mu !== undefined) ax.majorUnit = mu;
  const mi = numAttrVal(findByLocalName(axEl, "minorUnit"));
  if (mi !== undefined) ax.minorUnit = mi;
  const mt = attr(findByLocalName(axEl, "majorTickMark"), "val") as ChartAxis["majorTickMark"];
  if (mt) ax.majorTickMark = mt;
  const mit = attr(findByLocalName(axEl, "minorTickMark"), "val") as ChartAxis["minorTickMark"];
  if (mit) ax.minorTickMark = mit;
  if (findByLocalName(axEl, "majorGridlines")) ax.majorGridlines = true;
  if (findByLocalName(axEl, "minorGridlines")) ax.minorGridlines = true;
  const numFmt = attr(findByLocalName(axEl, "numFmt"), "formatCode");
  if (numFmt) ax.numFmt = numFmt;
  const crossesEl = findByLocalName(axEl, "crosses");
  const crossesAt = findByLocalName(axEl, "crossesAt");
  if (crossesAt) {
    const v = numAttrVal(crossesAt);
    if (v !== undefined) ax.crosses = v;
  } else if (crossesEl) {
    const cv = attr(crossesEl, "val");
    if (cv === "autoZero" || cv === "min" || cv === "max") ax.crosses = cv;
  }
  if (type === "date") {
    const bt = attr(findByLocalName(axEl, "baseTimeUnit"), "val") as ChartAxis["baseTimeUnit"];
    if (bt) ax.baseTimeUnit = bt;
    const mtu = attr(findByLocalName(axEl, "majorTimeUnit"), "val") as ChartAxis["majorTimeUnit"];
    if (mtu) ax.majorTimeUnit = mtu;
    const mintu = attr(findByLocalName(axEl, "minorTimeUnit"), "val") as ChartAxis["minorTimeUnit"];
    if (mintu) ax.minorTimeUnit = mintu;
  }
  return ax;
}

function readPlotAreaAxes(plotArea: XmlNode | undefined): ChartAxis[] | undefined {
  if (!plotArea) return undefined;
  const out: ChartAxis[] = [];
  for (const ax of findAllByLocalName(plotArea, "catAx")) out.push(readAxis(ax, "cat"));
  for (const ax of findAllByLocalName(plotArea, "valAx")) out.push(readAxis(ax, "val"));
  for (const ax of findAllByLocalName(plotArea, "dateAx")) out.push(readAxis(ax, "date"));
  return out.length ? out : undefined;
}

function readSerName(ser: XmlNode): string | undefined {
  const tx = findByLocalName(ser, "tx");
  const strRef = findByLocalName(tx, "strRef");
  if (strRef) {
    const cache = findByLocalName(strRef, "strCache");
    const pts = findAllByLocalName(cache, "pt");
    if (pts[0]) {
      const v = findByLocalName(pts[0], "v");
      return readText(v);
    }
  }
  const v = findByLocalName(tx, "v");
  return v ? readText(v) : undefined;
}

function readValues(valEl: XmlNode | undefined): number[] {
  if (!valEl) return [];
  const numRef = findByLocalName(valEl, "numRef");
  const numLit = findByLocalName(valEl, "numLit");
  const src = numRef ? findByLocalName(numRef, "numCache") : numLit;
  if (!src) return [];
  const pts = findAllByLocalName(src, "pt");
  const out: number[] = [];
  for (const pt of pts) {
    const idx = Number(attr(pt, "idx") ?? out.length);
    const v = findByLocalName(pt, "v");
    const n = Number(readText(v));
    while (out.length < idx) out.push(0);
    out.push(Number.isFinite(n) ? n : 0);
  }
  return out;
}

function readCategoryStrings(catEl: XmlNode | undefined): string[] {
  if (!catEl) return [];
  const strRef = findByLocalName(catEl, "strRef");
  const strLit = findByLocalName(catEl, "strLit");
  const numRef = findByLocalName(catEl, "numRef");
  const numLit = findByLocalName(catEl, "numLit");
  const src =
    (strRef && findByLocalName(strRef, "strCache")) ||
    (numRef && findByLocalName(numRef, "numCache")) ||
    strLit ||
    numLit;
  if (!src) return [];
  const pts = findAllByLocalName(src, "pt");
  const out: string[] = [];
  for (const pt of pts) {
    const idx = Number(attr(pt, "idx") ?? out.length);
    const v = findByLocalName(pt, "v");
    while (out.length < idx) out.push("");
    out.push(readText(v));
  }
  return out;
}

function readShapeFill(spPr: XmlNode | undefined, ctx: ChartCtx): string | undefined {
  if (!spPr) return undefined;
  const solid = findByLocalName(spPr, "solidFill");
  if (!solid) return undefined;
  return resolveColor(solid, ctx.theme);
}

/** txPr → default run colour / size: a:p/a:pPr/a:defRPr (sz in hundredths of a point → px). */
function readTextProps(txPr: XmlNode | undefined, ctx: ChartCtx): { color?: string; size?: number } {
  if (!txPr) return {};
  const p = findByLocalName(txPr, "p");
  const pPr = findByLocalName(p, "pPr");
  const defRPr = findByLocalName(pPr, "defRPr") ?? findByLocalName(txPr, "defRPr");
  if (!defRPr) return {};
  const out: { color?: string; size?: number } = {};
  const solid = findByLocalName(defRPr, "solidFill");
  const color = solid ? resolveColor(solid, ctx.theme) : undefined;
  if (color) out.color = color;
  const sz = Number(attr(defRPr, "sz"));
  if (Number.isFinite(sz) && sz > 0) out.size = Math.round((sz / 100) * (96 / 72));
  return out;
}

/** First explicit axis / gridline stroke in the plot area (catAx · valAx · dateAx spPr/ln, majorGridlines spPr/ln). */
function readAxisLineColor(plotArea: XmlNode, ctx: ChartCtx): string | undefined {
  for (const ax of [...findAllByLocalName(plotArea, "valAx"), ...findAllByLocalName(plotArea, "catAx"), ...findAllByLocalName(plotArea, "dateAx")]) {
    for (const holder of [findByLocalName(ax, "majorGridlines"), ax]) {
      const ln = findByLocalName(findByLocalName(holder, "spPr"), "ln");
      const solid = findByLocalName(ln, "solidFill");
      const color = solid ? resolveColor(solid, ctx.theme) : undefined;
      if (color) return color;
    }
  }
  return undefined;
}

function readText(n: XmlNode | undefined): string {
  if (!n) return "";
  if (typeof n === "string") return n;
  const t = (n as { "#text"?: unknown })["#text"];
  return t === undefined || t === null ? "" : String(t);
}

function ensurePalette(series: ChartSeries[]): void {
  let i = 0;
  for (const s of series) {
    if (!s.color) {
      s.color = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
    }
    i++;
  }
}

function parseBarLike(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): ChartDef {
  const dir = attr(findByLocalName(node, "barDir"), "val");
  const grouping = attr(findByLocalName(node, "grouping"), "val");
  const sers = findAllByLocalName(node, "ser");
  const series: ChartSeries[] = sers.map((s, i) => readSeriesShared(s, ctx, i));
  let categories: string[] = [];
  for (const s of sers) {
    const cat = findByLocalName(s, "cat");
    const list = readCategoryStrings(cat);
    if (list.length > categories.length) categories = list;
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

function parseLine(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): ChartDef {
  const sers = findAllByLocalName(node, "ser");
  const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
  let categories: string[] = [];
  for (const s of sers) {
    const list = readCategoryStrings(findByLocalName(s, "cat"));
    if (list.length > categories.length) categories = list;
  }
  ensurePalette(series);
  const smooth = boolish(attr(findByLocalName(sers[0], "smooth"), "val"));
  const chartMarker = boolish(attr(findByLocalName(node, "marker"), "val"));
  const serMarkers = sers.some((ser) => {
    const m = findByLocalName(ser, "marker");
    const sym = attr(findByLocalName(m, "symbol"), "val");
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

function parsePieLike(node: XmlNode, ctx: ChartCtx, type: "pie" | "doughnut", title: string | undefined, legend: boolean): ChartDef {
  const sers = findAllByLocalName(node, "ser");
  const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
  let categories: string[] = [];
  for (const s of sers) {
    const list = readCategoryStrings(findByLocalName(s, "cat"));
    if (list.length > categories.length) categories = list;
    const dPts = findAllByLocalName(s, "dPt");
    if (dPts.length > 0 && series[sers.indexOf(s)]) {
      const palette: string[] = [];
      for (const dPt of dPts) {
        const c = readShapeFill(findByLocalName(dPt, "spPr"), ctx);
        if (c) palette.push(c);
      }
      if (palette.length > 0) {
        const ser = series[sers.indexOf(s)]!;
        ser.color = palette[0] ?? ser.color;
        (ser as ChartSeries & { perSliceColors?: string[] }).perSliceColors = palette;
      }
    }
  }
  ensurePalette(series);
  const holeSize = Number(attr(findByLocalName(node, "holeSize"), "val") ?? "0");
  const startAng = Number(attr(findByLocalName(node, "firstSliceAng"), "val") ?? "0");
  const ofPieType = attr(findByLocalName(node, "ofPieType"), "val");
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

function parseArea(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): ChartDef {
  const grouping = attr(findByLocalName(node, "grouping"), "val");
  const sers = findAllByLocalName(node, "ser");
  const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
  let categories: string[] = [];
  for (const s of sers) {
    const list = readCategoryStrings(findByLocalName(s, "cat"));
    if (list.length > categories.length) categories = list;
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

function parseScatter(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): ChartDef {
  const sers = findAllByLocalName(node, "ser");
  const series: ChartSeries[] = [];
  const points: Array<Array<{ x: number; y: number }>> = [];
  for (let i = 0; i < sers.length; i++) {
    const s = sers[i]!;
    const name = readSerName(s);
    const color = readShapeFill(findByLocalName(s, "spPr"), ctx);
    const xs = readValues(findByLocalName(s, "xVal"));
    const ys = readValues(findByLocalName(s, "yVal"));
    const pts: Array<{ x: number; y: number }> = [];
    const n = Math.min(xs.length, ys.length);
    for (let k = 0; k < n; k++) pts.push({ x: xs[k]!, y: ys[k]! });
    points.push(pts);
    const ser: ChartSeries = { name: name ?? `Series ${i + 1}`, values: ys, color };
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

function parseBubble(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): ChartDef {
  const sers = findAllByLocalName(node, "ser");
  const series: ChartSeries[] = [];
  const points: Array<Array<{ x: number; y: number; z?: number }>> = [];
  for (let i = 0; i < sers.length; i++) {
    const s = sers[i]!;
    const name = readSerName(s);
    const color = readShapeFill(findByLocalName(s, "spPr"), ctx);
    const xs = readValues(findByLocalName(s, "xVal"));
    const ys = readValues(findByLocalName(s, "yVal"));
    const zs = readValues(findByLocalName(s, "bubbleSize"));
    const pts: Array<{ x: number; y: number; z?: number }> = [];
    const n = Math.min(xs.length, ys.length);
    for (let k = 0; k < n; k++) {
      const z = zs[k];
      pts.push(z !== undefined ? { x: xs[k]!, y: ys[k]!, z } : { x: xs[k]!, y: ys[k]! });
    }
    points.push(pts);
    const ser: ChartSeries = { name: name ?? `Series ${i + 1}`, values: ys, color };
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

function parseCategorySeries(
  node: XmlNode,
  ctx: ChartCtx,
): { series: ChartSeries[]; categories: string[] } {
  const sers = findAllByLocalName(node, "ser");
  const series = sers.map((s, i) => readSeriesShared(s, ctx, i));
  let categories: string[] = [];
  for (const s of sers) {
    const list = readCategoryStrings(findByLocalName(s, "cat"));
    if (list.length > categories.length) categories = list;
  }
  ensurePalette(series);
  return { series, categories };
}

function parseRadar(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): RadarChartDef {
  const { series, categories } = parseCategorySeries(node, ctx);
  const style = attr(findByLocalName(node, "radarStyle"), "val");
  const radarStyle =
    style === "filled" || style === "marker" || style === "standard" ? style : "marker";
  return {
    type: "radar",
    title,
    categories,
    series,
    legend,
    radarStyle,
  };
}

function parseStock(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): ChartDef {
  const { series, categories } = parseCategorySeries(node, ctx);
  return {
    type: "stock",
    title,
    categories,
    series,
    legend,
  };
}

function parseSurface(node: XmlNode, ctx: ChartCtx, title: string | undefined, legend: boolean): ChartDef {
  const { series, categories } = parseCategorySeries(node, ctx);
  const wireframe = boolish(attr(findByLocalName(node, "wireframe"), "val")) ?? false;
  return {
    type: "surface",
    title,
    categories,
    series,
    legend,
    wireframe,
  };
}
