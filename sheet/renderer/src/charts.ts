import type { SheetChart, SheetPivot, SheetShape, SheetSparkline, Worksheet } from "@sliiu/sheet-core";

export function renderCharts(sheet: Worksheet): HTMLElement {
  const host = document.createElement("div");
  host.className = "sheet-charts";
  for (const chart of sheet.charts ?? []) host.append(chartNode(sheet, chart));
  for (const spark of sheet.sparklines ?? []) host.append(sparkNode(sheet, spark));
  for (const shape of sheet.shapes ?? []) host.append(shapeNode(shape));
  for (const control of sheet.formControls ?? []) {
    const node = document.createElement("div");
    node.className = "sheet-form-control";
    node.dataset.kind = control.kind;
    node.textContent = control.label ?? control.kind;
    if (control.kind === "checkbox") node.textContent = `${control.checked ? "☑" : "☐"} ${control.label ?? ""}`;
    host.append(node);
  }
  for (const slicer of sheet.slicers ?? []) host.append(slicerNode(sheet, slicer));
  for (const pivot of sheet.pivots ?? []) host.append(pivotNode(pivot));
  for (const map of sheet.xmlMaps ?? []) {
    const node = document.createElement("div");
    node.className = "sheet-xml-map";
    node.textContent = map.root ? `${map.name}: ${map.root}` : map.name;
    host.append(node);
  }
  return host;
}

/** The distinct values of the column the slicer's field names, in the order they appear. */
export function slicerValues(sheet: Worksheet, slicer: { field: string }): string[] {
  const headers = sheet.cells[0] ?? [];
  const column = headers.findIndex((cell) => cell?.value === slicer.field);
  if (column < 0) return [];
  const seen: string[] = [];
  for (let row = 1; row < sheet.cells.length; row += 1) {
    const value = sheet.cells[row]?.[column]?.value ?? "";
    if (value !== "" && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

function slicerNode(sheet: Worksheet, slicer: { name: string; field: string; values?: string[] }): HTMLElement {
  const node = document.createElement("div");
  node.className = "sheet-slicer";
  const title = document.createElement("div");
  title.className = "sheet-slicer-title";
  title.textContent = slicer.name;
  node.append(title);
  const values = slicerValues(sheet, slicer);
  for (const value of values.length ? values : (slicer.values ?? [])) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-slicer-item";
    button.dataset.value = value;
    button.textContent = value;
    // Nothing selected means every value shows, so every button starts pressed.
    if (!slicer.values || slicer.values.includes(value)) button.classList.add("is-on");
    node.append(button);
  }
  return node;
}

export interface PivotSummary {
  /** Column-field values. Empty when the pivot has no column field. */
  columns: string[];
  rows: { label: string; values: number[] }[];
  /** One total per column, taken over every row. Empty when there is nothing to add up. */
  totals: number[];
}

/** Reduces the first value field by row field, and by column field when one is set. */
export function summarizePivot(pivot: SheetPivot): PivotSummary {
  const fields = pivot.fields ?? [];
  const rowAt = fields.indexOf(pivot.rows?.[0] ?? "");
  const colAt = fields.indexOf(pivot.columns?.[0] ?? "");
  const valueAt = fields.indexOf(pivot.values?.[0] ?? "");
  const agg = pivot.agg ?? "sum";
  if (rowAt < 0 || valueAt < 0) return { columns: [], rows: [], totals: [] };
  const columns: string[] = [];
  const buckets = new Map<string, Map<string, number[]>>();
  for (const row of pivot.cache ?? []) {
    const label = row[rowAt] ?? "";
    const column = colAt < 0 ? "" : (row[colAt] ?? "");
    if (colAt >= 0 && !columns.includes(column)) columns.push(column);
    const cells = buckets.get(label) ?? new Map<string, number[]>();
    const list = cells.get(column) ?? [];
    const value = Number(row[valueAt]);
    if (agg === "count" || Number.isFinite(value)) list.push(agg === "count" ? 1 : value);
    cells.set(column, list);
    buckets.set(label, cells);
  }
  const heads = colAt < 0 ? [""] : columns;
  const rows = [...buckets].map(([label, cells]) => ({
    label,
    values: heads.map((column) => reducePivot(cells.get(column) ?? [], agg)),
  }));
  // A row total folds the row's own cells back together, so an average stays an average instead of a sum of averages.
  const withTotals = rows.map((row) => ({
    ...row,
    values: [...row.values, grandTotal(heads.map((column) => buckets.get(row.label)?.get(column) ?? []), agg)],
  }));
  const totals = heads.map((column) => grandTotal([...buckets.values()].map((cells) => cells.get(column) ?? []), agg));
  const grand = grandTotal([...buckets.values()].flatMap((cells) => [...cells.values()]), agg);
  return {
    columns: colAt < 0 ? [] : columns,
    rows: withTotals,
    totals: [...totals, grand],
  };
}

/** The total across groups. Sum, count, and product add the group results; max and min fold them. */
function grandTotal(groups: number[][], agg: NonNullable<SheetPivot["agg"]>): number {
  const flat = groups.flat();
  if (agg === "max" || agg === "min" || agg === "product") return reducePivot(flat, agg);
  const total = groups.reduce((sum, group) => sum + reducePivot(group, "sum"), 0);
  return agg === "average" ? total / (flat.length || 1) : total;
}

function reducePivot(values: number[], agg: NonNullable<SheetPivot["agg"]>): number {
  if (!values.length) return 0;
  if (agg === "max") return Math.max(...values);
  if (agg === "min") return Math.min(...values);
  if (agg === "product") return values.reduce((product, value) => product * value, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  return agg === "average" ? total / values.length : total;
}

function pivotNode(pivot: SheetPivot): HTMLElement {
  const summary = summarizePivot(pivot);
  const node = document.createElement("table");
  node.className = "sheet-pivot";
  const caption = document.createElement("caption");
  caption.textContent = pivot.name;
  node.append(caption);
  const head = document.createElement("tr");
  head.append(document.createElement("td"));
  for (const column of summary.columns) {
    const cell = document.createElement("td");
    cell.textContent = column;
    head.append(cell);
  }
  const corner = document.createElement("td");
  corner.textContent = "总计";
  head.append(corner);
  node.append(head);
  for (const item of summary.rows) {
    const line = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = item.label;
    line.append(label);
    for (const value of item.values) {
      const total = document.createElement("td");
      total.textContent = String(value);
      line.append(total);
    }
    node.append(line);
  }
  if (summary.totals.length) {
    const foot = document.createElement("tr");
    const label = document.createElement("td");
    label.textContent = "总计";
    foot.append(label);
    for (const value of summary.totals) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      foot.append(cell);
    }
    node.append(foot);
  }
  return node;
}

const SERIES = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

function chartNode(sheet: Worksheet, chart: SheetChart): HTMLElement {
  const ranges = chart.series?.length ? chart.series : [chart.range];
  const series = ranges.map((range) => numbersFromRange(sheet, range));
  const wrap = document.createElement("div");
  wrap.className = "sheet-chart";
  wrap.dataset.kind = chart.kind;
  wrap.dataset.series = String(series.length);
  const title = document.createElement("div");
  title.className = "sheet-chart-title";
  title.textContent = chart.title ?? chart.kind;
  wrap.append(title);
  if (chart.kind === "pie") wrap.append(pie(series[0] ?? []));
  else if (chart.kind === "line" || chart.kind === "area" || chart.kind === "scatter") wrap.append(line(series, false, chart.kind));
  else wrap.append(bars(series, chart.kind === "bar"));
  return wrap;
}

function sparkNode(sheet: Worksheet, spark: SheetSparkline): HTMLElement {
  const values = numbersFromRange(sheet, spark.data);
  const node = document.createElement("div");
  node.className = "sheet-sparkline";
  node.dataset.kind = spark.kind;
  node.title = spark.location;
  node.append(spark.kind === "winLoss" ? winLoss(values) : spark.kind === "column" ? bars([values], false, true) : line([values], true));
  return node;
}

function shapeNode(shape: SheetShape): HTMLElement {
  const node = document.createElement("div");
  node.className = "sheet-shape";
  node.dataset.kind = shape.kind;
  node.style.left = `${shape.x}px`;
  node.style.top = `${shape.y}px`;
  node.style.width = `${shape.w}px`;
  node.style.height = `${shape.h}px`;
  if (shape.fill) node.style.background = shape.fill;
  if (shape.stroke) node.style.borderColor = shape.stroke;
  if (shape.kind === "ellipse") node.style.borderRadius = "999px";
  if (shape.kind === "line" || shape.kind === "arrow") {
    node.style.height = "2px";
    node.style.background = shape.stroke ?? "#18181b";
  }
  node.textContent = shape.text ?? shape.kind;
  return node;
}

/** Win/loss ignores how large a value is: every point is the same height, above the middle when positive and below it when negative. */
function winLoss(values: number[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = 80;
  const height = 24;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const mid = height / 2;
  const col = width / Math.max(values.length, 1);
  values.forEach((value, index) => {
    if (value === 0) return;
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(index * col + 1));
    rect.setAttribute("y", String(value > 0 ? 2 : mid));
    rect.setAttribute("width", String(Math.max(1, col - 2)));
    rect.setAttribute("height", String(mid - 2));
    rect.setAttribute("fill", value > 0 ? "#4f46e5" : "#f87171");
    svg.append(rect);
  });
  return svg;
}

function bars(series: number[][], horizontal: boolean, compact = false): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = compact ? 80 : 220;
  const height = compact ? 24 : 120;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const max = Math.max(...series.flat().map((n) => Math.abs(n)), 1);
  const groups = Math.max(...series.map((values) => values.length), 1);
  const count = series.length;
  const gap = 2;
  series.forEach((values, seriesIndex) => {
    values.forEach((value, index) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      if (horizontal) {
        const row = (height - gap) / groups;
        const band = (row - gap) / count;
        const w = (Math.abs(value) / max) * (width - 8);
        rect.setAttribute("x", "4");
        rect.setAttribute("y", String(index * row + seriesIndex * band + gap / 2));
        rect.setAttribute("width", String(w));
        rect.setAttribute("height", String(Math.max(1, band - gap)));
      } else {
        const col = (width - gap) / groups;
        const band = (col - gap) / count;
        const h = (Math.abs(value) / max) * (height - 8);
        rect.setAttribute("x", String(index * col + seriesIndex * band + gap / 2));
        rect.setAttribute("y", String(height - 4 - h));
        rect.setAttribute("width", String(Math.max(1, band - gap)));
        rect.setAttribute("height", String(h));
      }
      rect.setAttribute("fill", value < 0 ? "#f87171" : SERIES[seriesIndex % SERIES.length]!);
      svg.append(rect);
    });
  });
  return svg;
}

function line(series: number[][], compact: boolean, mode: "line" | "area" | "scatter" = "line"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const width = compact ? 80 : 220;
  const height = compact ? 24 : 120;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  const flat = series.flat();
  if (!flat.length) return svg;
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const span = max - min || 1;
  series.forEach((values, seriesIndex) => {
    if (!values.length) return;
    const color = SERIES[seriesIndex % SERIES.length]!;
    const coords = values.map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 4) + 2;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return [x, y] as const;
    });
    drawSeries(svg, coords, color, mode, height);
  });
  return svg;
}

function drawSeries(svg: SVGSVGElement, coords: (readonly [number, number])[], color: string, mode: "line" | "area" | "scatter", height: number): void {
  // A scatter chart marks each point on its own; a line would invent an order the data does not have.
  if (mode === "scatter") {
    for (const [x, y] of coords) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", "2.5");
      dot.setAttribute("fill", color);
      svg.append(dot);
    }
    return;
  }
  const points = coords.map(([x, y]) => `${x},${y}`).join(" ");
  if (mode === "area") {
    const [first] = coords;
    const last = coords[coords.length - 1];
    const fill = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    fill.setAttribute("points", `${points} ${last?.[0] ?? 0},${height - 2} ${first?.[0] ?? 0},${height - 2}`);
    fill.setAttribute("fill", color);
    fill.setAttribute("fill-opacity", "0.25");
    fill.setAttribute("stroke", "none");
    svg.append(fill);
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  path.setAttribute("points", points);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "1.5");
  svg.append(path);
}

function pie(values: number[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("width", "120");
  svg.setAttribute("height", "120");
  const total = values.reduce((sum, n) => sum + Math.abs(n), 0) || 1;
  let angle = -Math.PI / 2;
  values.forEach((value, index) => {
    const slice = (Math.abs(value) / total) * Math.PI * 2;
    const x1 = 60 + Math.cos(angle) * 50;
    const y1 = 60 + Math.sin(angle) * 50;
    angle += slice;
    const x2 = 60 + Math.cos(angle) * 50;
    const y2 = 60 + Math.sin(angle) * 50;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const large = slice > Math.PI ? 1 : 0;
    path.setAttribute("d", `M60,60 L${x1},${y1} A50,50 0 ${large} 1 ${x2},${y2} Z`);
    path.setAttribute("fill", SERIES[index % SERIES.length]!);
    svg.append(path);
  });
  return svg;
}

export function numbersFromRange(sheet: Worksheet, range: string): number[] {
  const hit = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(range.trim());
  if (!hit) return [];
  const c1 = colIndex(hit[1]!);
  const r1 = Number(hit[2]) - 1;
  const c2 = hit[3] ? colIndex(hit[3]) : c1;
  const r2 = hit[4] ? Number(hit[4]) - 1 : r1;
  const out: number[] = [];
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) {
      const n = Number(sheet.cells[r]?.[c]?.value ?? "");
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

function colIndex(letters: string): number {
  let index = 0;
  for (const ch of letters.toUpperCase()) index = index * 26 + ch.charCodeAt(0) - 64;
  return index - 1;
}
