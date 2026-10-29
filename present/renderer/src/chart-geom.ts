import type { BarChartDef, ChartDef, ChartSeries, SurfaceChartDef } from "@ppt/core";

export interface PlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IsoQuad {
  pts: Array<{ x: number; y: number }>;
  color: string;
  stroke: boolean;
}

/** 散点 / 组合图系列的 (x,y) 点：优先 series.points，否则用分类下标 + values。 */
export function seriesXyPoints(
  def: ChartDef,
  s: ChartSeries,
): Array<{ x: number; y: number; z?: number }> {
  if (s.points?.length) return s.points;
  const defPts = (def as { points?: Array<Array<{ x: number; y: number; z?: number }>> }).points;
  const idx = def.series.indexOf(s);
  if (idx >= 0 && defPts?.[idx]?.length) return defPts[idx]!;
  return s.values.map((y, i) => ({ x: i, y }));
}

export function linearFit(xs: number[], ys: number[]): { a: number; b: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
    sxx += xs[i]! * xs[i]!;
    sxy += xs[i]! * ys[i]!;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return { a, b };
}

/** Rough advance of `text` at `size` px: CJK glyphs are square, Latin about 0.58em. Legend rows used `length × 6` and overprinted CJK series names. */
export function estimateTextWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += /[\u2e80-\u9fff\uff00-\uffef]/.test(ch) ? size : size * 0.58;
  return w;
}

/** Chart types whose category labels run along the bottom edge of the plot. */
/** Types that carry a labelled axis along the bottom edge — categories for most, the value axis for a horizontal bar chart. */
const BOTTOM_CATEGORY_AXIS = new Set<string>(["column", "bar", "line", "area", "scatter", "bubble", "stock", "waterfall", "pareto", "histogram", "boxWhisker"]);

/**
 * Bottom padding of the plot: room for the category labels (they used to be drawn 14px under
 * the plot into an 8px pad, and the legend was then drawn over them) plus a legend row.
 */
export function chartPadding(def: ChartDef, textSize: number): { bottom: number; legend: number } {
  const hasCombo = def.series.some((s) => s.chartType && s.chartType !== def.type);
  const catAxis = BOTTOM_CATEGORY_AXIS.has(def.type) || hasCombo;
  const legend = def.legend ? textSize + 10 : 0;
  const labels = catAxis ? textSize + 10 : 8;
  return { bottom: labels + legend, legend };
}

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

export function barGeometry(def: BarChartDef, plot: PlotRect, sharedTicks?: number[]): BarGeometry {
  const cats = def.categories ?? [];
  const isHoriz = def.type === "bar";
  const stacked = !!def.stacked || !!def.percentStacked;
  let yMin = 0;
  let yMax = 1;
  const totals: number[] = new Array(cats.length).fill(0);
  if (stacked) {
    for (const s of def.series) for (let i = 0; i < s.values.length; i++) totals[i] = (totals[i] ?? 0) + (s.values[i] ?? 0);
    yMax = Math.max(...totals, 0);
    yMin = Math.min(0, ...totals);
  } else {
    for (const s of def.series) {
      for (const v of s.values) {
        if (v > yMax) yMax = v;
        if (v < yMin) yMin = v;
      }
    }
  }
  if (def.percentStacked) {
    yMin = 0;
    yMax = 1;
  } else {
    ({ yMin, yMax } = applyValueAxisScale(yMin, yMax, def));
  }
  const ticks = sharedTicks ?? niceTicks(yMin, yMax, 5);
  const groupStep = (isHoriz ? plot.h : plot.w) / Math.max(cats.length, 1);
  const inner = groupStep * 0.7;
  const barW = stacked ? inner : inner / Math.max(def.series.length, 1);
  return { isHoriz, stacked, ticks, tmin: ticks[0]!, tmax: ticks[ticks.length - 1]!, groupStep, inner, barW, totals };
}

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
export function barLabelAnchor(geo: BarGeometry, plot: PlotRect, si: number, ci: number, v: number, stackBefore = 0): BarLabelAnchor {
  const span = geo.tmax - geo.tmin || 1;
  const gap = 3;
  if (geo.isHoriz) {
    const yCat = plot.y + geo.groupStep * ci + (geo.groupStep - geo.inner) / 2;
    const yMid = (geo.stacked ? yCat : yCat + si * geo.barW) + geo.barW / 2;
    if (geo.stacked) {
      const mid = stackBefore + v / 2;
      return { x: plot.x + ((mid - geo.tmin) / span) * plot.w, y: yMid, anchor: "middle", baseline: "middle" };
    }
    const end = plot.x + ((v - geo.tmin) / span) * plot.w;
    return { x: v >= 0 ? end + gap : end - gap, y: yMid, anchor: v >= 0 ? "start" : "end", baseline: "middle" };
  }
  const xCat = plot.x + geo.groupStep * ci + (geo.groupStep - geo.inner) / 2;
  const xMid = (geo.stacked ? xCat : xCat + si * geo.barW) + geo.barW / 2;
  const yOf = (val: number): number => plot.y + plot.h - ((val - geo.tmin) / span) * plot.h;
  if (geo.stacked) return { x: xMid, y: yOf(stackBefore + v / 2), anchor: "middle", baseline: "middle" };
  // Negative columns hang below the baseline; their label goes under the bar's free end.
  return v >= 0 ? { x: xMid, y: yOf(v) - gap, anchor: "middle", baseline: "bottom" } : { x: xMid, y: yOf(v) + gap, anchor: "middle", baseline: "top" };
}

export function applyValueAxisScale(
  yMin: number,
  yMax: number,
  def: ChartDef,
): { yMin: number; yMax: number } {
  const val =
    def.axes?.find((a) => a.type === "val" && (a.position === "l" || a.position === "r")) ??
    def.axes?.find((a) => a.type === "val");
  if (val?.scaling?.min != null) yMin = val.scaling.min;
  if (val?.scaling?.max != null) yMax = val.scaling.max;
  return { yMin, yMax };
}

/**
 * 曲面图等距网格：系列 = Y 行，分类 = X 列，values = Z。
 * 单系列时沿 Y 挤一条薄带，避免退化成折线。
 */
export function surfaceIsoQuads(def: SurfaceChartDef, plot: PlotRect): IsoQuad[] {
  const nX = Math.max(2, def.categories?.length ?? Math.max(0, ...def.series.map((s) => s.values.length)));
  const nYraw = def.series.length;
  const nY = Math.max(2, nYraw);
  let zMin = 0;
  let zMax = 1;
  for (const s of def.series) {
    for (const v of s.values) {
      if (v < zMin) zMin = v;
      if (v > zMax) zMax = v;
    }
  }
  const zAt = (j: number, i: number): number => {
    const row = def.series[Math.min(j, nYraw - 1)] ?? def.series[0];
    if (!row) return 0;
    return row.values[Math.min(i, Math.max(0, row.values.length - 1))] ?? 0;
  };
  const project = (i: number, j: number, z: number): { x: number; y: number } => {
    const nx = (nX <= 1 ? 0 : i / (nX - 1));
    const ny = (nY <= 1 ? 0 : j / (nY - 1));
    const nz = (z - zMin) / (zMax - zMin || 1);
    return {
      x: plot.x + plot.w * 0.18 + (nx - ny) * plot.w * 0.4 + ny * plot.w * 0.12,
      y: plot.y + plot.h * 0.78 - (nx + ny) * plot.h * 0.22 - nz * plot.h * 0.48,
    };
  };
  const quads: IsoQuad[] = [];
  for (let j = nY - 2; j >= 0; j--) {
    for (let i = 0; i < nX - 1; i++) {
      const z00 = zAt(j, i);
      const z10 = zAt(j, i + 1);
      const z11 = zAt(j + 1, i + 1);
      const z01 = zAt(j + 1, i);
      const color = def.series[Math.min(j, nYraw - 1)]?.color ?? "#4E79A7";
      quads.push({
        pts: [project(i, j, z00), project(i + 1, j, z10), project(i + 1, j + 1, z11), project(i, j + 1, z01)],
        color,
        stroke: !!def.wireframe,
      });
    }
  }
  return quads;
}

export function comboXyPlotX(
  xVal: number,
  cats: string[],
  plot: PlotRect,
  xs: number[],
): number {
  const n = Math.max(1, cats.length);
  if (!cats.length) {
    const xMin = xs.length ? Math.min(...xs) : 0;
    const xMax = xs.length ? Math.max(...xs) : 1;
    return plot.x + ((xVal - xMin) / (xMax - xMin || 1)) * plot.w;
  }
  const xMin = xs.length ? Math.min(...xs) : 0;
  const xMax = xs.length ? Math.max(...xs) : 0;
  const asCategory = xMin >= -0.5 && xMax <= Math.max(n, 1) && xMax - xMin <= n + 0.5;
  if (asCategory) {
    if (n === 1) return plot.x + plot.w / 2;
    return plot.x + (xVal / Math.max(1, n - 1)) * plot.w;
  }
  return plot.x + ((xVal - xMin) / (xMax - xMin || 1)) * plot.w;
}

export function pointLabelText(
  def: ChartDef,
  s: ChartSeries,
  i: number,
  v: number,
): string | undefined {
  const d = s.dataLabels ?? def.dataLabels;
  const showVal = d?.showVal ?? !!def.showValues;
  if (!d && !showVal) return undefined;
  const parts: string[] = [];
  if (d?.showSerName && s.name) parts.push(s.name);
  if (d?.showCatName && def.categories?.[i]) parts.push(def.categories[i]!);
  if (showVal) {
    parts.push(Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10));
  }
  if (d?.showPercent) {
    const total = s.values.reduce((a, b) => a + Math.abs(b), 0);
    parts.push(`${total ? Math.round((Math.abs(v) / total) * 100) : 0}%`);
  }
  if (d?.showBubbleSize && s.points?.[i]?.z != null) parts.push(String(s.points[i]!.z));
  const text = parts.filter(Boolean).join(d?.separator ?? ", ");
  return text || undefined;
}

/** 3D 柱/条预览的挤出偏移（view3D rotX/rotY → 屏幕位移）。 */
export function chart3DOffset(def: ChartDef): { dx: number; dy: number } | null {
  if (!def.chart3D && !def.view3D) return null;
  const rotY = def.view3D?.rotY ?? 20;
  const rotX = def.view3D?.rotX ?? 15;
  const depth = Math.max(4, Math.min(16, (def.view3D?.depthPercent ?? 100) / 12));
  return {
    dx: depth * Math.sin((rotY * Math.PI) / 180),
    dy: -depth * Math.sin((rotX * Math.PI) / 180),
  };
}

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
export function chartTextStyle(def: Pick<ChartDef, "textColor" | "textSize" | "lineColor">): ChartTextStyle {
  const size = def.textSize && def.textSize > 0 ? def.textSize : 13;
  if (!def.textColor && !def.lineColor) return { text: "#111827", muted: "#6b7280", axis: "#9ca3af", grid: "#e5e7eb", size };
  const text = def.textColor ?? "#111827";
  const line = def.lineColor ?? mixHex(text, "#808080", 0.6);
  return { text, muted: def.textColor ? mixHex(text, line, 0.35) : "#6b7280", axis: line, grid: line, size };
}

/** Linear mix of two #rrggbb colours; `t` = weight of `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const ch = (i: number) => Math.round(pa[i]! * (1 - t) + pb[i]! * t).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function parseHex(color: string): [number, number, number] | null {
  const hex = color.replace("#", "");
  if (hex.length !== 6 && hex.length !== 3) return null;
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * "Nice" value-axis ticks: about `count` steps at 1 / 2 / 5 × 10ⁿ. (0..1500 → 0, 500, 1000, 1500;
 * not one line per hundred.)
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    if (min === 0) return [0, 1];
    min = min - Math.abs(min) * 0.1;
    max = max + Math.abs(max) * 0.1;
  }
  const range = max - min;
  const rough = range / count;
  const step = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / step;
  const m = frac > 5 ? 10 : frac > 2 ? 5 : frac > 1 ? 2 : 1;
  const s = step * m;
  const lo = Math.floor(min / s) * s;
  const hi = Math.ceil(max / s) * s;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += s) out.push(Number(v.toFixed(10)));
  return out;
}

export function shadeHex(color: string, factor: number): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6 && hex.length !== 3) return color;
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return color;
  const ch = (shift: number) => {
    const v = Math.max(0, Math.min(255, Math.round(((n >> shift) & 0xff) * factor)));
    return v.toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

