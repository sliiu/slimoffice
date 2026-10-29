import type { BarChartDef, ChartDef, ChartSeries, SurfaceChartDef } from "@sliiu/present-core";
export interface PlotRect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface IsoQuad {
    pts: Array<{
        x: number;
        y: number;
    }>;
    color: string;
    stroke: boolean;
}
/** 散点 / 组合图系列的 (x,y) 点：优先 series.points，否则用分类下标 + values。 */
export declare function seriesXyPoints(def: ChartDef, s: ChartSeries): Array<{
    x: number;
    y: number;
    z?: number;
}>;
export declare function linearFit(xs: number[], ys: number[]): {
    a: number;
    b: number;
} | null;
/** Rough advance of `text` at `size` px: CJK glyphs are square, Latin about 0.58em. Legend rows used `length × 6` and overprinted CJK series names. */
export declare function estimateTextWidth(text: string, size: number): number;
/**
 * Bottom padding of the plot: room for the category labels (they used to be drawn 14px under
 * the plot into an 8px pad, and the legend was then drawn over them) plus a legend row.
 */
export declare function chartPadding(def: ChartDef, textSize: number): {
    bottom: number;
    legend: number;
};
/**
 * Geometry shared by the bar renderer and the data-label overlay. Labels used to be placed on
 * the line chart's x positions (i · w/(n−1)), so on a clustered column chart every label sat a
 * bar to the right of its column and clustered labels overprinted each other.
 */
export interface BarGeometry {
    isHoriz: boolean;
    stacked: boolean;
    ticks: number[];
    tmin: number;
    tmax: number;
    /** Width (columns) or height (bars) of one category group. */
    groupStep: number;
    /** Width of the cluster inside a group (70 % of the group). */
    inner: number;
    /** Width of one bar in the cluster (the whole cluster when stacked). */
    barW: number;
    /** Per-category totals; used for percent-stacked scaling. */
    totals: number[];
}
export declare function barGeometry(def: BarChartDef, plot: PlotRect, sharedTicks?: number[]): BarGeometry;
export interface BarLabelAnchor {
    x: number;
    y: number;
    anchor: "middle" | "start" | "end";
    /** Where the text sits relative to `y`: above it (bottom baseline), centred on it, or below it (top). */
    baseline: "bottom" | "middle" | "top";
}
/**
 * Where the value label of series `si`, category `ci` goes: just past the free end of a
 * clustered bar (above a column, right of a horizontal bar), or centred in a stacked segment.
 * `stackBefore` is the signed running total of the segments under this one (stacked only).
 */
export declare function barLabelAnchor(geo: BarGeometry, plot: PlotRect, si: number, ci: number, v: number, stackBefore?: number): BarLabelAnchor;
export declare function applyValueAxisScale(yMin: number, yMax: number, def: ChartDef): {
    yMin: number;
    yMax: number;
};
/**
 * 曲面图等距网格：系列 = Y 行，分类 = X 列，values = Z。
 * 单系列时沿 Y 挤一条薄带，避免退化成折线。
 */
export declare function surfaceIsoQuads(def: SurfaceChartDef, plot: PlotRect): IsoQuad[];
export declare function comboXyPlotX(xVal: number, cats: string[], plot: PlotRect, xs: number[]): number;
export declare function pointLabelText(def: ChartDef, s: ChartSeries, i: number, v: number): string | undefined;
/** 3D 柱/条预览的挤出偏移（view3D rotX/rotY → 屏幕位移）。 */
export declare function chart3DOffset(def: ChartDef): {
    dx: number;
    dy: number;
} | null;
export interface ChartTextStyle {
    /** Title / data-label colour. */
    text: string;
    /** Axis tick / category / legend label colour. */
    muted: string;
    /** Axis line colour. */
    axis: string;
    /** Gridline colour. */
    grid: string;
    /** Label font size in px (OOXML default 10pt ≈ 13px). */
    size: number;
}
/**
 * Chart-wide text and line colours. `def.textColor` / `def.lineColor` (chartSpace txPr, axis spPr)
 * win; otherwise the neutral greys PowerPoint uses on a white chart area. A single text colour
 * gives labels at full strength and ticks / legend at 75% towards the line colour so a dark-theme
 * chart keeps the same hierarchy a light one has.
 */
export declare function chartTextStyle(def: Pick<ChartDef, "textColor" | "textSize" | "lineColor">): ChartTextStyle;
/** Linear mix of two #rrggbb colours; `t` = weight of `b`. */
export declare function mixHex(a: string, b: string, t: number): string;
/**
 * "Nice" value-axis ticks: about `count` steps at 1 / 2 / 5 × 10ⁿ. (0..1500 → 0, 500, 1000, 1500;
 * not one line per hundred.)
 */
export declare function niceTicks(min: number, max: number, count?: number): number[];
export declare function shadeHex(color: string, factor: number): string;
