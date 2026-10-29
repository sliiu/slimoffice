// Inspector：图表数据表编辑（categories × series 网格，对齐 PowerPoint「编辑数据」）。

import type { BubbleChartDef, ChartDef, ChartSeries, ChartShape, CommandStack, ScatterChartDef } from "@ppt/core";
import { SetChartDefCmd } from "./commands";
import { t } from "./i18n";

const CATEGORY_CHART_TYPES = [
  "bar",
  "column",
  "line",
  "pie",
  "doughnut",
  "area",
  "radar",
  "stock",
  "surface",
] as const;

const CHART_EX_TYPES = [
  "sunburst",
  "treemap",
  "waterfall",
  "funnel",
  "pareto",
  "histogram",
  "boxWhisker",
  "region",
  "unknown",
] as const;

type CategoryChartType = (typeof CATEGORY_CHART_TYPES)[number];
type ChartExType = (typeof CHART_EX_TYPES)[number];

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function isCategoryChart(def: ChartDef): def is ChartDef & { type: CategoryChartType } {
  return (CATEGORY_CHART_TYPES as readonly string[]).includes(def.type);
}

function isChartEx(def: ChartDef): def is ChartDef & { type: ChartExType } {
  return (CHART_EX_TYPES as readonly string[]).includes(def.type);
}

function chartTypeLabel(type: string): string {
  const key = `inspector.chart.type.${type}` as const;
  const msg = t(key as never);
  return msg === key ? type : msg;
}

function normalizeCategories(def: ChartDef): string[] {
  if (def.categories?.length) return [...def.categories];
  const maxLen = Math.max(0, ...def.series.map((s) => s.values.length));
  return Array.from({ length: Math.max(1, maxLen) }, (_, i) => `Cat ${i + 1}`);
}

function normalizeSeries(def: ChartDef, catLen: number): ChartSeries[] {
  const src = def.series.length > 0 ? def.series : [{ name: "Series 1", values: [] }];
  return src.map((s, si) => ({
    ...deepClone(s),
    name: s.name ?? `Series ${si + 1}`,
    values: Array.from({ length: catLen }, (_, i) => {
      const v = s.values[i];
      return typeof v === "number" && Number.isFinite(v) ? v : 0;
    }),
  }));
}

function buildCategoryChartDef(
  prev: ChartDef,
  type: CategoryChartType,
  categories: string[],
  series: ChartSeries[],
  title: string,
  legend: boolean,
): ChartDef {
  const next = deepClone(prev) as ChartDef & { type: CategoryChartType };
  next.type = type;
  next.title = title.trim() || undefined;
  next.categories = categories;
  next.series = series.map((s) => ({
    ...s,
    name: s.name?.trim() || undefined,
    values: s.values.map((v) => (Number.isFinite(v) ? v : 0)),
  }));
  next.legend = legend;
  return next;
}

function buildChartExDef(
  prev: ChartDef,
  categories: string[],
  series: ChartSeries[],
  title: string,
  legend: boolean,
): ChartDef {
  const next = deepClone(prev);
  next.title = title.trim() || undefined;
  next.categories = categories;
  next.series = series.map((s) => ({
    ...s,
    name: s.name?.trim() || undefined,
    values: s.values.map((v) => (Number.isFinite(v) ? v : 0)),
  }));
  next.legend = legend;
  return next;
}

function buildScatterChartDef(
  prev: ScatterChartDef | BubbleChartDef,
  series: ChartSeries[],
  points: Array<Array<{ x: number; y: number; z?: number }>>,
  title: string,
  legend: boolean,
): ScatterChartDef | BubbleChartDef {
  const next = deepClone(prev);
  next.title = title.trim() || undefined;
  next.legend = legend;
  next.series = series.map((s, i) => ({
    ...s,
    name: s.name?.trim() || undefined,
    values: (points[i] ?? []).map((p) => (Number.isFinite(p.y) ? p.y : 0)),
  }));
  next.points = points.map((pts) =>
    pts.map((p) => ({
      x: Number.isFinite(p.x) ? p.x : 0,
      y: Number.isFinite(p.y) ? p.y : 0,
      ...(typeof p.z === "number" && Number.isFinite(p.z) ? { z: p.z } : {}),
    })),
  );
  return next;
}

function normalizeScatter(def: ScatterChartDef | BubbleChartDef): {
  series: ChartSeries[];
  points: Array<Array<{ x: number; y: number; z?: number }>>;
} {
  const series =
    def.series.length > 0
      ? def.series.map((s, si) => ({
          ...deepClone(s),
          name: s.name ?? `Series ${si + 1}`,
        }))
      : [{ name: "Series 1", values: [] }];
  const points = series.map((s, si) => {
    const fromDef = def.points?.[si];
    if (fromDef?.length) {
      return fromDef.map((p) => ({
        x: Number.isFinite(p.x) ? p.x : 0,
        y: Number.isFinite(p.y) ? p.y : 0,
        ...("z" in p && typeof p.z === "number" && Number.isFinite(p.z) ? { z: p.z } : {}),
      }));
    }
    return s.values.map((y, i) => ({
      x: i + 1,
      y: Number.isFinite(y) ? y : 0,
    }));
  });
  if (!points.some((pts) => pts.length > 0)) {
    points[0] = [{ x: 1, y: 0 }];
  }
  return { series, points };
}

function inputStyle(): string {
  return [
    "width:100%",
    "box-sizing:border-box",
    "background:var(--secondary)",
    "color:var(--foreground)",
    "border:1px solid var(--border)",
    "border-radius:3px",
    "padding:3px 5px",
    "font:inherit",
    "font-size:11px",
  ].join(";");
}

function mkBtn(doc: Document, label: string, fn: () => void): HTMLButtonElement {
  const b = doc.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.style.cssText = [
    "background:var(--card)",
    "color:var(--foreground)",
    "border:1px solid var(--border)",
    "border-radius:3px",
    "padding:4px 8px",
    "cursor:pointer",
    "font:inherit",
    "font-size:11px",
  ].join(";");
  b.addEventListener("click", fn);
  return b;
}

function mkSectionHead(doc: Document): HTMLElement {
  const head = doc.createElement("div");
  head.textContent = t("inspector.chart.section");
  head.style.cssText =
    "font-size:11px;font-weight:600;color:var(--muted-foreground);margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px";
  return head;
}

function mkWrap(doc: Document): HTMLElement {
  const wrap = doc.createElement("div");
  wrap.style.cssText = "border-top:1px solid var(--border);padding:10px 0;margin-top:6px";
  wrap.appendChild(mkSectionHead(doc));
  return wrap;
}

interface TitleLegendInputs {
  titleInput: HTMLInputElement;
  legendCb: HTMLInputElement;
}

function appendTitleLegendRows(doc: Document, wrap: HTMLElement, def: ChartDef): TitleLegendInputs {
  const titleRow = doc.createElement("div");
  titleRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";
  const titleLbl = doc.createElement("span");
  titleLbl.textContent = t("inspector.chart.title");
  titleLbl.style.cssText = "color:var(--muted-foreground);font-size:11px;min-width:52px";
  const titleInput = doc.createElement("input");
  titleInput.type = "text";
  titleInput.value = def.title ?? "";
  titleInput.style.cssText = inputStyle();
  titleRow.append(titleLbl, titleInput);
  wrap.appendChild(titleRow);

  const legendRow = doc.createElement("label");
  legendRow.style.cssText =
    "display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:11px;color:var(--muted-foreground);cursor:pointer";
  const legendCb = doc.createElement("input");
  legendCb.type = "checkbox";
  legendCb.checked = def.legend !== false;
  legendRow.append(legendCb, doc.createTextNode(t("inspector.chart.legend")));
  wrap.appendChild(legendRow);

  return { titleInput, legendCb };
}

function appendApplyButton(
  doc: Document,
  wrap: HTMLElement,
  onApply: () => void,
): void {
  const applyRow = doc.createElement("div");
  applyRow.style.cssText = "display:flex;justify-content:flex-end";
  const applyBtn = mkBtn(doc, t("inspector.chart.apply"), onApply);
  applyBtn.style.background = "var(--primary)";
  applyBtn.style.color = "var(--primary-foreground)";
  applyBtn.style.borderColor = "var(--primary)";
  applyRow.appendChild(applyBtn);
  wrap.appendChild(applyRow);
}

function appendCategoryGrid(
  doc: Document,
  wrap: HTMLElement,
  state: { categories: string[]; series: ChartSeries[] },
): void {
  const gridWrap = doc.createElement("div");
  gridWrap.className = "ppt-scroll";
  gridWrap.style.cssText =
    "overflow:auto;max-height:220px;margin-bottom:8px;border:1px solid var(--border);border-radius:4px";
  wrap.appendChild(gridWrap);

  const renderGrid = (): void => {
    gridWrap.replaceChildren();
    const table = doc.createElement("table");
    table.style.cssText = "border-collapse:collapse;width:100%;font-size:11px";

    const thead = doc.createElement("thead");
    const hr = doc.createElement("tr");
    const corner = doc.createElement("th");
    corner.style.cssText =
      "padding:4px;border-bottom:1px solid var(--border);background:var(--card);position:sticky;top:0;left:0;z-index:2";
    hr.appendChild(corner);
    state.categories.forEach((cat, ci) => {
      const th = doc.createElement("th");
      th.style.cssText =
        "padding:2px;border-bottom:1px solid var(--border);background:var(--card);position:sticky;top:0;z-index:1;min-width:64px";
      const inp = doc.createElement("input");
      inp.type = "text";
      inp.value = cat;
      inp.style.cssText = inputStyle();
      inp.addEventListener("change", () => {
        state.categories[ci] = inp.value.trim() || `Cat ${ci + 1}`;
        renderGrid();
      });
      th.appendChild(inp);
      hr.appendChild(th);
    });
    const addColTh = doc.createElement("th");
    addColTh.style.cssText =
      "padding:4px;border-bottom:1px solid var(--border);background:var(--card);position:sticky;top:0";
    addColTh.appendChild(
      mkBtn(doc, "+", () => {
        state.categories.push(`Cat ${state.categories.length + 1}`);
        state.series = state.series.map((s) => ({ ...s, values: [...s.values, 0] }));
        renderGrid();
      }),
    );
    hr.appendChild(addColTh);
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    state.series.forEach((ser, si) => {
      const tr = doc.createElement("tr");
      const nameTd = doc.createElement("td");
      nameTd.style.cssText =
        "padding:2px;border-bottom:1px solid var(--border);background:var(--card);position:sticky;left:0;z-index:1;min-width:88px";
      const nameInp = doc.createElement("input");
      nameInp.type = "text";
      nameInp.value = ser.name ?? "";
      nameInp.style.cssText = inputStyle();
      nameInp.addEventListener("change", () => {
        state.series[si] = { ...state.series[si]!, name: nameInp.value };
      });
      nameTd.appendChild(nameInp);
      tr.appendChild(nameTd);

      ser.values.forEach((val, vi) => {
        const td = doc.createElement("td");
        td.style.cssText = "padding:2px;border-bottom:1px solid var(--border)";
        const num = doc.createElement("input");
        num.type = "number";
        num.step = "any";
        num.value = String(val);
        num.style.cssText = inputStyle();
        num.addEventListener("change", () => {
          const n = Number(num.value);
          const next = [...state.series[si]!.values];
          next[vi] = Number.isFinite(n) ? n : 0;
          state.series[si] = { ...state.series[si]!, values: next };
        });
        td.appendChild(num);
        tr.appendChild(td);
      });

      const delTd = doc.createElement("td");
      delTd.style.cssText = "padding:2px;border-bottom:1px solid var(--border)";
      if (state.series.length > 1) {
        delTd.appendChild(
          mkBtn(doc, "×", () => {
            state.series = state.series.filter((_, i) => i !== si);
            renderGrid();
          }),
        );
      }
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    gridWrap.appendChild(table);
  };

  renderGrid();

  const toolRow = doc.createElement("div");
  toolRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px";
  toolRow.appendChild(
    mkBtn(doc, t("inspector.chart.addSeries"), () => {
      state.series.push({
        name: `Series ${state.series.length + 1}`,
        values: Array.from({ length: state.categories.length }, () => 0),
      });
      renderGrid();
    }),
  );
  if (state.categories.length > 1) {
    toolRow.appendChild(
      mkBtn(doc, t("inspector.chart.removeCategory"), () => {
        state.categories = state.categories.slice(0, -1);
        state.series = state.series.map((s) => ({ ...s, values: s.values.slice(0, -1) }));
        renderGrid();
      }),
    );
  }
  wrap.appendChild(toolRow);
}

function categoryChartInspector(
  doc: Document,
  wrap: HTMLElement,
  def: ChartDef & { type: CategoryChartType },
  slideIdx: number,
  shapeId: string,
  stack: CommandStack,
  onApplied?: () => void,
): void {
  const state = {
    categories: normalizeCategories(def),
    series: normalizeSeries(def, normalizeCategories(def).length),
  };
  state.series = normalizeSeries(def, state.categories.length);

  const commit = (type: CategoryChartType, title: string, legend: boolean): void => {
    const next = buildCategoryChartDef(def, type, state.categories, state.series, title, legend);
    stack.execute(new SetChartDefCmd(slideIdx, shapeId, next));
    onApplied?.();
  };

  const typeRow = doc.createElement("div");
  typeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";
  const typeLbl = doc.createElement("span");
  typeLbl.textContent = t("inspector.chart.type");
  typeLbl.style.cssText = "color:var(--muted-foreground);font-size:11px;min-width:52px";
  const typeSel = doc.createElement("select");
  typeSel.style.cssText = inputStyle();
  for (const ty of CATEGORY_CHART_TYPES) {
    const o = doc.createElement("option");
    o.value = ty;
    o.textContent = chartTypeLabel(ty);
    typeSel.appendChild(o);
  }
  typeSel.value = def.type;
  typeRow.append(typeLbl, typeSel);
  wrap.appendChild(typeRow);

  const { titleInput, legendCb } = appendTitleLegendRows(doc, wrap, def);
  appendCategoryGrid(doc, wrap, state);

  appendApplyButton(doc, wrap, () => {
    commit(typeSel.value as CategoryChartType, titleInput.value, legendCb.checked);
  });

  typeSel.addEventListener("change", () => {
    commit(typeSel.value as CategoryChartType, titleInput.value, legendCb.checked);
  });
}

function scatterChartInspector(
  doc: Document,
  wrap: HTMLElement,
  def: ScatterChartDef | BubbleChartDef,
  slideIdx: number,
  shapeId: string,
  stack: CommandStack,
  onApplied?: () => void,
): void {
  const normalized = normalizeScatter(def);
  let series = normalized.series;
  let points = normalized.points;
  let activeSeries = 0;

  const typeRow = doc.createElement("div");
  typeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";
  const typeLbl = doc.createElement("span");
  typeLbl.textContent = t("inspector.chart.type");
  typeLbl.style.cssText = "color:var(--muted-foreground);font-size:11px;min-width:52px";
  const typeVal = doc.createElement("span");
  typeVal.textContent = chartTypeLabel(def.type);
  typeVal.style.cssText = "font-size:11px";
  typeRow.append(typeLbl, typeVal);
  wrap.appendChild(typeRow);

  const { titleInput, legendCb } = appendTitleLegendRows(doc, wrap, def);

  const seriesRow = doc.createElement("div");
  seriesRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";
  const seriesLbl = doc.createElement("span");
  seriesLbl.textContent = t("inspector.chart.scatter.series");
  seriesLbl.style.cssText = "color:var(--muted-foreground);font-size:11px;min-width:52px";
  const seriesSel = doc.createElement("select");
  seriesSel.style.cssText = inputStyle();
  seriesRow.append(seriesLbl, seriesSel);
  wrap.appendChild(seriesRow);

  const gridWrap = doc.createElement("div");
  gridWrap.className = "ppt-scroll";
  gridWrap.style.cssText =
    "overflow:auto;max-height:220px;margin-bottom:8px;border:1px solid var(--border);border-radius:4px";
  wrap.appendChild(gridWrap);

  const syncSeriesOptions = (): void => {
    seriesSel.replaceChildren();
    series.forEach((s, i) => {
      const o = doc.createElement("option");
      o.value = String(i);
      o.textContent = s.name ?? `Series ${i + 1}`;
      seriesSel.appendChild(o);
    });
    seriesSel.value = String(Math.min(activeSeries, Math.max(0, series.length - 1)));
    activeSeries = Number(seriesSel.value);
  };

  const renderScatterGrid = (): void => {
    syncSeriesOptions();
    gridWrap.replaceChildren();
    const pts = points[activeSeries] ?? [];
    const table = doc.createElement("table");
    table.style.cssText = "border-collapse:collapse;width:100%;font-size:11px";
    const thead = doc.createElement("thead");
    const hr = doc.createElement("tr");
    for (const label of [t("inspector.chart.scatter.x"), t("inspector.chart.scatter.y"), ""]) {
      const th = doc.createElement("th");
      th.textContent = label;
      th.style.cssText =
        "padding:4px 6px;border-bottom:1px solid var(--border);background:var(--card);position:sticky;top:0;text-align:left";
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    pts.forEach((pt, pi) => {
      const tr = doc.createElement("tr");
      for (const key of ["x", "y"] as const) {
        const td = doc.createElement("td");
        td.style.cssText = "padding:2px;border-bottom:1px solid var(--border)";
        const num = doc.createElement("input");
        num.type = "number";
        num.step = "any";
        num.value = String(pt[key]);
        num.style.cssText = inputStyle();
        num.addEventListener("change", () => {
          const n = Number(num.value);
          const row = { ...points[activeSeries]![pi]! };
          row[key] = Number.isFinite(n) ? n : 0;
          const nextPts = [...(points[activeSeries] ?? [])];
          nextPts[pi] = row;
          points[activeSeries] = nextPts;
        });
        td.appendChild(num);
        tr.appendChild(td);
      }
      const delTd = doc.createElement("td");
      delTd.style.cssText = "padding:2px;border-bottom:1px solid var(--border)";
      if (pts.length > 1) {
        delTd.appendChild(
          mkBtn(doc, "×", () => {
            points[activeSeries] = (points[activeSeries] ?? []).filter((_, i) => i !== pi);
            renderScatterGrid();
          }),
        );
      }
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    gridWrap.appendChild(table);
  };

  seriesSel.addEventListener("change", () => {
    activeSeries = Number(seriesSel.value);
    renderScatterGrid();
  });

  renderScatterGrid();

  const toolRow = doc.createElement("div");
  toolRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px";
  toolRow.appendChild(
    mkBtn(doc, t("inspector.chart.scatter.addPoint"), () => {
      const pts = [...(points[activeSeries] ?? [])];
      const last = pts[pts.length - 1];
      pts.push({ x: (last?.x ?? 0) + 1, y: last?.y ?? 0 });
      points[activeSeries] = pts;
      renderScatterGrid();
    }),
  );
  toolRow.appendChild(
    mkBtn(doc, t("inspector.chart.addSeries"), () => {
      series.push({ name: `Series ${series.length + 1}`, values: [0] });
      points.push([{ x: 1, y: 0 }]);
      activeSeries = series.length - 1;
      renderScatterGrid();
    }),
  );
  if (series.length > 1) {
    toolRow.appendChild(
      mkBtn(doc, "× " + t("inspector.chart.scatter.removeSeries"), () => {
        series = series.filter((_, i) => i !== activeSeries);
        points = points.filter((_, i) => i !== activeSeries);
        activeSeries = Math.min(activeSeries, series.length - 1);
        renderScatterGrid();
      }),
    );
  }
  wrap.appendChild(toolRow);

  appendApplyButton(doc, wrap, () => {
    const next = buildScatterChartDef(def, series, points, titleInput.value, legendCb.checked);
    stack.execute(new SetChartDefCmd(slideIdx, shapeId, next));
    onApplied?.();
  });
}

function chartExInspector(
  doc: Document,
  wrap: HTMLElement,
  def: ChartDef & { type: ChartExType },
  slideIdx: number,
  shapeId: string,
  stack: CommandStack,
  onApplied?: () => void,
): void {
  const state = {
    categories: normalizeCategories(def),
    series: normalizeSeries(def, normalizeCategories(def).length),
  };
  state.series = normalizeSeries(def, state.categories.length);

  const typeRow = doc.createElement("div");
  typeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px";
  const typeLbl = doc.createElement("span");
  typeLbl.textContent = t("inspector.chart.type");
  typeLbl.style.cssText = "color:var(--muted-foreground);font-size:11px;min-width:52px";
  const typeVal = doc.createElement("span");
  typeVal.textContent = chartTypeLabel(def.type);
  typeVal.style.cssText = "font-size:11px";
  typeRow.append(typeLbl, typeVal);
  wrap.appendChild(typeRow);

  const note = doc.createElement("div");
  note.style.cssText = "color:var(--muted-foreground);font-size:11px;line-height:1.4;margin-bottom:8px";
  note.textContent = t("inspector.chart.chartExNote");
  wrap.appendChild(note);

  const { titleInput, legendCb } = appendTitleLegendRows(doc, wrap, def);
  appendCategoryGrid(doc, wrap, state);

  appendApplyButton(doc, wrap, () => {
    const next = buildChartExDef(def, state.categories, state.series, titleInput.value, legendCb.checked);
    stack.execute(new SetChartDefCmd(slideIdx, shapeId, next));
    onApplied?.();
  });
}

export function chartInspectorSection(
  doc: Document,
  shape: ChartShape,
  slideIdx: number,
  shapeId: string,
  stack: CommandStack,
  onApplied?: () => void,
): HTMLElement {
  const wrap = mkWrap(doc);
  const def = shape.chart;
  const chartType = def.type;

  if (def.type === "scatter" || def.type === "bubble") {
    scatterChartInspector(doc, wrap, def, slideIdx, shapeId, stack, onApplied);
    return wrap;
  }
  if (isChartEx(def)) {
    chartExInspector(doc, wrap, def, slideIdx, shapeId, stack, onApplied);
    return wrap;
  }
  if (isCategoryChart(def)) {
    categoryChartInspector(doc, wrap, def, slideIdx, shapeId, stack, onApplied);
    return wrap;
  }

  const note = doc.createElement("div");
  note.style.cssText = "color:var(--muted-foreground);font-size:11px;line-height:1.4";
  note.textContent = t("inspector.chart.unsupported", { type: chartType });
  wrap.appendChild(note);
  return wrap;
}
