// cx:chartSpace 部件渲染（ECMA-376 Part 4 §4 chartEx）。
//
// PowerPoint 2016+ 现代图表（sunburst / treemap / waterfall / funnel 等）使用
// chartEx 命名空间，与经典 c:chart 部件不同：
//   - Content-Type: application/vnd.ms-office.chartex+xml
//   - Relationship: http://schemas.microsoft.com/office/2014/relationships/chartEx
//   - graphicData uri: http://schemas.microsoft.com/office/drawing/2014/chartex
//
// 本模块按 ChartDef 生成字面量 strDim/numDim（与经典 chart 相同策略），
// 可被 packages/parser/src/chart-ex.ts 读回。

import type { ChartDef, ChartSeries } from "@ppt/core";
import { esc, xmlHeader } from "./xml-util";

const CHART_EX_TYPES = new Set<ChartDef["type"]>([
  "sunburst",
  "treemap",
  "waterfall",
  "funnel",
  "pareto",
  "histogram",
  "boxWhisker",
  "region",
  "unknown",
]);

const LAYOUT_ID: Partial<Record<ChartDef["type"], string>> = {
  sunburst: "sunburst",
  treemap: "treemap",
  waterfall: "waterfall",
  funnel: "funnel",
  pareto: "paretoLine",
  histogram: "histogram",
  boxWhisker: "boxWhisker",
  region: "regionMap",
};

export const CHART_EX_REL_TYPE = "http://schemas.microsoft.com/office/2014/relationships/chartEx";
export const CHART_EX_CONTENT_TYPE = "application/vnd.ms-office.chartex+xml";
export const CHART_EX_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2014/chartex";

export function chartExExportSupported(def: ChartDef): boolean {
  return CHART_EX_TYPES.has(def.type);
}

function layoutIdFor(def: ChartDef): string {
  if (def.type === "unknown") {
    const raw = (def as Extract<ChartDef, { type: "unknown" }>).rawType?.trim();
    return raw || "unknown";
  }
  return LAYOUT_ID[def.type] ?? def.type;
}

function newGuid(): string {
  const raw =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().toUpperCase()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}-${Math.random()
          .toString(16)
          .slice(2, 6)}-${Math.random().toString(16).slice(2, 6)}-${Math.random().toString(16).slice(2, 14)}`;
  return `{${raw}}`;
}

function normalizeCategories(def: ChartDef): string[] {
  if (def.categories?.length) return [...def.categories];
  const maxLen = Math.max(0, ...def.series.map((s) => s.values.length));
  return Array.from({ length: Math.max(1, maxLen) }, (_, i) => `Cat ${i + 1}`);
}

function normalizeSeries(def: ChartDef, catLen: number): ChartSeries[] {
  const src = def.series.length > 0 ? def.series : [{ name: "Series 1", values: [] }];
  return src.map((s, si) => ({
    name: s.name ?? `Series ${si + 1}`,
    values: Array.from({ length: catLen }, (_, i) => {
      const v = s.values[i];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    }),
    ...(s.color ? { color: s.color } : {}),
  }));
}

function strDimXml(categories: string[]): string {
  const pts = categories
    .map((c, i) => `<cx:pt idx="${i}"><cx:v>${esc(c)}</cx:v></cx:pt>`)
    .join("");
  return `<cx:strDim type="cat"><cx:lvl ptCount="${categories.length}">${pts}</cx:lvl></cx:strDim>`;
}

function numDimXml(values: number[]): string {
  const pts = values
    .map((v, i) => `<cx:pt idx="${i}"><cx:v>${Number.isFinite(v) ? v : 0}</cx:v></cx:pt>`)
    .join("");
  return `<cx:numDim type="val"><cx:lvl ptCount="${values.length}" formatCode="General">${pts}</cx:lvl></cx:numDim>`;
}

function titleXml(title: string | undefined): string {
  if (!title?.trim()) return "";
  return `<cx:title><cx:tx><cx:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${esc(title.trim())}</a:t></a:r></a:p></cx:rich></cx:tx><cx:overlay val="0"/></cx:title>`;
}

function legendXml(show: boolean | undefined): string {
  if (show === false) return "";
  return `<cx:legend pos="b" align="ctr"/>`;
}

function seriesXml(def: ChartDef, series: ChartSeries[], dataIds: number[]): string {
  const layoutId = layoutIdFor(def);
  return series
    .map((s, i) => {
      const extra =
        def.type === "histogram" && i === 0
          ? histogramExtras(def as Extract<ChartDef, { type: "histogram" }>)
          : "";
      return `<cx:series layoutId="${esc(layoutId)}" uniqueId="${newGuid()}">
  <cx:tx><cx:txData><cx:v>${esc(s.name ?? `Series ${i + 1}`)}</cx:v></cx:txData></cx:tx>
  ${extra}<cx:dataId val="${dataIds[i] ?? 1}"/>
</cx:series>`;
    })
    .join("\n");
}

function histogramExtras(def: Extract<ChartDef, { type: "histogram" }>): string {
  const parts: string[] = [];
  if (def.binCount !== undefined && Number.isFinite(def.binCount)) {
    parts.push(`<cx:binCount val="${Math.round(def.binCount)}"/>`);
  }
  if (def.binSize !== undefined && Number.isFinite(def.binSize)) {
    parts.push(`<cx:binSize val="${def.binSize}"/>`);
  }
  return parts.join("");
}

export function renderChartExSpaceXml(def: ChartDef): string {
  const categories = normalizeCategories(def);
  const series = normalizeSeries(def, categories.length);

  // id=0 → categories；id=1..N → 各 series 数值列（多系列时与 parser 读法一致）。
  const dataBlocks: string[] = [`<cx:data id="0">${strDimXml(categories)}</cx:data>`];
  const dataIds: number[] = [];
  if (series.length <= 1) {
    const vals = series[0]?.values ?? categories.map(() => 0);
    dataBlocks[0] = `<cx:data id="0">${strDimXml(categories)}${numDimXml(vals)}</cx:data>`;
    dataIds.push(0);
  } else {
    series.forEach((s, i) => {
      const id = i + 1;
      dataBlocks.push(`<cx:data id="${id}">${numDimXml(s.values)}</cx:data>`);
      dataIds.push(id);
    });
  }

  return `${xmlHeader()}
<cx:chartSpace xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <cx:chartData>
    ${dataBlocks.join("\n    ")}
  </cx:chartData>
  <cx:chart>
    ${titleXml(def.title)}
    <cx:plotArea>
      <cx:plotAreaRegion>
        ${seriesXml(def, series, dataIds)}
      </cx:plotAreaRegion>
    </cx:plotArea>
    ${legendXml(def.legend)}
  </cx:chart>
</cx:chartSpace>`;
}

export function renderChartExReferenceXml(relId: string): string {
  return `<cx:chart xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/>`;
}
