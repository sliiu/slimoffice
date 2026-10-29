"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderChart = renderChart;
const chart_ex_render_1 = require("./chart-ex-render");
const chart_geom_1 = require("./chart-geom");
/** Text / line colours of the chart being drawn; set once per `renderChart` (drawing is synchronous). */
let ts = (0, chart_geom_1.chartTextStyle)({});
const SVG_NS = "http://www.w3.org/2000/svg";
function poly(g, pts, fill) {
    const p = document.createElementNS(SVG_NS, "polygon");
    p.setAttribute("points", pts);
    p.setAttribute("fill", fill);
    g.appendChild(p);
}
function appendExtrudedRect(g, x, y, w, h, color, off) {
    if (off && (off.dx || off.dy) && w > 0 && h > 0) {
        const { dx, dy } = off;
        poly(g, `${x},${y} ${x + dx},${y + dy} ${x + w + dx},${y + dy} ${x + w},${y}`, (0, chart_geom_1.shadeHex)(color, 1.18));
        poly(g, `${x + w},${y} ${x + w + dx},${y + dy} ${x + w + dx},${y + h + dy} ${x + w},${y + h}`, (0, chart_geom_1.shadeHex)(color, 0.72));
    }
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(w));
    rect.setAttribute("height", String(h));
    rect.setAttribute("fill", color);
    g.appendChild(rect);
}
function renderChart(g, shape) {
    while (g.firstChild)
        g.removeChild(g.firstChild);
    ts = (0, chart_geom_1.chartTextStyle)(shape.chart);
    const { x, y, w, h } = shape.bbox;
    const padTop = shape.chart.title ? 28 : 8;
    const pads = (0, chart_geom_1.chartPadding)(shape.chart, ts.size);
    const padBottom = pads.bottom;
    const padLeft = 40;
    const padRight = 12;
    if (shape.chart.title) {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", String(x + w / 2));
        t.setAttribute("y", String(y + 18));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size", String(ts.size + 1));
        t.setAttribute("font-weight", "600");
        t.setAttribute("fill", ts.text);
        t.textContent = shape.chart.title;
        g.appendChild(t);
    }
    const plot = {
        x: x + padLeft,
        y: y + padTop,
        w: w - padLeft - padRight,
        h: h - padTop - padBottom,
    };
    const def = shape.chart;
    if (hasCombo(def)) {
        drawCombo(g, def, plot);
    }
    else {
        switch (def.type) {
            case "bar":
            case "column":
                drawBar(g, def, plot);
                break;
            case "line":
                drawLine(g, def, plot);
                break;
            case "pie":
            case "doughnut":
                drawPie(g, def, plot);
                break;
            case "area":
                drawArea(g, def, plot);
                break;
            case "scatter":
                drawScatter(g, def, plot);
                break;
            case "bubble":
                drawBubble(g, def, plot);
                break;
            case "radar":
                drawRadar(g, def, plot);
                break;
            case "stock":
                drawStock(g, def, plot);
                break;
            case "surface":
                drawSurface(g, def, plot);
                break;
            case "sunburst":
                drawSunburst(g, def, plot);
                break;
            case "treemap":
                drawTreemap(g, def, plot);
                break;
            case "waterfall":
                drawWaterfall(g, def, plot);
                break;
            case "funnel":
                drawFunnel(g, def, plot);
                break;
            case "pareto":
                drawPareto(g, def, plot);
                break;
            case "histogram":
                drawHistogram(g, def, plot);
                break;
            case "boxWhisker":
                drawBoxWhisker(g, def, plot);
                break;
            case "region":
                drawRegion(g, def, plot);
                break;
            default:
                drawChartExFallback(g, def, plot);
                break;
        }
    }
    if (!hasCombo(def))
        overlayGuides(g, def, plot);
    overlayDataLabels(g, def, plot);
    if (def.legend)
        drawLegend(g, def, { x, y: y + h - pads.legend, w, h: pads.legend });
}
function drawAxes(g, plot, ticks, categories, isBar) {
    const min = ticks[0];
    const max = ticks[ticks.length - 1];
    const xAxis = document.createElementNS(SVG_NS, "line");
    xAxis.setAttribute("x1", String(plot.x));
    xAxis.setAttribute("y1", String(plot.y + plot.h));
    xAxis.setAttribute("x2", String(plot.x + plot.w));
    xAxis.setAttribute("y2", String(plot.y + plot.h));
    xAxis.setAttribute("stroke", ts.axis);
    g.appendChild(xAxis);
    const yAxis = document.createElementNS(SVG_NS, "line");
    yAxis.setAttribute("x1", String(plot.x));
    yAxis.setAttribute("y1", String(plot.y));
    yAxis.setAttribute("x2", String(plot.x));
    yAxis.setAttribute("y2", String(plot.y + plot.h));
    yAxis.setAttribute("stroke", ts.axis);
    g.appendChild(yAxis);
    // barDir="bar" (§21.2.2.17) turns the value axis along the bottom: ticks run left→right with
    // vertical gridlines, and the left edge belongs to the category labels.
    for (const t of ticks) {
        const f = (t - min) / (max - min);
        const grid = document.createElementNS(SVG_NS, "line");
        const lab = document.createElementNS(SVG_NS, "text");
        if (isBar) {
            const nx = plot.x + f * plot.w;
            grid.setAttribute("x1", String(nx));
            grid.setAttribute("y1", String(plot.y));
            grid.setAttribute("x2", String(nx));
            grid.setAttribute("y2", String(plot.y + plot.h));
            lab.setAttribute("x", String(nx));
            lab.setAttribute("y", String(plot.y + plot.h + 14));
            lab.setAttribute("text-anchor", "middle");
        }
        else {
            const ny = plot.y + plot.h - f * plot.h;
            grid.setAttribute("x1", String(plot.x));
            grid.setAttribute("y1", String(ny));
            grid.setAttribute("x2", String(plot.x + plot.w));
            grid.setAttribute("y2", String(ny));
            lab.setAttribute("x", String(plot.x - 6));
            lab.setAttribute("y", String(ny + 3));
            lab.setAttribute("text-anchor", "end");
        }
        grid.setAttribute("stroke", ts.grid);
        g.appendChild(grid);
        lab.setAttribute("font-size", String(ts.size));
        lab.setAttribute("fill", ts.muted);
        lab.textContent = String(t);
        g.appendChild(lab);
    }
    if (!isBar) {
        const step = categories.length > 0 ? plot.w / categories.length : 0;
        categories.forEach((c, i) => {
            const lab = document.createElementNS(SVG_NS, "text");
            lab.setAttribute("x", String(plot.x + step * (i + 0.5)));
            lab.setAttribute("y", String(plot.y + plot.h + 14));
            lab.setAttribute("text-anchor", "middle");
            lab.setAttribute("font-size", String(ts.size));
            lab.setAttribute("fill", ts.muted);
            lab.textContent = c;
            g.appendChild(lab);
        });
    }
    else {
        const step = categories.length > 0 ? plot.h / categories.length : 0;
        categories.forEach((c, i) => {
            const lab = document.createElementNS(SVG_NS, "text");
            lab.setAttribute("x", String(plot.x - 6));
            lab.setAttribute("y", String(plot.y + step * (i + 0.5) + 3));
            lab.setAttribute("text-anchor", "end");
            lab.setAttribute("font-size", String(ts.size));
            lab.setAttribute("fill", ts.muted);
            lab.textContent = c;
            g.appendChild(lab);
        });
    }
}
function drawChartExFallback(g, def, plot) {
    const categories = def.categories?.length
        ? def.categories
        : Array.from({ length: Math.max(1, def.series[0]?.values.length ?? 1) }, (_, i) => `Cat ${i + 1}`);
    const series = def.series.length > 0
        ? def.series
        : [{ name: "Series 1", values: categories.map(() => 0) }];
    const fallback = {
        type: "column",
        title: def.title,
        categories,
        series,
        legend: def.legend,
        colors: def.colors,
        varyColors: def.varyColors ?? true,
    };
    drawBar(g, fallback, plot);
}
function drawTreemap(g, def, plot) {
    const slices = (0, chart_ex_render_1.normalizeChartExSlices)(def);
    for (const cell of (0, chart_ex_render_1.layoutTreemap)(slices, plot)) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(cell.x));
        rect.setAttribute("y", String(cell.y));
        rect.setAttribute("width", String(cell.w));
        rect.setAttribute("height", String(cell.h));
        rect.setAttribute("fill", cell.color);
        rect.setAttribute("stroke", "#ffffff");
        rect.setAttribute("stroke-width", "1.5");
        g.appendChild(rect);
        if (cell.w > 36 && cell.h > 18) {
            const t = document.createElementNS(SVG_NS, "text");
            t.setAttribute("x", String(cell.x + 6));
            t.setAttribute("y", String(cell.y + 14));
            t.setAttribute("font-size", String(ts.size));
            t.setAttribute("fill", "#f8fafc");
            t.textContent = cell.label;
            g.appendChild(t);
        }
    }
}
function drawSunburst(g, def, plot) {
    const slices = (0, chart_ex_render_1.normalizeChartExSlices)(def);
    for (const arc of (0, chart_ex_render_1.layoutSunburst)(slices, plot)) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", (0, chart_ex_render_1.sunburstArcPath)(arc));
        path.setAttribute("fill", arc.color);
        path.setAttribute("stroke", "#ffffff");
        path.setAttribute("stroke-width", "1");
        g.appendChild(path);
    }
}
function drawWaterfall(g, def, plot) {
    const slices = (0, chart_ex_render_1.normalizeChartExSlices)(def, { preserveSign: true });
    const bars = (0, chart_ex_render_1.layoutWaterfall)(slices, plot);
    for (const bar of bars) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(bar.x));
        rect.setAttribute("y", String(bar.y));
        rect.setAttribute("width", String(bar.w));
        rect.setAttribute("height", String(bar.h));
        rect.setAttribute("fill", bar.kind === "decrease" ? "#E15759" : bar.color);
        rect.setAttribute("rx", "2");
        g.appendChild(rect);
    }
    for (let i = 0; i < bars.length - 1; i++) {
        const a = bars[i];
        const b = bars[i + 1];
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(a.x + a.w));
        line.setAttribute("y1", String(a.y));
        line.setAttribute("x2", String(b.x));
        line.setAttribute("y2", String(b.y));
        line.setAttribute("stroke", ts.axis);
        line.setAttribute("stroke-dasharray", "3 2");
        g.appendChild(line);
    }
}
function drawFunnel(g, def, plot) {
    const slices = (0, chart_ex_render_1.normalizeChartExSlices)(def);
    for (const seg of (0, chart_ex_render_1.layoutFunnel)(slices, plot)) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", (0, chart_ex_render_1.polygonPath)(seg.points));
        path.setAttribute("fill", seg.color);
        path.setAttribute("stroke", "#ffffff");
        path.setAttribute("stroke-width", "1.5");
        g.appendChild(path);
        const cx = seg.points.reduce((s, p) => s + p[0], 0) / seg.points.length;
        const cy = seg.points.reduce((s, p) => s + p[1], 0) / seg.points.length;
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", String(cx));
        t.setAttribute("y", String(cy + 4));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size", String(ts.size));
        t.setAttribute("fill", "#f8fafc");
        t.textContent = seg.label;
        g.appendChild(t);
    }
}
function drawColumnBars(g, bars) {
    for (const bar of bars) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(bar.x));
        rect.setAttribute("y", String(bar.y));
        rect.setAttribute("width", String(bar.w));
        rect.setAttribute("height", String(bar.h));
        rect.setAttribute("fill", bar.color);
        rect.setAttribute("rx", "2");
        g.appendChild(rect);
    }
}
function drawPareto(g, def, plot) {
    const { bars, line } = (0, chart_ex_render_1.layoutPareto)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot);
    drawColumnBars(g, bars);
    if (line.length >= 2) {
        const path = document.createElementNS(SVG_NS, "polyline");
        path.setAttribute("points", line.map((p) => `${p[0]},${p[1]}`).join(" "));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#E15759");
        path.setAttribute("stroke-width", "2");
        g.appendChild(path);
        for (const [x, y] of line) {
            const dot = document.createElementNS(SVG_NS, "circle");
            dot.setAttribute("cx", String(x));
            dot.setAttribute("cy", String(y));
            dot.setAttribute("r", "3");
            dot.setAttribute("fill", "#E15759");
            g.appendChild(dot);
        }
    }
}
function drawHistogram(g, def, plot) {
    drawColumnBars(g, (0, chart_ex_render_1.layoutHistogram)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot));
}
function drawBoxWhisker(g, def, plot) {
    for (const box of (0, chart_ex_render_1.layoutBoxWhisker)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot)) {
        const whisker = document.createElementNS(SVG_NS, "line");
        whisker.setAttribute("x1", String(box.cx));
        whisker.setAttribute("y1", String(box.whiskerLow));
        whisker.setAttribute("x2", String(box.cx));
        whisker.setAttribute("y2", String(box.whiskerHigh));
        whisker.setAttribute("stroke", "#374151");
        whisker.setAttribute("stroke-width", "1");
        g.appendChild(whisker);
        const capW = box.boxW * 0.5;
        for (const y of [box.whiskerLow, box.whiskerHigh]) {
            const cap = document.createElementNS(SVG_NS, "line");
            cap.setAttribute("x1", String(box.cx - capW / 2));
            cap.setAttribute("x2", String(box.cx + capW / 2));
            cap.setAttribute("y1", String(y));
            cap.setAttribute("y2", String(y));
            cap.setAttribute("stroke", "#374151");
            g.appendChild(cap);
        }
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(box.cx - box.boxW / 2));
        rect.setAttribute("y", String(Math.min(box.q1, box.q3)));
        rect.setAttribute("width", String(box.boxW));
        rect.setAttribute("height", String(Math.abs(box.q3 - box.q1)));
        rect.setAttribute("fill", box.color);
        rect.setAttribute("fill-opacity", "0.75");
        g.appendChild(rect);
        const med = document.createElementNS(SVG_NS, "line");
        med.setAttribute("x1", String(box.cx - box.boxW / 2));
        med.setAttribute("x2", String(box.cx + box.boxW / 2));
        med.setAttribute("y1", String(box.median));
        med.setAttribute("y2", String(box.median));
        med.setAttribute("stroke", "#1f2937");
        med.setAttribute("stroke-width", "2");
        g.appendChild(med);
    }
}
function drawRegion(g, def, plot) {
    for (const row of (0, chart_ex_render_1.layoutRegion)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot)) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(row.x));
        rect.setAttribute("y", String(row.y));
        rect.setAttribute("width", String(row.w));
        rect.setAttribute("height", String(row.h));
        rect.setAttribute("fill", row.color);
        rect.setAttribute("rx", "2");
        g.appendChild(rect);
        if (row.h > 14) {
            const t = document.createElementNS(SVG_NS, "text");
            t.setAttribute("x", String(row.x + 6));
            t.setAttribute("y", String(row.y + row.h / 2 + 4));
            t.setAttribute("font-size", String(ts.size));
            t.setAttribute("fill", "#f8fafc");
            t.textContent = row.label;
            g.appendChild(t);
        }
    }
}
function drawBar(g, def, plot, shared) {
    const cats = def.categories ?? [];
    const series = def.series;
    const { isHoriz, stacked, ticks, tmin, tmax, groupStep, inner, barW, totals } = (0, chart_geom_1.barGeometry)(def, plot, shared?.ticks);
    if (!shared?.skipAxes)
        drawAxes(g, plot, ticks, cats, isHoriz);
    const extrude = (0, chart_geom_1.chart3DOffset)(def);
    for (let ci = 0; ci < cats.length; ci++) {
        let stackPos = 0;
        let stackNeg = 0;
        for (let si = 0; si < series.length; si++) {
            let v = series[si].values[ci] ?? 0;
            if (def.percentStacked)
                v = (totals[ci] ?? 0) > 0 ? v / totals[ci] : 0;
            const color = series[si].color ?? "#3b82f6";
            if (isHoriz) {
                const x0 = plot.x + ((Math.min(0, tmin) - tmin) / (tmax - tmin)) * plot.w;
                const len = (Math.abs(v) / (tmax - tmin)) * plot.w;
                const yCat = plot.y + groupStep * ci + (groupStep - inner) / 2;
                const ySub = stacked ? yCat : yCat + si * barW;
                const left = stacked
                    ? plot.x + ((v >= 0 ? stackPos : stackNeg) - tmin) / (tmax - tmin) * plot.w
                    : x0 - (v < 0 ? len : 0);
                appendExtrudedRect(g, v >= 0 ? left : left - len, ySub, len, barW, color, extrude);
            }
            else {
                const xCat = plot.x + groupStep * ci + (groupStep - inner) / 2;
                const xSub = stacked ? xCat : xCat + si * barW;
                const baseY = plot.y + plot.h - ((0 - tmin) / (tmax - tmin)) * plot.h;
                const h = (Math.abs(v) / (tmax - tmin)) * plot.h;
                const yBar = stacked
                    ? plot.y + plot.h - (((v >= 0 ? stackPos : stackNeg) + (v >= 0 ? v : 0) - tmin) / (tmax - tmin)) * plot.h
                    : v >= 0
                        ? baseY - h
                        : baseY;
                appendExtrudedRect(g, xSub, yBar, barW, h, color, extrude);
            }
            if (v >= 0)
                stackPos += v;
            else
                stackNeg += v;
        }
    }
}
function drawLine(g, def, plot, shared) {
    const cats = def.categories ?? [];
    let yMin = 0;
    let yMax = 1;
    for (const s of def.series) {
        for (const v of s.values) {
            if (v > yMax)
                yMax = v;
            if (v < yMin)
                yMin = v;
        }
    }
    ({ yMin, yMax } = (0, chart_geom_1.applyValueAxisScale)(yMin, yMax, def));
    const ticks = shared?.ticks ?? (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    if (!shared?.skipAxes)
        drawAxes(g, plot, ticks, cats, false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const step = (cats.length > 1 ? plot.w / (cats.length - 1) : plot.w) || plot.w;
    const extrude = (0, chart_geom_1.chart3DOffset)(def);
    const layers = extrude && (extrude.dx || extrude.dy) ? 5 : 1;
    for (const s of def.series) {
        const pts = s.values.map((v, i) => {
            const xx = plot.x + step * (cats.length > 1 ? i : 0.5);
            const yy = plot.y + plot.h - ((v - tmin) / (tmax - tmin)) * plot.h;
            return { x: xx, y: yy };
        });
        if (pts.length === 0)
            continue;
        const color = s.color ?? "#3b82f6";
        for (let layer = layers - 1; layer >= 0; layer--) {
            const t = layers === 1 ? 0 : layer / (layers - 1);
            const ox = extrude ? extrude.dx * t : 0;
            const oy = extrude ? extrude.dy * t : 0;
            const path = document.createElementNS(SVG_NS, "polyline");
            path.setAttribute("points", pts.map((p) => `${p.x + ox},${p.y + oy}`).join(" "));
            path.setAttribute("fill", "none");
            path.setAttribute("stroke", layer === 0 ? color : (0, chart_geom_1.shadeHex)(color, 0.55 + 0.08 * (1 - t)));
            path.setAttribute("stroke-width", layer === 0 ? "2" : "3");
            g.appendChild(path);
        }
        if (def.markers) {
            for (const p of pts) {
                const c = document.createElementNS(SVG_NS, "circle");
                c.setAttribute("cx", String(p.x));
                c.setAttribute("cy", String(p.y));
                c.setAttribute("r", "3");
                c.setAttribute("fill", color);
                g.appendChild(c);
            }
        }
    }
}
function drawPie(g, def, plot) {
    const s0 = def.series[0];
    if (!s0)
        return;
    const total = s0.values.reduce((a, b) => a + Math.abs(b), 0);
    if (total === 0)
        return;
    const cx0 = plot.x + plot.w / 2;
    const cy0 = plot.y + plot.h / 2;
    const r = Math.min(plot.w, plot.h) / 2 - 4;
    const innerR = def.type === "doughnut" ? r * (def.holeRatio ?? 0.5) : 0;
    const palette = s0.perSliceColors ?? def.colors ?? [];
    const explode = ((s0.explosion ?? 0) / 100) * r;
    const off = (0, chart_geom_1.chart3DOffset)(def);
    const layers = off && (off.dx || off.dy) ? 6 : 1;
    for (let layer = layers - 1; layer >= 0; layer--) {
        const t = layers === 1 ? 0 : layer / (layers - 1);
        const ox = off ? off.dx * t : 0;
        const oy = off ? off.dy * t : 0;
        const shade = layer === 0 ? 1 : 0.55 + 0.08 * (1 - t);
        let start = -Math.PI / 2 + ((def.startAngle ?? 0) * Math.PI) / 180;
        for (let i = 0; i < s0.values.length; i++) {
            const v = Math.abs(s0.values[i]);
            const frac = v / total;
            if (frac <= 0)
                continue;
            const end = start + frac * Math.PI * 2;
            const mid = (start + end) / 2;
            const cx = cx0 + ox + Math.cos(mid) * explode;
            const cy = cy0 + oy + Math.sin(mid) * explode;
            const color = palette[i] ?? s0.color ?? "#3b82f6";
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", pieSlicePath(cx, cy, r, innerR, start, end));
            path.setAttribute("fill", shade === 1 ? color : (0, chart_geom_1.shadeHex)(color, shade));
            g.appendChild(path);
            start = end;
        }
    }
}
function pieSlicePath(cx, cy, r, ir, a0, a1) {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;
    if (ir <= 0) {
        return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
    }
    const ix0 = cx + Math.cos(a0) * ir;
    const iy0 = cy + Math.sin(a0) * ir;
    const ix1 = cx + Math.cos(a1) * ir;
    const iy1 = cy + Math.sin(a1) * ir;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${large} 0 ${ix0} ${iy0} Z`;
}
function drawArea(g, def, plot, shared) {
    const cats = def.categories ?? [];
    let yMin = 0;
    let yMax = 1;
    for (const s of def.series)
        for (const v of s.values) {
            if (v > yMax)
                yMax = v;
            if (v < yMin)
                yMin = v;
        }
    ({ yMin, yMax } = (0, chart_geom_1.applyValueAxisScale)(yMin, yMax, def));
    const ticks = shared?.ticks ?? (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    if (!shared?.skipAxes)
        drawAxes(g, plot, ticks, cats, false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const step = (cats.length > 1 ? plot.w / (cats.length - 1) : plot.w);
    const baseY = plot.y + plot.h - ((0 - tmin) / (tmax - tmin)) * plot.h;
    const extrude = (0, chart_geom_1.chart3DOffset)(def);
    const layers = extrude && (extrude.dx || extrude.dy) ? 5 : 1;
    for (const s of def.series) {
        const pts = s.values.map((v, i) => {
            const xx = plot.x + step * i;
            const yy = plot.y + plot.h - ((v - tmin) / (tmax - tmin)) * plot.h;
            return [xx, yy];
        });
        if (pts.length < 2)
            continue;
        const color = s.color ?? "#3b82f6";
        for (let layer = layers - 1; layer >= 0; layer--) {
            const t = layers === 1 ? 0 : layer / (layers - 1);
            const ox = extrude ? extrude.dx * t : 0;
            const oy = extrude ? extrude.dy * t : 0;
            const d = [
                `M ${pts[0][0] + ox} ${baseY + oy}`,
                ...pts.map((p) => `L ${p[0] + ox} ${p[1] + oy}`),
                `L ${pts[pts.length - 1][0] + ox} ${baseY + oy}`,
                "Z",
            ].join(" ");
            const path = document.createElementNS(SVG_NS, "path");
            path.setAttribute("d", d);
            path.setAttribute("fill", layer === 0 ? color : (0, chart_geom_1.shadeHex)(color, 0.55 + 0.08 * (1 - t)));
            path.setAttribute("fill-opacity", layer === 0 ? "0.5" : "0.35");
            if (layer === 0) {
                path.setAttribute("stroke", color);
                path.setAttribute("stroke-width", "1.5");
            }
            g.appendChild(path);
        }
    }
}
function drawScatter(g, def, plot) {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const series of def.points) {
        for (const p of series) {
            if (p.x < xMin)
                xMin = p.x;
            if (p.x > xMax)
                xMax = p.x;
            if (p.y < yMin)
                yMin = p.y;
            if (p.y > yMax)
                yMax = p.y;
        }
    }
    if (!Number.isFinite(xMin))
        return;
    const ticks = (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    drawAxes(g, plot, ticks, [], false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    for (let si = 0; si < def.points.length; si++) {
        const pts = def.points[si];
        const color = def.series[si]?.color ?? "#3b82f6";
        for (const p of pts) {
            const cx = plot.x + ((p.x - xMin) / (xMax - xMin || 1)) * plot.w;
            const cy = plot.y + plot.h - ((p.y - tmin) / (tmax - tmin)) * plot.h;
            const c = document.createElementNS(SVG_NS, "circle");
            c.setAttribute("cx", String(cx));
            c.setAttribute("cy", String(cy));
            c.setAttribute("r", "3");
            c.setAttribute("fill", color);
            g.appendChild(c);
        }
    }
}
function hasCombo(def) {
    return def.series.some((s) => s.chartType && s.chartType !== def.type);
}
function drawCombo(g, def, plot) {
    const cats = def.categories ?? [];
    let yMin = 0;
    let yMax = 1;
    for (const s of def.series) {
        for (const v of s.values) {
            if (v > yMax)
                yMax = v;
            if (v < yMin)
                yMin = v;
        }
        if (s.chartType === "scatter" || s.chartType === "bubble") {
            for (const p of (0, chart_geom_1.seriesXyPoints)(def, s)) {
                if (p.y > yMax)
                    yMax = p.y;
                if (p.y < yMin)
                    yMin = p.y;
            }
        }
    }
    ({ yMin, yMax } = (0, chart_geom_1.applyValueAxisScale)(yMin, yMax, def));
    const ticks = (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    drawAxes(g, plot, ticks, cats, def.type === "bar");
    const groups = new Map();
    for (const s of def.series) {
        const ty = s.chartType ?? def.type;
        const list = groups.get(ty) ?? [];
        list.push(s);
        groups.set(ty, list);
    }
    const order = ["area", "bar", "column", "stock", "radar", "scatter", "bubble", "line"];
    const keys = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const shared = { ticks, skipAxes: true };
    for (const ty of keys) {
        const series = groups.get(ty);
        if (ty === "bar" || ty === "column") {
            drawBar(g, { ...def, type: ty, series }, plot, shared);
        }
        else if (ty === "area" || ty === "surface") {
            drawArea(g, { ...def, type: "area", series }, plot, shared);
        }
        else if (ty === "scatter" || ty === "bubble") {
            drawComboXy(g, def, series, plot, ticks, ty === "bubble");
        }
        else {
            drawLine(g, { ...def, type: "line", series }, plot, shared);
        }
    }
    overlayGuides(g, def, plot, ticks);
}
function svgLine(g, x1, y1, x2, y2, stroke, width = 1) {
    const el = document.createElementNS(SVG_NS, "line");
    el.setAttribute("x1", String(x1));
    el.setAttribute("y1", String(y1));
    el.setAttribute("x2", String(x2));
    el.setAttribute("y2", String(y2));
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", String(width));
    g.appendChild(el);
}
function drawRadar(g, def, plot) {
    const cats = def.categories ?? [];
    const n = Math.max(cats.length, 1);
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    const r = Math.min(plot.w, plot.h) / 2 - 8;
    let max = 1;
    for (const s of def.series)
        for (const v of s.values)
            if (v > max)
                max = v;
    for (let ring = 1; ring <= 4; ring++) {
        const pts = [];
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const rr = (r * ring) / 4;
            pts.push(`${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`);
        }
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", pts.join(" "));
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", ts.grid);
        g.appendChild(poly);
    }
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        svgLine(g, cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, ts.grid);
        if (cats[i]) {
            const t = document.createElementNS(SVG_NS, "text");
            t.setAttribute("x", String(cx + Math.cos(a) * (r + 12)));
            t.setAttribute("y", String(cy + Math.sin(a) * (r + 12) + 3));
            t.setAttribute("text-anchor", "middle");
            t.setAttribute("font-size", String(ts.size));
            t.setAttribute("fill", ts.muted);
            t.textContent = cats[i];
            g.appendChild(t);
        }
    }
    const filled = def.radarStyle === "filled";
    for (const s of def.series) {
        const pts = [];
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const rr = r * ((s.values[i] ?? 0) / max);
            pts.push(`${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`);
        }
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", pts.join(" "));
        poly.setAttribute("fill", filled ? (s.color ?? "#3b82f6") : "none");
        if (filled)
            poly.setAttribute("fill-opacity", "0.25");
        poly.setAttribute("stroke", s.color ?? "#3b82f6");
        poly.setAttribute("stroke-width", "2");
        g.appendChild(poly);
        if (def.radarStyle !== "standard") {
            for (const pt of pts) {
                const [px, py] = pt.split(",").map(Number);
                const c = document.createElementNS(SVG_NS, "circle");
                c.setAttribute("cx", String(px));
                c.setAttribute("cy", String(py));
                c.setAttribute("r", "3");
                c.setAttribute("fill", s.color ?? "#3b82f6");
                g.appendChild(c);
            }
        }
    }
}
function drawBubble(g, def, plot) {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    let zMax = 1;
    for (const series of def.points) {
        for (const p of series) {
            if (p.x < xMin)
                xMin = p.x;
            if (p.x > xMax)
                xMax = p.x;
            if (p.y < yMin)
                yMin = p.y;
            if (p.y > yMax)
                yMax = p.y;
            if ((p.z ?? 1) > zMax)
                zMax = p.z ?? 1;
        }
    }
    if (!Number.isFinite(xMin))
        return;
    const ticks = (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    drawAxes(g, plot, ticks, [], false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const rMax = Math.min(plot.w, plot.h) * 0.08;
    for (let si = 0; si < def.points.length; si++) {
        const color = def.series[si]?.color ?? "#3b82f6";
        for (const p of def.points[si]) {
            const cx = plot.x + ((p.x - xMin) / (xMax - xMin || 1)) * plot.w;
            const cy = plot.y + plot.h - ((p.y - tmin) / (tmax - tmin)) * plot.h;
            const rr = Math.max(3, rMax * Math.sqrt((p.z ?? 1) / zMax));
            const c = document.createElementNS(SVG_NS, "circle");
            c.setAttribute("cx", String(cx));
            c.setAttribute("cy", String(cy));
            c.setAttribute("r", String(rr));
            c.setAttribute("fill", color);
            c.setAttribute("fill-opacity", "0.55");
            g.appendChild(c);
        }
    }
}
function drawStock(g, def, plot) {
    const cats = def.categories ?? [];
    const n = def.series.length;
    if (n < 3) {
        drawLine(g, { ...def, type: "line" }, plot);
        return;
    }
    const high = def.series[n >= 4 ? n - 3 : 0];
    const low = def.series[n >= 4 ? n - 2 : 1];
    const close = def.series[n >= 4 ? n - 1 : 2];
    const open = n >= 4 ? def.series[n - 4] : undefined;
    let yMin = 0;
    let yMax = 1;
    for (const s of [high, low, close, open]) {
        if (!s)
            continue;
        for (const v of s.values) {
            if (v > yMax)
                yMax = v;
            if (v < yMin)
                yMin = v;
        }
    }
    const ticks = (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    drawAxes(g, plot, ticks, cats, false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const step = plot.w / Math.max(cats.length, 1);
    const yOf = (v) => plot.y + plot.h - ((v - tmin) / (tmax - tmin)) * plot.h;
    for (let i = 0; i < cats.length; i++) {
        const x = plot.x + step * (i + 0.5);
        svgLine(g, x, yOf(high.values[i] ?? 0), x, yOf(low.values[i] ?? 0), ts.text, 1.25);
        svgLine(g, x, yOf(close.values[i] ?? 0), x + step * 0.18, yOf(close.values[i] ?? 0), ts.text, 1.25);
        if (open) {
            const ov = open.values[i] ?? 0;
            svgLine(g, x - step * 0.18, yOf(ov), x, yOf(ov), ts.text, 1.25);
        }
    }
}
function drawLegend(g, def, area) {
    const items = [];
    if (def.type === "pie" || def.type === "doughnut") {
        const s0 = def.series[0];
        if (s0) {
            const palette = s0.perSliceColors ?? def.colors ?? [];
            (def.categories ?? []).forEach((c, i) => {
                items.push({ name: c || `Item ${i + 1}`, color: palette[i] ?? s0.color ?? "#3b82f6" });
            });
        }
    }
    else {
        for (const s of def.series)
            items.push({ name: s.name ?? "Series", color: s.color ?? "#3b82f6" });
    }
    let x = area.x + 12;
    const y = area.y + 6;
    for (const it of items) {
        const sw = document.createElementNS(SVG_NS, "rect");
        sw.setAttribute("x", String(x));
        sw.setAttribute("y", String(y));
        sw.setAttribute("width", "10");
        sw.setAttribute("height", "10");
        sw.setAttribute("fill", it.color);
        g.appendChild(sw);
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", String(x + 14));
        t.setAttribute("y", String(y + 9));
        t.setAttribute("font-size", String(ts.size));
        t.setAttribute("fill", ts.muted);
        t.textContent = it.name;
        g.appendChild(t);
        x += (0, chart_geom_1.estimateTextWidth)(it.name, ts.size) + 22 + 8;
    }
}
function drawSurface(g, def, plot) {
    for (const q of (0, chart_geom_1.surfaceIsoQuads)(def, plot)) {
        if (q.pts.length < 3)
            continue;
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", q.pts.map((p) => `${p.x},${p.y}`).join(" "));
        if (q.stroke) {
            poly.setAttribute("fill", "none");
            poly.setAttribute("stroke", q.color);
            poly.setAttribute("stroke-width", "1");
        }
        else {
            poly.setAttribute("fill", q.color);
            poly.setAttribute("fill-opacity", "0.72");
            poly.setAttribute("stroke", "rgba(255,255,255,0.45)");
            poly.setAttribute("stroke-width", "0.6");
        }
        g.appendChild(poly);
    }
}
function drawComboXy(g, def, series, plot, ticks, bubble) {
    const cats = def.categories ?? [];
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const xsAll = series.flatMap((s) => (0, chart_geom_1.seriesXyPoints)(def, s).map((p) => p.x));
    for (const s of series) {
        const pts = (0, chart_geom_1.seriesXyPoints)(def, s);
        for (const p of pts) {
            const cx = (0, chart_geom_1.comboXyPlotX)(p.x, cats, plot, xsAll);
            const cy = plot.y + plot.h - ((p.y - tmin) / (tmax - tmin || 1)) * plot.h;
            const r = bubble ? Math.max(3, Math.min(16, (p.z ?? 1) * 1.8)) : 3.5;
            const c = document.createElementNS(SVG_NS, "circle");
            c.setAttribute("cx", String(cx));
            c.setAttribute("cy", String(cy));
            c.setAttribute("r", String(r));
            c.setAttribute("fill", s.color ?? "#3b82f6");
            if (bubble)
                c.setAttribute("fill-opacity", "0.7");
            g.appendChild(c);
        }
    }
}
function overlayGuides(g, def, plot, ticksIn) {
    if (def.type === "pie" ||
        def.type === "doughnut" ||
        def.type === "surface" ||
        def.type === "radar" ||
        def.type === "sunburst" ||
        def.type === "treemap" ||
        def.type === "funnel" ||
        def.type === "region") {
        return;
    }
    const cats = def.categories ?? [];
    let yMin = 0;
    let yMax = 1;
    for (const s of def.series) {
        for (const v of s.values) {
            if (v > yMax)
                yMax = v;
            if (v < yMin)
                yMin = v;
        }
        if (s.errorBars?.val) {
            for (const v of s.values) {
                if (v + s.errorBars.val > yMax)
                    yMax = v + s.errorBars.val;
                if (v - s.errorBars.val < yMin)
                    yMin = v - s.errorBars.val;
            }
        }
    }
    ({ yMin, yMax } = (0, chart_geom_1.applyValueAxisScale)(yMin, yMax, def));
    const ticks = ticksIn ?? (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const yOf = (v) => plot.y + plot.h - ((v - tmin) / (tmax - tmin || 1)) * plot.h;
    const step = cats.length > 1 ? plot.w / (cats.length - 1) : plot.w;
    for (const s of def.series) {
        const ty = s.chartType ?? def.type;
        const color = s.color ?? ts.muted;
        if (ty === "scatter" || ty === "bubble") {
            const pts = (0, chart_geom_1.seriesXyPoints)(def, s);
            if (s.trendline) {
                const fit = (0, chart_geom_1.linearFit)(pts.map((p) => p.x), pts.map((p) => p.y));
                if (fit && pts.length >= 2) {
                    const xs = pts.map((p) => p.x);
                    const x0 = Math.min(...xs);
                    const x1 = Math.max(...xs);
                    const xAt = (xv) => (0, chart_geom_1.comboXyPlotX)(xv, cats, plot, xs);
                    const line = document.createElementNS(SVG_NS, "line");
                    line.setAttribute("x1", String(xAt(x0)));
                    line.setAttribute("y1", String(yOf(fit.a + fit.b * x0)));
                    line.setAttribute("x2", String(xAt(x1)));
                    line.setAttribute("y2", String(yOf(fit.a + fit.b * x1)));
                    line.setAttribute("stroke", color);
                    line.setAttribute("stroke-width", "1.25");
                    line.setAttribute("stroke-dasharray", "5 3");
                    g.appendChild(line);
                }
            }
            continue;
        }
        if (s.errorBars) {
            const half = s.errorBars.val ?? 0;
            s.values.forEach((v, i) => {
                const xx = plot.x + step * i;
                svgLine(g, xx, yOf(v - half), xx, yOf(v + half), color, 1);
                svgLine(g, xx - 3, yOf(v - half), xx + 3, yOf(v - half), color, 1);
                svgLine(g, xx - 3, yOf(v + half), xx + 3, yOf(v + half), color, 1);
            });
        }
        if (s.trendline) {
            const xs = s.values.map((_, i) => i);
            const fit = (0, chart_geom_1.linearFit)(xs, s.values);
            if (fit && xs.length >= 2) {
                const line = document.createElementNS(SVG_NS, "line");
                line.setAttribute("x1", String(plot.x));
                line.setAttribute("y1", String(yOf(fit.a)));
                line.setAttribute("x2", String(plot.x + step * (s.values.length - 1)));
                line.setAttribute("y2", String(yOf(fit.a + fit.b * (s.values.length - 1))));
                line.setAttribute("stroke", color);
                line.setAttribute("stroke-width", "1.25");
                line.setAttribute("stroke-dasharray", "5 3");
                g.appendChild(line);
            }
        }
    }
}
function overlayDataLabels(g, def, plot) {
    const add = (x, y, text, anchor = "middle", baseline = "bottom") => {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", String(x));
        // SVG text is placed by its alphabetic baseline; shift for the other two.
        t.setAttribute("y", String(baseline === "middle" ? y + ts.size * 0.35 : baseline === "top" ? y + ts.size : y));
        t.setAttribute("text-anchor", anchor);
        t.setAttribute("font-size", String(ts.size));
        t.setAttribute("fill", ts.text);
        t.textContent = text;
        g.appendChild(t);
    };
    // Clustered / stacked bars: label each bar at its own free end, in the bar renderer's geometry.
    if ((def.type === "column" || def.type === "bar") && !hasCombo(def)) {
        const geo = (0, chart_geom_1.barGeometry)(def, plot);
        const cats = def.categories ?? [];
        for (let ci = 0; ci < cats.length; ci++) {
            let stackPos = 0;
            let stackNeg = 0;
            def.series.forEach((s, si) => {
                let v = s.values[ci] ?? 0;
                if (def.percentStacked)
                    v = (geo.totals[ci] ?? 0) > 0 ? v / geo.totals[ci] : 0;
                const label = (0, chart_geom_1.pointLabelText)(def, s, ci, s.values[ci] ?? 0);
                if (label) {
                    const a = (0, chart_geom_1.barLabelAnchor)(geo, plot, si, ci, v, v >= 0 ? stackPos : stackNeg);
                    add(a.x, a.y, label, a.anchor, a.baseline);
                }
                if (v >= 0)
                    stackPos += v;
                else
                    stackNeg += v;
            });
        }
        return;
    }
    if (def.type === "pie" || def.type === "doughnut") {
        const s0 = def.series[0];
        if (!s0)
            return;
        const total = s0.values.reduce((a, b) => a + Math.abs(b), 0);
        if (!total)
            return;
        const cx0 = plot.x + plot.w / 2;
        const cy0 = plot.y + plot.h / 2;
        const r = Math.min(plot.w, plot.h) / 2 - 4;
        let start = -Math.PI / 2 + ((def.startAngle ?? 0) * Math.PI) / 180;
        for (let i = 0; i < s0.values.length; i++) {
            const v = Math.abs(s0.values[i]);
            const frac = v / total;
            if (frac <= 0)
                continue;
            const end = start + frac * Math.PI * 2;
            const mid = (start + end) / 2;
            const label = (0, chart_geom_1.pointLabelText)(def, s0, i, s0.values[i]);
            if (label)
                add(cx0 + Math.cos(mid) * r * 0.62, cy0 + Math.sin(mid) * r * 0.62, label);
            start = end;
        }
        return;
    }
    const cats = def.categories ?? [];
    const step = cats.length > 1 ? plot.w / (cats.length - 1) : plot.w;
    let yMin = 0;
    let yMax = 1;
    for (const s of def.series)
        for (const v of s.values) {
            if (v > yMax)
                yMax = v;
            if (v < yMin)
                yMin = v;
        }
    ({ yMin, yMax } = (0, chart_geom_1.applyValueAxisScale)(yMin, yMax, def));
    const ticks = (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const yOf = (v) => plot.y + plot.h - ((v - tmin) / (tmax - tmin || 1)) * plot.h;
    for (const s of def.series) {
        const ty = s.chartType ?? def.type;
        if (ty === "scatter" || ty === "bubble") {
            const pts = (0, chart_geom_1.seriesXyPoints)(def, s);
            const xs = pts.map((p) => p.x);
            pts.forEach((p, i) => {
                const label = (0, chart_geom_1.pointLabelText)(def, s, i, p.y);
                if (label)
                    add((0, chart_geom_1.comboXyPlotX)(p.x, cats, plot, xs), yOf(p.y) - 4, label);
            });
            continue;
        }
        s.values.forEach((v, i) => {
            const label = (0, chart_geom_1.pointLabelText)(def, s, i, v);
            if (!label)
                return;
            const xx = plot.x + step * (cats.length > 1 ? i : 0.5);
            add(xx, yOf(v) - 3, label);
        });
    }
}
