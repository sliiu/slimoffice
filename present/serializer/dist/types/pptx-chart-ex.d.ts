import type { ChartDef } from "@sliiu/present-core";
export declare const CHART_EX_REL_TYPE = "http://schemas.microsoft.com/office/2014/relationships/chartEx";
export declare const CHART_EX_CONTENT_TYPE = "application/vnd.ms-office.chartex+xml";
export declare const CHART_EX_GRAPHIC_URI = "http://schemas.microsoft.com/office/drawing/2014/chartex";
export declare function chartExExportSupported(def: ChartDef): boolean;
export declare function renderChartExSpaceXml(def: ChartDef): string;
export declare function renderChartExReferenceXml(relId: string): string;
