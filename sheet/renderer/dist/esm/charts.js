export function renderCharts(sheet) {
    const host = document.createElement("div");
    host.className = "sheet-charts";
    for (const chart of sheet.charts ?? [])
        host.append(chartNode(sheet, chart));
    for (const spark of sheet.sparklines ?? [])
        host.append(sparkNode(sheet, spark));
    for (const shape of sheet.shapes ?? [])
        host.append(shapeNode(shape));
    for (const control of sheet.formControls ?? []) {
        const node = document.createElement("div");
        node.className = "sheet-form-control";
        node.dataset.kind = control.kind;
        node.textContent = control.label ?? control.kind;
        if (control.kind === "checkbox")
            node.textContent = `${control.checked ? "☑" : "☐"} ${control.label ?? ""}`;
        host.append(node);
    }
    for (const slicer of sheet.slicers ?? []) {
        const node = document.createElement("div");
        node.className = "sheet-slicer";
        node.textContent = `${slicer.name}: ${slicer.field}`;
        host.append(node);
    }
    for (const pivot of sheet.pivots ?? [])
        host.append(pivotNode(pivot));
    return host;
}
/** Reduces the first value field by row field, and by column field when one is set. */
export function summarizePivot(pivot) {
    const fields = pivot.fields ?? [];
    const rowAt = fields.indexOf(pivot.rows?.[0] ?? "");
    const colAt = fields.indexOf(pivot.columns?.[0] ?? "");
    const valueAt = fields.indexOf(pivot.values?.[0] ?? "");
    const agg = pivot.agg ?? "sum";
    if (rowAt < 0 || valueAt < 0)
        return { columns: [], rows: [] };
    const columns = [];
    const buckets = new Map();
    for (const row of pivot.cache ?? []) {
        const label = row[rowAt] ?? "";
        const column = colAt < 0 ? "" : (row[colAt] ?? "");
        if (colAt >= 0 && !columns.includes(column))
            columns.push(column);
        const cells = buckets.get(label) ?? new Map();
        const list = cells.get(column) ?? [];
        const value = Number(row[valueAt]);
        if (agg === "count" || Number.isFinite(value))
            list.push(agg === "count" ? 1 : value);
        cells.set(column, list);
        buckets.set(label, cells);
    }
    const heads = colAt < 0 ? [""] : columns;
    return {
        columns: colAt < 0 ? [] : columns,
        rows: [...buckets].map(([label, cells]) => ({
            label,
            values: heads.map((column) => reducePivot(cells.get(column) ?? [], agg)),
        })),
    };
}
function reducePivot(values, agg) {
    if (!values.length)
        return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return agg === "average" ? total / values.length : total;
}
function pivotNode(pivot) {
    const summary = summarizePivot(pivot);
    const node = document.createElement("table");
    node.className = "sheet-pivot";
    const caption = document.createElement("caption");
    caption.textContent = pivot.name;
    node.append(caption);
    if (summary.columns.length) {
        const head = document.createElement("tr");
        head.append(document.createElement("td"));
        for (const column of summary.columns) {
            const cell = document.createElement("td");
            cell.textContent = column;
            head.append(cell);
        }
        node.append(head);
    }
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
    return node;
}
function chartNode(sheet, chart) {
    const values = numbersFromRange(sheet, chart.range);
    const wrap = document.createElement("div");
    wrap.className = "sheet-chart";
    wrap.dataset.kind = chart.kind;
    const title = document.createElement("div");
    title.className = "sheet-chart-title";
    title.textContent = chart.title ?? chart.kind;
    wrap.append(title);
    if (chart.kind === "pie")
        wrap.append(pie(values));
    else if (chart.kind === "line" || chart.kind === "area" || chart.kind === "scatter")
        wrap.append(line(values, false));
    else
        wrap.append(bars(values, chart.kind === "bar"));
    return wrap;
}
function sparkNode(sheet, spark) {
    const values = numbersFromRange(sheet, spark.data);
    const node = document.createElement("div");
    node.className = "sheet-sparkline";
    node.dataset.kind = spark.kind;
    node.title = spark.location;
    node.append(spark.kind === "column" || spark.kind === "winLoss" ? bars(values, false, true) : line(values, true));
    return node;
}
function shapeNode(shape) {
    const node = document.createElement("div");
    node.className = "sheet-shape";
    node.dataset.kind = shape.kind;
    node.style.left = `${shape.x}px`;
    node.style.top = `${shape.y}px`;
    node.style.width = `${shape.w}px`;
    node.style.height = `${shape.h}px`;
    if (shape.fill)
        node.style.background = shape.fill;
    if (shape.stroke)
        node.style.borderColor = shape.stroke;
    if (shape.kind === "ellipse")
        node.style.borderRadius = "999px";
    if (shape.kind === "line" || shape.kind === "arrow") {
        node.style.height = "2px";
        node.style.background = shape.stroke ?? "#18181b";
    }
    node.textContent = shape.text ?? shape.kind;
    return node;
}
function bars(values, horizontal, compact = false) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const width = compact ? 80 : 220;
    const height = compact ? 24 : 120;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    const max = Math.max(...values.map((n) => Math.abs(n)), 1);
    const gap = 2;
    values.forEach((value, index) => {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        if (horizontal) {
            const row = (height - gap) / Math.max(values.length, 1);
            const w = (Math.abs(value) / max) * (width - 8);
            rect.setAttribute("x", "4");
            rect.setAttribute("y", String(index * row + gap / 2));
            rect.setAttribute("width", String(w));
            rect.setAttribute("height", String(Math.max(1, row - gap)));
        }
        else {
            const col = (width - gap) / Math.max(values.length, 1);
            const h = (Math.abs(value) / max) * (height - 8);
            rect.setAttribute("x", String(index * col + gap / 2));
            rect.setAttribute("y", String(height - 4 - h));
            rect.setAttribute("width", String(Math.max(1, col - gap)));
            rect.setAttribute("height", String(h));
        }
        rect.setAttribute("fill", value < 0 ? "#f87171" : "#4f46e5");
        svg.append(rect);
    });
    return svg;
}
function line(values, compact) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const width = compact ? 80 : 220;
    const height = compact ? 24 : 120;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    if (!values.length)
        return svg;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values
        .map((value, index) => {
        const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * (width - 4) + 2;
        const y = height - 2 - ((value - min) / span) * (height - 4);
        return `${x},${y}`;
    })
        .join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    path.setAttribute("points", points);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#4f46e5");
    path.setAttribute("stroke-width", "1.5");
    svg.append(path);
    return svg;
}
function pie(values) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("width", "120");
    svg.setAttribute("height", "120");
    const total = values.reduce((sum, n) => sum + Math.abs(n), 0) || 1;
    let angle = -Math.PI / 2;
    const colors = ["#4f46e5", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];
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
        path.setAttribute("fill", colors[index % colors.length]);
        svg.append(path);
    });
    return svg;
}
export function numbersFromRange(sheet, range) {
    const hit = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(range.trim());
    if (!hit)
        return [];
    const c1 = colIndex(hit[1]);
    const r1 = Number(hit[2]) - 1;
    const c2 = hit[3] ? colIndex(hit[3]) : c1;
    const r2 = hit[4] ? Number(hit[4]) - 1 : r1;
    const out = [];
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r += 1) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c += 1) {
            const n = Number(sheet.cells[r]?.[c]?.value ?? "");
            if (Number.isFinite(n))
                out.push(n);
        }
    }
    return out;
}
function colIndex(letters) {
    let index = 0;
    for (const ch of letters.toUpperCase())
        index = index * 26 + ch.charCodeAt(0) - 64;
    return index - 1;
}
