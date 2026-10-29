import type { ChartDef, ChartSeries } from "@ppt/core";

export const CHART_EX_PALETTE = [
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

function columnBarsFromSlices(slices: ChartExSlice[], plot: Plot): ColumnBar[] {
  const items = slices.filter((s) => s.value > 0);
  if (!items.length) return [];
  const max = Math.max(...items.map((s) => s.value), 1);
  const gap = plot.w / items.length;
  const barW = gap * 0.65;
  return items.map((s, i) => {
    const h = (s.value / max) * plot.h;
    return {
      ...s,
      x: plot.x + gap * i + (gap - barW) / 2,
      y: plot.y + plot.h - h,
      w: barW,
      h,
    };
  });
}

export function layoutHistogram(slices: ChartExSlice[], plot: Plot): ColumnBar[] {
  return columnBarsFromSlices(slices, plot);
}

export function layoutPareto(slices: ChartExSlice[], plot: Plot): ParetoLayout {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const bars = columnBarsFromSlices(sorted, plot);
  const total = sorted.reduce((sum, s) => sum + s.value, 0);
  let cum = 0;
  const line: [number, number][] = [];
  const gap = plot.w / Math.max(sorted.length, 1);
  for (let i = 0; i < sorted.length; i++) {
    cum += sorted[i]!.value;
    const pct = total > 0 ? cum / total : 0;
    line.push([plot.x + gap * (i + 0.5), plot.y + plot.h - pct * plot.h]);
  }
  return { bars, line };
}

export function layoutBoxWhisker(slices: ChartExSlice[], plot: Plot): BoxWhiskerBar[] {
  const items = slices.filter((s) => s.value >= 0);
  if (!items.length) return [];
  const max = Math.max(...items.map((s) => s.value), 1);
  const slot = plot.w / items.length;
  const boxW = slot * 0.45;
  return items.map((s, i) => {
    const v = s.value;
    const cx = plot.x + slot * (i + 0.5);
    const toY = (val: number) => plot.y + plot.h - (Math.min(val, max) / max) * plot.h;
    const spread = Math.max(v * 0.15, max * 0.04);
    return {
      label: s.label,
      color: s.color,
      cx,
      whiskerLow: toY(Math.max(0, v - spread * 2)),
      q1: toY(Math.max(0, v - spread)),
      median: toY(v),
      q3: toY(Math.min(max, v + spread)),
      whiskerHigh: toY(Math.min(max, v + spread * 2)),
      boxW,
    };
  });
}

export function layoutRegion(slices: ChartExSlice[], plot: Plot): RegionRow[] {
  const items = slices.filter((s) => s.value > 0);
  if (!items.length) return [];
  const max = Math.max(...items.map((s) => s.value), 1);
  const rowH = plot.h / items.length;
  return items.map((s, i) => ({
    ...s,
    x: plot.x,
    y: plot.y + rowH * i + 2,
    w: (s.value / max) * plot.w * 0.95,
    h: Math.max(4, rowH - 4),
  }));
}

export function normalizeChartExSlices(def: ChartDef, opts?: { preserveSign?: boolean }): ChartExSlice[] {
  const categories =
    def.categories?.length
      ? def.categories
      : Array.from({ length: Math.max(1, def.series[0]?.values.length ?? 1) }, (_, i) => `Cat ${i + 1}`);
  const series: ChartSeries[] =
    def.series.length > 0
      ? def.series
      : [{ name: "Series 1", values: categories.map(() => 0) }];
  const s0 = series[0]!;
  const palette = def.colors ?? CHART_EX_PALETTE;
  const vary = def.varyColors !== false;
  return categories.map((label, i) => {
    const raw = s0.values[i] ?? 0;
    return {
      label: label || `Item ${i + 1}`,
      value: opts?.preserveSign ? raw : Math.max(0, Math.abs(raw)),
      color: vary ? palette[i % palette.length]! : s0.color ?? palette[i % palette.length]!,
    };
  });
}

/** Slice-and-dice treemap — 足够表达占比结构，编辑预览用。 */
export function layoutTreemap(slices: ChartExSlice[], plot: Plot): TreemapCell[] {
  const items = slices.filter((s) => s.value > 0);
  if (items.length === 0) return [];
  const pad = 2;
  const cells: TreemapCell[] = [];
  const walk = (list: ChartExSlice[], x: number, y: number, w: number, h: number, depth: number): void => {
    if (list.length === 0 || w <= 0 || h <= 0) return;
    if (list.length === 1) {
      const s = list[0]!;
      cells.push({
        ...s,
        x: x + pad / 2,
        y: y + pad / 2,
        w: Math.max(0, w - pad),
        h: Math.max(0, h - pad),
      });
      return;
    }
    const total = list.reduce((sum, s) => sum + s.value, 0);
    if (total <= 0) return;
    const mid = Math.ceil(list.length / 2);
    const left = list.slice(0, mid);
    const right = list.slice(mid);
    const leftSum = left.reduce((sum, s) => sum + s.value, 0);
    const ratio = leftSum / total;
    const horizontal = depth % 2 === 0 ? w >= h : h > w;
    if (horizontal) {
      const lw = w * ratio;
      walk(left, x, y, lw, h, depth + 1);
      walk(right, x + lw, y, w - lw, h, depth + 1);
    } else {
      const lh = h * ratio;
      walk(left, x, y, w, lh, depth + 1);
      walk(right, x, y + lh, w, h - lh, depth + 1);
    }
  };
  walk(items, plot.x, plot.y, plot.w, plot.h, 0);
  return cells;
}

/** 单层 sunburst：内环空心 + 外环扇区（扁平 categories）。 */
export function layoutSunburst(slices: ChartExSlice[], plot: Plot): SunburstArc[] {
  const items = slices.filter((s) => s.value > 0);
  const total = items.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return [];
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const r = Math.min(plot.w, plot.h) / 2 - 4;
  const r0 = r * 0.38;
  const r1 = r;
  let a = -Math.PI / 2;
  const arcs: SunburstArc[] = [];
  for (const s of items) {
    const span = (s.value / total) * Math.PI * 2;
    if (span <= 0) continue;
    arcs.push({ ...s, cx, cy, r0, r1, a0: a, a1: a + span });
    a += span;
  }
  return arcs;
}

export function layoutWaterfall(slices: ChartExSlice[], plot: Plot): WaterfallBar[] {
  const items = slices.filter((s) => s.value !== 0 || slices.length === 1);
  if (items.length === 0) return [];
  let running = 0;
  let minY = 0;
  let maxY = 0;
  const deltas = items.map((s) => s.value);
  for (const v of deltas) {
    const top = running + Math.max(0, v);
    const bottom = running + Math.min(0, v);
    minY = Math.min(minY, bottom, top);
    maxY = Math.max(maxY, bottom, top);
    running += v;
  }
  minY = Math.min(minY, 0);
  maxY = Math.max(maxY, running, 1);
  const range = maxY - minY || 1;
  const barW = (plot.w / Math.max(items.length, 1)) * 0.55;
  const gap = plot.w / Math.max(items.length, 1);
  running = 0;
  const bars: WaterfallBar[] = [];
  for (let i = 0; i < items.length; i++) {
    const s = items[i]!;
    const v = s.value;
    const y0 = running;
    const y1 = running + v;
    const top = Math.max(y0, y1);
    const bottom = Math.min(y0, y1);
    const pxTop = plot.y + plot.h - ((top - minY) / range) * plot.h;
    const pxBottom = plot.y + plot.h - ((bottom - minY) / range) * plot.h;
    bars.push({
      ...s,
      x: plot.x + gap * i + (gap - barW) / 2,
      y: Math.min(pxTop, pxBottom),
      w: barW,
      h: Math.max(2, Math.abs(pxBottom - pxTop)),
      kind: v >= 0 ? "increase" : "decrease",
    });
    running = y1;
  }
  return bars;
}

export function layoutFunnel(slices: ChartExSlice[], plot: Plot): FunnelSeg[] {
  const items = slices.filter((s) => s.value > 0);
  if (items.length === 0) return [];
  const maxVal = Math.max(...items.map((s) => s.value));
  const segH = plot.h / items.length;
  const cx = plot.x + plot.w / 2;
  const segs: FunnelSeg[] = [];
  for (let i = 0; i < items.length; i++) {
    const s = items[i]!;
    const topVal = i === 0 ? s.value : items[i - 1]!.value;
    const botVal = s.value;
    const topW = (topVal / maxVal) * plot.w * 0.92;
    const botW = (botVal / maxVal) * plot.w * 0.92;
    const y0 = plot.y + segH * i;
    const y1 = plot.y + segH * (i + 1) - 1;
    segs.push({
      ...s,
      points: [
        [cx - topW / 2, y0],
        [cx + topW / 2, y0],
        [cx + botW / 2, y1],
        [cx - botW / 2, y1],
      ],
    });
  }
  return segs;
}

export function sunburstArcPath(arc: SunburstArc): string {
  const { cx, cy, r0, r1, a0, a1 } = arc;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + Math.cos(a0) * r1;
  const y0 = cy + Math.sin(a0) * r1;
  const x1 = cx + Math.cos(a1) * r1;
  const y1 = cy + Math.sin(a1) * r1;
  const ix0 = cx + Math.cos(a0) * r0;
  const iy0 = cy + Math.sin(a0) * r0;
  const ix1 = cx + Math.cos(a1) * r0;
  const iy1 = cy + Math.sin(a1) * r0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${r0} ${r0} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

export function polygonPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M ${first![0]} ${first![1]} ${rest.map((p) => `L ${p[0]} ${p[1]}`).join(" ")} Z`;
}
