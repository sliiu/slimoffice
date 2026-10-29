// ECMA-376 Part 4 §4 chartEx (cx:chartSpace) — PPT 2016+ 引入的新图表家族：
// sunburst / treemap / waterfall / funnel / pareto / histogram / boxWhisker / region 等。
// 这些图表的部件根元素是 cx:chartSpace（命名空间 cx），其内部用 cx:plotArea / cx:series /
// cx:plotSurface / cx:strDim / cx:numDim 描述数据，不再用 plotArea+ser 那套。
import type { ChartDataLabels, ChartDef, ChartSeries } from "@ppt/core";
import { attr, findAllByLocalName, findByLocalName, type XmlNode } from "./xml";
import type { ThemeData } from "./theme";
import { resolveColor } from "./theme";
import { boolish } from "./units";
import type { PptxArchive } from "./zip";
import { loadXmlPart } from "./parts";

export interface ChartExCtx {
  theme?: ThemeData;
}

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
const LAYOUT_MAP: Record<string, ChartDef["type"]> = {
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

export function parseChartEx(
  archive: PptxArchive,
  chartPath: string,
  ctx: ChartExCtx,
): ChartDef | null {
  const xml = loadXmlPart(archive, chartPath);
  if (!xml) return null;
  // 兼容 cx: 与 cx14: 等命名空间，stripNs 已经统一去前缀。
  const chartSpace = findByLocalName(xml, "chartSpace");
  if (!chartSpace) return null;
  const chart = findByLocalName(chartSpace, "chart");
  const plotArea = findByLocalName(chart, "plotArea");
  if (!plotArea) return null;

  const title = readChartExTitle(findByLocalName(chart, "title"));
  const legend = !!findByLocalName(chart, "legend");
  const dataEl = findByLocalName(chartSpace, "chartData");

  // chartEx 的每个 plotArea/plotAreaRegion/series 上有 layoutId；多 series 时取首个。
  const region = findByLocalName(plotArea, "plotAreaRegion");
  const seriesList = findAllByLocalName(region ?? plotArea, "series");
  const firstLayoutId =
    attr(seriesList[0], "layoutId") ?? attr(plotArea, "layoutId") ?? "unknown";
  const type = LAYOUT_MAP[firstLayoutId] ?? "unknown";

  // 数据维度通过 plotArea/plotAreaRegion/series/dataPt(numCache) + chartData/data 中的
  // strDim/numDim 解析。这里做一个统一通道：把每个 series 的数值列与分类列收集出来。
  const series: ChartSeries[] = [];
  const categories = readCategoriesFromChartData(dataEl);
  for (let i = 0; i < seriesList.length; i++) {
    const ser = seriesList[i]!;
    const name = readSeriesName(ser);
    const dataIdRef = attr(findByLocalName(ser, "tx"), "dataId");
    void dataIdRef;
    const values = readSeriesValues(ser, dataEl);
    const color = readSpFill(findByLocalName(ser, "spPr"), ctx);
    const s: ChartSeries = { name: name ?? `Series ${i + 1}`, values };
    if (color) s.color = color;
    const dLbls = readDataLabels(findByLocalName(ser, "dataLabels"));
    if (dLbls) s.dataLabels = dLbls;
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
    const binCountEl = findByLocalName(seriesList[0], "binCount");
    const binSizeEl = findByLocalName(seriesList[0], "binSize");
    const binCount = binCountEl ? Number(attr(binCountEl, "val")) : undefined;
    const binSize = binSizeEl ? Number(attr(binSizeEl, "val")) : undefined;
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
  return { type, ...base } as ChartDef;
}

function readChartExTitle(titleEl: XmlNode | undefined): string | undefined {
  if (!titleEl) return undefined;
  const tx = findByLocalName(titleEl, "tx");
  const rich = findByLocalName(tx, "rich");
  if (!rich) return undefined;
  const parts: string[] = [];
  for (const p of findAllByLocalName(rich, "p")) {
    for (const r of findAllByLocalName(p, "r")) {
      const t = findByLocalName(r, "t");
      const text = typeof t === "string" ? t : (t as { "#text"?: string })?.["#text"];
      if (text) parts.push(String(text));
    }
  }
  return parts.join("") || undefined;
}

function readSeriesName(ser: XmlNode): string | undefined {
  const tx = findByLocalName(ser, "tx");
  const txData = findByLocalName(tx, "txData");
  const v = findByLocalName(txData, "v");
  if (v) return readText(v);
  return undefined;
}

// chartEx 数据有两种位置：series 内联 numCache/strCache，或在外层 chartData/data 内。
function readSeriesValues(ser: XmlNode, dataEl: XmlNode | undefined): number[] {
  const dataIdEl = findByLocalName(ser, "dataId");
  const dataId = dataIdEl ? Number(attr(dataIdEl, "val")) : undefined;
  const numDim =
    findByLocalName(ser, "numDim") ??
    findByLocalName(findByLocalName(ser, "data"), "numDim");
  if (numDim) return readNumLevel(numDim);
  if (dataEl && dataId !== undefined && Number.isFinite(dataId)) {
    for (const d of findAllByLocalName(dataEl, "data")) {
      if (Number(attr(d, "id")) !== dataId) continue;
      const nd = findByLocalName(d, "numDim");
      if (nd) return readNumLevel(nd);
    }
  }
  if (dataEl) {
    for (const d of findAllByLocalName(dataEl, "data")) {
      const nd = findByLocalName(d, "numDim");
      if (nd) return readNumLevel(nd);
    }
  }
  return [];
}

function readCategoriesFromChartData(dataEl: XmlNode | undefined): string[] {
  if (!dataEl) return [];
  const data = findAllByLocalName(dataEl, "data");
  for (const d of data) {
    const sd = findByLocalName(d, "strDim");
    if (sd) return readStrLevel(sd);
  }
  return [];
}

function readNumLevel(numDim: XmlNode): number[] {
  const lvl = findByLocalName(numDim, "lvl") ?? numDim;
  const out: number[] = [];
  for (const pt of findAllByLocalName(lvl, "pt")) {
    const idx = Number(attr(pt, "idx") ?? out.length);
    while (out.length < idx) out.push(0);
    const v = findByLocalName(pt, "v");
    const n = Number(v ? readText(v) : readText(pt));
    out.push(Number.isFinite(n) ? n : 0);
  }
  return out;
}

function readStrLevel(strDim: XmlNode): string[] {
  const lvl = findByLocalName(strDim, "lvl") ?? strDim;
  const out: string[] = [];
  for (const pt of findAllByLocalName(lvl, "pt")) {
    const idx = Number(attr(pt, "idx") ?? out.length);
    while (out.length < idx) out.push("");
    const v = findByLocalName(pt, "v");
    out.push(v ? readText(v) : readText(pt));
  }
  return out;
}

function readSpFill(spPr: XmlNode | undefined, ctx: ChartExCtx): string | undefined {
  if (!spPr) return undefined;
  const solid = findByLocalName(spPr, "solidFill");
  if (!solid) return undefined;
  return resolveColor(solid, ctx.theme);
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
    if (!s.color) s.color = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
    i++;
  }
}

function readDataLabels(dLblsEl: XmlNode | undefined): ChartDataLabels | undefined {
  if (!dLblsEl) return undefined;
  const out: ChartDataLabels = {};
  const visibility = findByLocalName(dLblsEl, "visibility");
  if (visibility) {
    const sv = boolish(attr(visibility, "value"));
    if (sv !== undefined) out.showVal = sv;
    const sc = boolish(attr(visibility, "categoryName"));
    if (sc !== undefined) out.showCatName = sc;
    const ss = boolish(attr(visibility, "seriesName"));
    if (ss !== undefined) out.showSerName = ss;
  }
  const sep = attr(dLblsEl, "separator");
  if (sep) out.separator = sep;
  const pos = attr(findByLocalName(dLblsEl, "dataLabel"), "pos");
  if (pos) out.position = pos;
  return Object.keys(out).length ? out : undefined;
}
