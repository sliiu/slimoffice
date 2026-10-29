"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawChartCanvas = drawChartCanvas;
const chart_ex_render_1 = require("./chart-ex-render");
const chart_geom_1 = require("./chart-geom");
/** Text / line colours of the chart being drawn; set once per `drawChartCanvas` (drawing is synchronous). */
let ts = (0, chart_geom_1.chartTextStyle)({});
function drawChartCanvas(ctx, shape) {
    const { x, y, w, h } = shape.bbox;
    const def = shape.chart;
    ts = (0, chart_geom_1.chartTextStyle)(def);
    const padTop = def.title ? 28 : 8;
    const pads = (0, chart_geom_1.chartPadding)(def, ts.size);
    const padBottom = pads.bottom;
    const padLeft = 40;
    const padRight = 12;
    ctx.save();
    ctx.fillStyle = ts.text;
    if (def.title) {
        ctx.font = `600 ${ts.size + 1}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        ctx.fillText(def.title, x + w / 2, y + 6);
    }
    const plot = {
        x: x + padLeft,
        y: y + padTop,
        w: w - padLeft - padRight,
        h: h - padTop - padBottom,
    };
    if (hasCombo(def)) {
        drawCombo(ctx, def, plot);
    }
    else {
        switch (def.type) {
            case "bar":
            case "column":
                drawBar(ctx, def, plot);
                break;
            case "line":
                drawLine(ctx, def, plot);
                break;
            case "pie":
            case "doughnut":
                drawPie(ctx, def, plot);
                break;
            case "area":
                drawArea(ctx, def, plot);
                break;
            case "scatter":
                drawScatter(ctx, def, plot);
                break;
            case "bubble":
                drawBubble(ctx, def, plot);
                break;
            case "radar":
                drawRadar(ctx, def, plot);
                break;
            case "stock":
                drawStock(ctx, def, plot);
                break;
            case "surface":
                drawSurface(ctx, def, plot);
                break;
            case "sunburst":
                drawSunburst(ctx, def, plot);
                break;
            case "treemap":
                drawTreemap(ctx, def, plot);
                break;
            case "waterfall":
                drawWaterfall(ctx, def, plot);
                break;
            case "funnel":
                drawFunnel(ctx, def, plot);
                break;
            case "pareto":
                drawPareto(ctx, def, plot);
                break;
            case "histogram":
                drawHistogram(ctx, def, plot);
                break;
            case "boxWhisker":
                drawBoxWhisker(ctx, def, plot);
                break;
            case "region":
                drawRegion(ctx, def, plot);
                break;
            default:
                drawChartExFallback(ctx, def, plot);
                break;
        }
    }
    if (!hasCombo(def))
        overlayGuides(ctx, def, plot);
    overlayDataLabels(ctx, def, plot);
    if (def.legend)
        drawLegend(ctx, def, { x, y: y + h - pads.legend, w, h: pads.legend });
    ctx.restore();
}
function drawAxes(ctx, plot, ticks, categories, isBar) {
    const min = ticks[0];
    const max = ticks[ticks.length - 1];
    ctx.strokeStyle = ts.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y + plot.h);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.h);
    ctx.stroke();
    ctx.font = `${ts.size}px sans-serif`;
    ctx.fillStyle = ts.muted;
    // barDir="bar" (§21.2.2.17) turns the value axis along the bottom: ticks run left→right with
    // vertical gridlines, and the left edge belongs to the category labels.
    ctx.textBaseline = isBar ? "top" : "middle";
    ctx.textAlign = isBar ? "center" : "right";
    for (const t of ticks) {
        const f = (t - min) / (max - min);
        ctx.strokeStyle = ts.grid;
        ctx.beginPath();
        if (isBar) {
            const nx = plot.x + f * plot.w;
            ctx.moveTo(nx, plot.y);
            ctx.lineTo(nx, plot.y + plot.h);
            ctx.stroke();
            ctx.fillText(String(t), nx, plot.y + plot.h + 4);
        }
        else {
            const ny = plot.y + plot.h - f * plot.h;
            ctx.moveTo(plot.x, ny);
            ctx.lineTo(plot.x + plot.w, ny);
            ctx.stroke();
            ctx.fillText(String(t), plot.x - 6, ny);
        }
    }
    if (!isBar && categories.length > 0) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const step = plot.w / categories.length;
        categories.forEach((c, i) => {
            ctx.fillText(c, plot.x + step * (i + 0.5), plot.y + plot.h + 4);
        });
    }
    else if (isBar && categories.length > 0) {
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        const step = plot.h / categories.length;
        categories.forEach((c, i) => {
            ctx.fillText(c, plot.x - 6, plot.y + step * (i + 0.5));
        });
    }
}
function drawChartExFallback(ctx, def, plot) {
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
    drawBar(ctx, fallback, plot);
}
function drawTreemap(ctx, def, plot) {
    for (const cell of (0, chart_ex_render_1.layoutTreemap)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot)) {
        ctx.fillStyle = cell.color;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
        if (cell.w > 36 && cell.h > 18) {
            ctx.fillStyle = "#f8fafc";
            ctx.font = `${ts.size}px sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(cell.label, cell.x + 6, cell.y + 4);
        }
    }
}
function drawSunburst(ctx, def, plot) {
    for (const arc of (0, chart_ex_render_1.layoutSunburst)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot)) {
        ctx.beginPath();
        ctx.arc(arc.cx, arc.cy, arc.r1, arc.a0, arc.a1);
        ctx.arc(arc.cx, arc.cy, arc.r0, arc.a1, arc.a0, true);
        ctx.closePath();
        ctx.fillStyle = arc.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
function drawWaterfall(ctx, def, plot) {
    const bars = (0, chart_ex_render_1.layoutWaterfall)((0, chart_ex_render_1.normalizeChartExSlices)(def, { preserveSign: true }), plot);
    for (const bar of bars) {
        ctx.fillStyle = bar.kind === "decrease" ? "#E15759" : bar.color;
        ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    }
    ctx.strokeStyle = ts.axis;
    ctx.setLineDash([3, 2]);
    for (let i = 0; i < bars.length - 1; i++) {
        const a = bars[i];
        const b = bars[i + 1];
        ctx.beginPath();
        ctx.moveTo(a.x + a.w, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
    }
    ctx.setLineDash([]);
}
function drawFunnel(ctx, def, plot) {
    for (const seg of (0, chart_ex_render_1.layoutFunnel)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot)) {
        ctx.beginPath();
        const [first, ...rest] = seg.points;
        ctx.moveTo(first[0], first[1]);
        for (const p of rest)
            ctx.lineTo(p[0], p[1]);
        ctx.closePath();
        ctx.fillStyle = seg.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const cx = seg.points.reduce((s, p) => s + p[0], 0) / seg.points.length;
        const cy = seg.points.reduce((s, p) => s + p[1], 0) / seg.points.length;
        ctx.fillStyle = "#f8fafc";
        ctx.font = `${ts.size}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(seg.label, cx, cy);
    }
}
function fillExtrudedRect(ctx, x, y, w, h, color, off) {
    if (off && (off.dx || off.dy) && w > 0 && h > 0) {
        const { dx, dy } = off;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.lineTo(x + w + dx, y + dy);
        ctx.lineTo(x + w, y);
        ctx.closePath();
        ctx.fillStyle = (0, chart_geom_1.shadeHex)(color, 1.18);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w + dx, y + dy);
        ctx.lineTo(x + w + dx, y + h + dy);
        ctx.lineTo(x + w, y + h);
        ctx.closePath();
        ctx.fillStyle = (0, chart_geom_1.shadeHex)(color, 0.72);
        ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
}
function drawColumnBarsCanvas(ctx, bars) {
    for (const bar of bars) {
        ctx.fillStyle = bar.color;
        ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
    }
}
function drawPareto(ctx, def, plot) {
    const { bars, line } = (0, chart_ex_render_1.layoutPareto)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot);
    drawColumnBarsCanvas(ctx, bars);
    if (line.length >= 2) {
        ctx.strokeStyle = "#E15759";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(line[0][0], line[0][1]);
        for (let i = 1; i < line.length; i++)
            ctx.lineTo(line[i][0], line[i][1]);
        ctx.stroke();
        ctx.fillStyle = "#E15759";
        for (const [x, y] of line) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
function drawHistogram(ctx, def, plot) {
    drawColumnBarsCanvas(ctx, (0, chart_ex_render_1.layoutHistogram)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot));
}
function drawBoxWhisker(ctx, def, plot) {
    for (const box of (0, chart_ex_render_1.layoutBoxWhisker)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot)) {
        ctx.strokeStyle = "#374151";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(box.cx, box.whiskerLow);
        ctx.lineTo(box.cx, box.whiskerHigh);
        ctx.stroke();
        const capW = box.boxW * 0.5;
        for (const y of [box.whiskerLow, box.whiskerHigh]) {
            ctx.beginPath();
            ctx.moveTo(box.cx - capW / 2, y);
            ctx.lineTo(box.cx + capW / 2, y);
            ctx.stroke();
        }
        ctx.fillStyle = box.color;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(box.cx - box.boxW / 2, Math.min(box.q1, box.q3), box.boxW, Math.abs(box.q3 - box.q1));
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#1f2937";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(box.cx - box.boxW / 2, box.median);
        ctx.lineTo(box.cx + box.boxW / 2, box.median);
        ctx.stroke();
    }
}
function drawRegion(ctx, def, plot) {
    for (const row of (0, chart_ex_render_1.layoutRegion)((0, chart_ex_render_1.normalizeChartExSlices)(def), plot)) {
        ctx.fillStyle = row.color;
        ctx.fillRect(row.x, row.y, row.w, row.h);
        if (row.h > 14) {
            ctx.fillStyle = "#f8fafc";
            ctx.font = `${ts.size}px sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(row.label, row.x + 6, row.y + row.h / 2);
        }
    }
}
function drawBar(ctx, def, plot, shared) {
    const cats = def.categories ?? [];
    const { isHoriz, stacked, ticks, tmin, tmax, groupStep, inner, barW, totals } = (0, chart_geom_1.barGeometry)(def, plot, shared?.ticks);
    if (!shared?.skipAxes)
        drawAxes(ctx, plot, ticks, cats, isHoriz);
    const extrude = (0, chart_geom_1.chart3DOffset)(def);
    for (let ci = 0; ci < cats.length; ci++) {
        let stackPos = 0;
        let stackNeg = 0;
        for (let si = 0; si < def.series.length; si++) {
            let v = def.series[si].values[ci] ?? 0;
            if (def.percentStacked)
                v = (totals[ci] ?? 0) > 0 ? v / totals[ci] : 0;
            const color = def.series[si].color ?? "#3b82f6";
            if (isHoriz) {
                const x0 = plot.x + ((Math.min(0, tmin) - tmin) / (tmax - tmin)) * plot.w;
                const len = (Math.abs(v) / (tmax - tmin)) * plot.w;
                const yCat = plot.y + groupStep * ci + (groupStep - inner) / 2;
                const ySub = stacked ? yCat : yCat + si * barW;
                const left = stacked
                    ? plot.x + ((v >= 0 ? stackPos : stackNeg) - tmin) / (tmax - tmin) * plot.w
                    : x0 - (v < 0 ? len : 0);
                fillExtrudedRect(ctx, v >= 0 ? left : left - len, ySub, len, barW, color, extrude);
            }
            else {
                const xCat = plot.x + groupStep * ci + (groupStep - inner) / 2;
                const xSub = stacked ? xCat : xCat + si * barW;
                const baseY = plot.y + plot.h - ((0 - tmin) / (tmax - tmin)) * plot.h;
                const hBar = (Math.abs(v) / (tmax - tmin)) * plot.h;
                const yBar = stacked
                    ? plot.y + plot.h - (((v >= 0 ? stackPos : stackNeg) + (v >= 0 ? v : 0) - tmin) / (tmax - tmin)) * plot.h
                    : v >= 0
                        ? baseY - hBar
                        : baseY;
                fillExtrudedRect(ctx, xSub, yBar, barW, hBar, color, extrude);
            }
            if (v >= 0)
                stackPos += v;
            else
                stackNeg += v;
        }
    }
}
function drawLine(ctx, def, plot, shared) {
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
        drawAxes(ctx, plot, ticks, cats, false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const step = cats.length > 1 ? plot.w / (cats.length - 1) : plot.w;
    const extrude = (0, chart_geom_1.chart3DOffset)(def);
    const layers = extrude && (extrude.dx || extrude.dy) ? 5 : 1;
    for (const s of def.series) {
        const pts = [];
        s.values.forEach((v, i) => {
            const xx = plot.x + step * (cats.length > 1 ? i : 0.5);
            const yy = plot.y + plot.h - ((v - tmin) / (tmax - tmin)) * plot.h;
            pts.push({ x: xx, y: yy });
        });
        const color = s.color ?? "#3b82f6";
        for (let layer = layers - 1; layer >= 0; layer--) {
            const t = layers === 1 ? 0 : layer / (layers - 1);
            const ox = extrude ? extrude.dx * t : 0;
            const oy = extrude ? extrude.dy * t : 0;
            ctx.strokeStyle = layer === 0 ? color : (0, chart_geom_1.shadeHex)(color, 0.55 + 0.08 * (1 - t));
            ctx.lineWidth = layer === 0 ? 2 : 3;
            ctx.beginPath();
            pts.forEach((p, i) => {
                if (i === 0)
                    ctx.moveTo(p.x + ox, p.y + oy);
                else
                    ctx.lineTo(p.x + ox, p.y + oy);
            });
            ctx.stroke();
        }
        if (def.markers) {
            ctx.fillStyle = color;
            for (const p of pts) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}
function fillPieSlice(ctx, cx, cy, r, ir, start, end, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ir <= 0)
        ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    if (ir > 0)
        ctx.arc(cx, cy, ir, end, start, true);
    ctx.closePath();
    ctx.fill();
}
function drawPie(ctx, def, plot) {
    const s0 = def.series[0];
    if (!s0)
        return;
    const total = s0.values.reduce((a, b) => a + Math.abs(b), 0);
    if (total === 0)
        return;
    const cx0 = plot.x + plot.w / 2;
    const cy0 = plot.y + plot.h / 2;
    const r = Math.min(plot.w, plot.h) / 2 - 4;
    const ir = def.type === "doughnut" ? r * (def.holeRatio ?? 0.5) : 0;
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
            fillPieSlice(ctx, cx, cy, r, ir, start, end, shade === 1 ? color : (0, chart_geom_1.shadeHex)(color, shade));
            start = end;
        }
    }
}
function drawArea(ctx, def, plot, shared) {
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
        drawAxes(ctx, plot, ticks, cats, false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const step = cats.length > 1 ? plot.w / (cats.length - 1) : plot.w;
    const baseY = plot.y + plot.h - ((0 - tmin) / (tmax - tmin)) * plot.h;
    const extrude = (0, chart_geom_1.chart3DOffset)(def);
    const layers = extrude && (extrude.dx || extrude.dy) ? 5 : 1;
    for (const s of def.series) {
        if (s.values.length < 2)
            continue;
        const color = s.color ?? "#3b82f6";
        const pts = s.values.map((v, i) => {
            const xx = plot.x + step * i;
            const yy = plot.y + plot.h - ((v - tmin) / (tmax - tmin)) * plot.h;
            return { x: xx, y: yy };
        });
        for (let layer = layers - 1; layer >= 0; layer--) {
            const t = layers === 1 ? 0 : layer / (layers - 1);
            const ox = extrude ? extrude.dx * t : 0;
            const oy = extrude ? extrude.dy * t : 0;
            ctx.fillStyle = layer === 0 ? color : (0, chart_geom_1.shadeHex)(color, 0.55 + 0.08 * (1 - t));
            ctx.globalAlpha = layer === 0 ? 0.5 : 0.35;
            ctx.beginPath();
            ctx.moveTo(pts[0].x + ox, baseY + oy);
            for (const p of pts)
                ctx.lineTo(p.x + ox, p.y + oy);
            ctx.lineTo(pts[pts.length - 1].x + ox, baseY + oy);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach((p, i) => {
            if (i === 0)
                ctx.moveTo(p.x, p.y);
            else
                ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
    }
}
function drawScatter(ctx, def, plot) {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const series of def.points)
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
    if (!Number.isFinite(xMin))
        return;
    const ticks = (0, chart_geom_1.niceTicks)(yMin, yMax, 5);
    drawAxes(ctx, plot, ticks, [], false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    for (let si = 0; si < def.points.length; si++) {
        const color = def.series[si]?.color ?? "#3b82f6";
        ctx.fillStyle = color;
        for (const p of def.points[si]) {
            const cx = plot.x + ((p.x - xMin) / (xMax - xMin || 1)) * plot.w;
            const cy = plot.y + plot.h - ((p.y - tmin) / (tmax - tmin)) * plot.h;
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
function hasCombo(def) {
    return def.series.some((s) => s.chartType && s.chartType !== def.type);
}
function drawCombo(ctx, def, plot) {
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
    drawAxes(ctx, plot, ticks, cats, def.type === "bar");
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
            drawBar(ctx, { ...def, type: ty, series }, plot, shared);
        }
        else if (ty === "area" || ty === "surface") {
            drawArea(ctx, { ...def, type: "area", series }, plot, shared);
        }
        else if (ty === "scatter" || ty === "bubble") {
            drawComboXy(ctx, def, series, plot, ticks, ty === "bubble");
        }
        else {
            drawLine(ctx, { ...def, type: "line", series }, plot, shared);
        }
    }
    overlayGuides(ctx, def, plot, ticks);
}
function drawRadar(ctx, def, plot) {
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
    ctx.strokeStyle = ts.grid;
    ctx.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring++) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const rr = (r * ring) / 4;
            const x = cx + Math.cos(a) * rr;
            const y = cy + Math.sin(a) * rr;
            if (i === 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
    ctx.fillStyle = ts.muted;
    ctx.font = `${ts.size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
        const lx = cx + Math.cos(a) * (r + 12);
        const ly = cy + Math.sin(a) * (r + 12);
        if (cats[i])
            ctx.fillText(cats[i], lx, ly);
    }
    const filled = def.radarStyle === "filled";
    for (const s of def.series) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const rr = r * ((s.values[i] ?? 0) / max);
            const x = cx + Math.cos(a) * rr;
            const y = cy + Math.sin(a) * rr;
            if (i === 0)
                ctx.moveTo(x, y);
            else
                ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = s.color ?? "#3b82f6";
        ctx.lineWidth = 2;
        if (filled) {
            ctx.fillStyle = s.color ?? "#3b82f6";
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.stroke();
        if (def.radarStyle !== "standard") {
            ctx.fillStyle = s.color ?? "#3b82f6";
            for (let i = 0; i < n; i++) {
                const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
                const rr = r * ((s.values[i] ?? 0) / max);
                ctx.beginPath();
                ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}
function drawBubble(ctx, def, plot) {
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
    drawAxes(ctx, plot, ticks, [], false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const rMax = Math.min(plot.w, plot.h) * 0.08;
    for (let si = 0; si < def.points.length; si++) {
        const color = def.series[si]?.color ?? "#3b82f6";
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.55;
        for (const p of def.points[si]) {
            const cx = plot.x + ((p.x - xMin) / (xMax - xMin || 1)) * plot.w;
            const cy = plot.y + plot.h - ((p.y - tmin) / (tmax - tmin)) * plot.h;
            const rr = Math.max(3, rMax * Math.sqrt((p.z ?? 1) / zMax));
            ctx.beginPath();
            ctx.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}
function drawStock(ctx, def, plot) {
    const cats = def.categories ?? [];
    const n = def.series.length;
    if (n < 3) {
        drawLine(ctx, { ...def, type: "line" }, plot);
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
    drawAxes(ctx, plot, ticks, cats, false);
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const step = plot.w / Math.max(cats.length, 1);
    const yOf = (v) => plot.y + plot.h - ((v - tmin) / (tmax - tmin)) * plot.h;
    ctx.strokeStyle = ts.text;
    ctx.lineWidth = 1.25;
    for (let i = 0; i < cats.length; i++) {
        const x = plot.x + step * (i + 0.5);
        const hi = high.values[i] ?? 0;
        const lo = low.values[i] ?? 0;
        const cl = close.values[i] ?? 0;
        ctx.beginPath();
        ctx.moveTo(x, yOf(hi));
        ctx.lineTo(x, yOf(lo));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, yOf(cl));
        ctx.lineTo(x + step * 0.18, yOf(cl));
        ctx.stroke();
        if (open) {
            ctx.beginPath();
            ctx.moveTo(x - step * 0.18, yOf(open.values[i] ?? 0));
            ctx.lineTo(x, yOf(open.values[i] ?? 0));
            ctx.stroke();
        }
    }
}
function drawLegend(ctx, def, area) {
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
    const y = area.y + 4;
    ctx.font = `${ts.size}px sans-serif`;
    ctx.fillStyle = ts.muted;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.fillRect(x, y, 10, 10);
        ctx.fillStyle = ts.muted;
        ctx.fillText(it.name, x + 14, y);
        x += ctx.measureText(it.name).width + 22 + 8;
    }
}
function drawSurface(ctx, def, plot) {
    for (const q of (0, chart_geom_1.surfaceIsoQuads)(def, plot)) {
        if (q.pts.length < 3)
            continue;
        ctx.beginPath();
        ctx.moveTo(q.pts[0].x, q.pts[0].y);
        for (let i = 1; i < q.pts.length; i++)
            ctx.lineTo(q.pts[i].x, q.pts[i].y);
        ctx.closePath();
        if (q.stroke) {
            ctx.strokeStyle = q.color;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        else {
            ctx.fillStyle = q.color;
            ctx.globalAlpha = 0.72;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.45)";
            ctx.lineWidth = 0.6;
            ctx.stroke();
        }
    }
}
function drawComboXy(ctx, def, series, plot, ticks, bubble) {
    const cats = def.categories ?? [];
    const tmin = ticks[0];
    const tmax = ticks[ticks.length - 1];
    const xs = series.flatMap((s) => (0, chart_geom_1.seriesXyPoints)(def, s).map((p) => p.x));
    for (const s of series) {
        const pts = (0, chart_geom_1.seriesXyPoints)(def, s);
        ctx.fillStyle = s.color ?? "#3b82f6";
        for (const p of pts) {
            const cx = (0, chart_geom_1.comboXyPlotX)(p.x, cats, plot, xs);
            const cy = plot.y + plot.h - ((p.y - tmin) / (tmax - tmin || 1)) * plot.h;
            const r = bubble ? Math.max(3, Math.min(16, (p.z ?? 1) * 1.8)) : 3.5;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.globalAlpha = bubble ? 0.7 : 1;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }
}
function overlayGuides(ctx, def, plot, ticksIn) {
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
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.25;
                    ctx.setLineDash([5, 3]);
                    ctx.beginPath();
                    ctx.moveTo(xAt(x0), yOf(fit.a + fit.b * x0));
                    ctx.lineTo(xAt(x1), yOf(fit.a + fit.b * x1));
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
            continue;
        }
        if (s.errorBars) {
            const half = s.errorBars.val ?? 0;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            s.values.forEach((v, i) => {
                const xx = plot.x + step * i;
                ctx.beginPath();
                ctx.moveTo(xx, yOf(v - half));
                ctx.lineTo(xx, yOf(v + half));
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(xx - 3, yOf(v - half));
                ctx.lineTo(xx + 3, yOf(v - half));
                ctx.moveTo(xx - 3, yOf(v + half));
                ctx.lineTo(xx + 3, yOf(v + half));
                ctx.stroke();
            });
        }
        if (s.trendline) {
            const xs = s.values.map((_, i) => i);
            const fit = (0, chart_geom_1.linearFit)(xs, s.values);
            if (fit && xs.length >= 2) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.25;
                ctx.setLineDash([5, 3]);
                ctx.beginPath();
                ctx.moveTo(plot.x, yOf(fit.a));
                ctx.lineTo(plot.x + step * (s.values.length - 1), yOf(fit.a + fit.b * (s.values.length - 1)));
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
    }
}
function overlayDataLabels(ctx, def, plot) {
    ctx.save();
    ctx.fillStyle = ts.text;
    ctx.font = `${ts.size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (def.type === "pie" || def.type === "doughnut") {
        const s0 = def.series[0];
        if (!s0) {
            ctx.restore();
            return;
        }
        const total = s0.values.reduce((a, b) => a + Math.abs(b), 0);
        if (!total) {
            ctx.restore();
            return;
        }
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
                ctx.fillText(label, cx0 + Math.cos(mid) * r * 0.62, cy0 + Math.sin(mid) * r * 0.62);
            start = end;
        }
        ctx.restore();
        return;
    }
    const cats = def.categories ?? [];
    // Clustered / stacked bars: label each bar at its own free end, in the bar renderer's geometry.
    if ((def.type === "column" || def.type === "bar") && !hasCombo(def)) {
        const geo = (0, chart_geom_1.barGeometry)(def, plot);
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
                    ctx.textAlign = a.anchor === "middle" ? "center" : a.anchor === "start" ? "left" : "right";
                    ctx.textBaseline = a.baseline;
                    ctx.fillText(label, a.x, a.y);
                }
                if (v >= 0)
                    stackPos += v;
                else
                    stackNeg += v;
            });
        }
        ctx.restore();
        return;
    }
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
                if (!label)
                    return;
                ctx.fillText(label, (0, chart_geom_1.comboXyPlotX)(p.x, cats, plot, xs), yOf(p.y) - 4);
            });
            continue;
        }
        s.values.forEach((v, i) => {
            const label = (0, chart_geom_1.pointLabelText)(def, s, i, v);
            if (!label)
                return;
            const xx = plot.x + step * (cats.length > 1 ? i : 0.5);
            ctx.fillText(label, xx, yOf(v) - 3);
        });
    }
    ctx.restore();
}
