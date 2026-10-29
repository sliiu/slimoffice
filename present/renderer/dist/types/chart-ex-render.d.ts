import type { ChartDef } from "@sliiu/present-core";
export declare const CHART_EX_PALETTE: string[];
export interface Plot {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface ChartExSlice {
    label: string;
    value: number;
    color: string;
}
export interface TreemapCell extends ChartExSlice {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface SunburstArc extends ChartExSlice {
    cx: number;
    cy: number;
    r0: number;
    r1: number;
    a0: number;
    a1: number;
}
export interface WaterfallBar extends ChartExSlice {
    x: number;
    y: number;
    w: number;
    h: number;
    kind: "increase" | "decrease" | "total";
}
export interface FunnelSeg extends ChartExSlice {
    points: [number, number][];
}
export interface ColumnBar extends ChartExSlice {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface ParetoLayout {
    bars: ColumnBar[];
    line: [number, number][];
}
export interface BoxWhiskerBar {
    label: string;
    color: string;
    cx: number;
    whiskerLow: number;
    q1: number;
    median: number;
    q3: number;
    whiskerHigh: number;
    boxW: number;
}
export interface RegionRow extends ChartExSlice {
    x: number;
    y: number;
    w: number;
    h: number;
}
export declare function layoutHistogram(slices: ChartExSlice[], plot: Plot): ColumnBar[];
export declare function layoutPareto(slices: ChartExSlice[], plot: Plot): ParetoLayout;
export declare function layoutBoxWhisker(slices: ChartExSlice[], plot: Plot): BoxWhiskerBar[];
export declare function layoutRegion(slices: ChartExSlice[], plot: Plot): RegionRow[];
export declare function normalizeChartExSlices(def: ChartDef, opts?: {
    preserveSign?: boolean;
}): ChartExSlice[];
/** Slice-and-dice treemap — 足够表达占比结构，编辑预览用。 */
export declare function layoutTreemap(slices: ChartExSlice[], plot: Plot): TreemapCell[];
/** 单层 sunburst：内环空心 + 外环扇区（扁平 categories）。 */
export declare function layoutSunburst(slices: ChartExSlice[], plot: Plot): SunburstArc[];
export declare function layoutWaterfall(slices: ChartExSlice[], plot: Plot): WaterfallBar[];
export declare function layoutFunnel(slices: ChartExSlice[], plot: Plot): FunnelSeg[];
export declare function sunburstArcPath(arc: SunburstArc): string;
export declare function polygonPath(points: [number, number][]): string;
