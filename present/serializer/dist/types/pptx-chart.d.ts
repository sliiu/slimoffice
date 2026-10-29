import type { ChartDef } from "@sliiu/present-core";
/** 该 ChartDef 类型是否能渲染成 c:chart 部件。 */
export declare function chartExportSupported(def: ChartDef): boolean;
export declare function renderChartSpaceXml(def: ChartDef): string;
