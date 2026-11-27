// 现代图表（sunburst / treemap / waterfall / funnel 等）。
//
// cx 命名空间（schemas.microsoft.com/office/drawing/2014/chartex）不在 ECMA-376 第 5 版里，
// 所以不写 chartEx 部件。chartExExportSupported 固定返回 false，写盘走经典 c:chart
// （见 pptx-chart.ts）。读入侧仍解析 chartEx。

import type { ChartDef } from "@sliiu/present-core";

export const CHART_EX_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
export const CHART_EX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
export const CHART_EX_GRAPHIC_URI = "http://schemas.openxmlformats.org/drawingml/2006/chart";

/** chartEx 不在 ECMA-376 里，一律走经典 c:chart。 */
export function chartExExportSupported(_def: ChartDef): boolean {
  return false;
}
