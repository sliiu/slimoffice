"use strict";
// AI 图表工具集。
//
// 让模型有"插数据图"的能力（柱/折线/饼/面积/散点 5 大主流类型），
// 并允许后续 patch 单图的 data / type / style。
//
// 与 OOXML 的关系：ChartDef 直接对应 §21.2.2 c:chart / cx:chart 的内存表达
// （bar/column/line/pie/doughnut/area/scatter + sunburst/treemap/waterfall/
// funnel/pareto/histogram/boxWhisker/region 等 chartEx 类型也保留 round-trip）。
// 序列化层目前对 chart 仍以 rect 占位写出（编辑器/渲染层完整支持），未来再补
// 全 chart XML —— 但内存模型已是 OOXML 一等公民，AI 不需要"先插图片再描述数据"。
//
// 设计要点：
//   - insertChart：把数据接 + 视觉接口拍平到一个 schema 里。AI 直接写 series + categories，
//     一次 tool 调用就出图。
//   - setChartData：仅替换 categories / series（保留 type / colors / legend / title），
//     用户场景"把 Q1 数据换成 Q4 数据"高频。
//   - setChartStyle：批量改 title / legend / showValues / colors / dataLabels，不动数据。
//   - setChartType：在已有数据基础上换 chart type（柱 → 折线），不重写 series。
Object.defineProperty(exports, "__esModule", { value: true });
exports.chartTools = void 0;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
const types_1 = require("../types");
const colorRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const colorSchema = zod_1.z.string().regex(colorRe, "must be #rrggbb or #rrggbbaa");
const rectSchema = zod_1.z.object({
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    w: zod_1.z.number().min(50),
    h: zod_1.z.number().min(50),
});
// 5 大主流图表类型枚举（与 OOXML 严格对齐 + 渲染器实际支持的子集）。
const chartTypeEnum = zod_1.z.enum([
    "bar",
    "column",
    "line",
    "pie",
    "doughnut",
    "area",
    "scatter",
    "bubble",
    "radar",
    "stock",
    "surface",
]);
const seriesSchema = zod_1.z.object({
    name: zod_1.z.string().optional().describe("Series label shown in legend."),
    values: zod_1.z.array(zod_1.z.number()).min(1).max(100),
    color: colorSchema.optional(),
});
// scatter 的 series 不同：每个 series 是 (x, y) 点列。
const scatterPointsSchema = zod_1.z.object({
    name: zod_1.z.string().optional(),
    points: zod_1.z
        .array(zod_1.z.object({ x: zod_1.z.number(), y: zod_1.z.number() }))
        .min(1)
        .max(100),
    color: colorSchema.optional(),
});
const dataLabelsSchema = zod_1.z.object({
    showVal: zod_1.z.boolean().optional(),
    showCatName: zod_1.z.boolean().optional(),
    showSerName: zod_1.z.boolean().optional(),
    showPercent: zod_1.z.boolean().optional(),
    position: zod_1.z.string().optional().describe("ECMA-376 §21.2.2.155: ctr / inEnd / outEnd / inBase / t / b / l / r / bestFit."),
    numFmt: zod_1.z.string().optional().describe("Number format string (Excel-style, e.g. '0.0%')."),
});
exports.chartTools = [
    // ============================================================================
    // 1) 插入新图表
    // ============================================================================
    (0, types_1.defineTool)({
        name: "insertChart",
        description: [
            "Insert a NEW chart (data visualization) on a slide. Use when user wants to show trends, comparisons, distributions, or any numeric data that benefits from a picture.",
            "Pick `type`:",
            "  - `column` (default for bar-like compare): grouped vertical bars; >1 series stacks side-by-side.",
            "  - `bar`:    horizontal bars; better for long category names or 'ranking' charts.",
            "  - `line`:   trend over time; works best with >=4 data points; multiple series share an axis.",
            "  - `area`:   filled line — emphasize cumulative magnitude.",
            "  - `pie` / `doughnut`: single series, %-of-whole composition. Keep slices ≤7. Doughnut leaves a hole for a central label.",
            "  - `scatter`: 2D (x, y) points — for correlation. Provide `scatterPoints` instead of series+categories.",
            "  - `bubble`: like scatter plus optional z size on each point (use scatterPoints; z is ignored if omitted).",
            "  - `radar`: polar category chart (same series+categories as line).",
            "  - `stock`: high/low/close (3+ series) or open/high/low/close.",
            "  - `surface`: category surface (same data as area).",
            "Rules:",
            "  - For column/bar/line/area: `series[i].values.length` MUST equal `categories.length` (renderer truncates otherwise).",
            "  - For pie/doughnut: provide exactly ONE series; `categories.length` matches `values.length`.",
            "  - For scatter: omit categories/series; use `scatterPoints` (array of (x,y) arrays, one per series).",
            "  - `colors` is OPTIONAL deck-level palette; per-series `color` overrides it for that one series.",
            "  - Stay OOXML-compliant: values must be numeric, NOT strings.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            bbox: rectSchema.describe("Position + size in slide px. Typical chart area: 800×400 — leaves room for title / legend."),
            type: chartTypeEnum,
            title: zod_1.z.string().max(120).optional(),
            legend: zod_1.z.boolean().optional().describe("Show legend below the plot. Default false."),
            colors: zod_1.z.array(colorSchema).min(1).max(12).optional().describe("Optional palette applied series-by-series."),
            showValues: zod_1.z.boolean().optional().describe("Default false. When true, render numeric labels above bars / next to points."),
            categories: zod_1.z.array(zod_1.z.string()).min(1).max(60).optional().describe("Required for bar/column/line/area/pie/doughnut."),
            series: zod_1.z.array(seriesSchema).min(1).max(8).optional().describe("Numeric series. Required for bar/column/line/area; exactly 1 series for pie/doughnut."),
            scatterPoints: zod_1.z.array(scatterPointsSchema).min(1).max(8).optional().describe("Scatter-only: array of point series. Ignored for other types."),
            stacked: zod_1.z.boolean().optional().describe("Bar / column / area only — stack series instead of grouping them."),
            smooth: zod_1.z.boolean().optional().describe("Line only — draw smoothed cubic Bezier curves."),
            markers: zod_1.z.boolean().optional().describe("Line only — show point markers."),
            holeRatio: zod_1.z.number().min(0).max(0.95).optional().describe("Doughnut only — hole size 0..0.95 (default 0.5)."),
            dataLabels: dataLabelsSchema.optional(),
            name: zod_1.z.string().max(60).optional(),
        }),
        tags: ["mutate", "chart"],
        execute: async (rt, { slideIdx, bbox, type, name, ...rest }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const chart = buildChartDef(type, rest);
            if (typeof chart === "string")
                return (0, types_1.err)(chart);
            try {
                const shape = (0, commands_1.createChart)({ bbox, chart, ...(name ? { name } : {}) });
                const res = rt.apply(new commands_1.AddShapeCmd(slideIdx, 0, shape));
                if (!res.ok)
                    return res;
                return (0, types_1.ok)({ slideIdx, shapeId: shape.id, chartType: type });
            }
            catch (e) {
                return (0, types_1.err)(e.message);
            }
        },
    }),
    // ============================================================================
    // 2) 替换 chart 数据（保留 type / colors / legend / title 等视觉配置）
    // ============================================================================
    (0, types_1.defineTool)({
        name: "setChartData",
        description: [
            "Replace the data of an existing chart shape without changing its type or visual config (title / legend / colors stay).",
            "For bar/column/line/area/pie/doughnut: pass `categories` (X-axis labels) + `series` (each with `values`).",
            "For scatter: pass `scatterPoints`.",
            "Use when the user says 'update Q1 numbers to Q4' or 'replace the data'.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            categories: zod_1.z.array(zod_1.z.string()).min(1).max(60).optional(),
            series: zod_1.z.array(seriesSchema).min(1).max(8).optional(),
            scatterPoints: zod_1.z.array(scatterPointsSchema).min(1).max(8).optional(),
        }),
        tags: ["mutate", "chart"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, categories, series, scatterPoints }) => {
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const shape = findChartShape(slide, shapeId);
            if (!shape)
                return (0, types_1.err)(`chart shape ${shapeId} not found on slide ${slideIdx}`);
            const next = JSON.parse(JSON.stringify(shape.chart));
            if (next.type === "scatter" || next.type === "bubble") {
                if (!scatterPoints)
                    return (0, types_1.err)("setChartData on a scatter/bubble chart requires scatterPoints.");
                const pts = scatterPoints.map((sp) => sp.points.map((p) => ({ x: p.x, y: p.y })));
                next.points = pts;
                next.series = scatterPoints.map((sp) => ({
                    values: sp.points.map((p) => p.y),
                    ...(sp.name ? { name: sp.name } : {}),
                    ...(sp.color ? { color: sp.color } : {}),
                }));
            }
            else {
                if (!series)
                    return (0, types_1.err)("setChartData on this chart type requires series.");
                next.series = series.map(seriesIn => ({
                    values: seriesIn.values.slice(),
                    ...(seriesIn.name ? { name: seriesIn.name } : {}),
                    ...(seriesIn.color ? { color: seriesIn.color } : {}),
                }));
                if (categories !== undefined)
                    next.categories = categories.slice();
            }
            return rt.apply(new commands_1.SetChartDefCmd(slideIdx, shapeId, next));
        },
    }),
    // ============================================================================
    // 3) 改 chart 视觉配置（title / legend / colors / showValues / dataLabels），不动数据
    // ============================================================================
    (0, types_1.defineTool)({
        name: "setChartStyle",
        description: "Tweak an existing chart's visual config (title / legend / colors / showValues / dataLabels) WITHOUT touching the data.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            title: zod_1.z.string().max(120).optional(),
            legend: zod_1.z.boolean().optional(),
            colors: zod_1.z.array(colorSchema).min(1).max(12).optional(),
            showValues: zod_1.z.boolean().optional(),
            varyColors: zod_1.z.boolean().optional().describe("Pie/doughnut: vary slice colors automatically. Default true."),
            dataLabels: dataLabelsSchema.optional(),
        }),
        tags: ["mutate", "chart"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, ...patch }) => {
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const shape = findChartShape(slide, shapeId);
            if (!shape)
                return (0, types_1.err)(`chart shape ${shapeId} not found`);
            const next = JSON.parse(JSON.stringify(shape.chart));
            if (patch.title !== undefined)
                next.title = patch.title;
            if (patch.legend !== undefined)
                next.legend = patch.legend;
            if (patch.colors !== undefined)
                next.colors = patch.colors.slice();
            if (patch.showValues !== undefined)
                next.showValues = patch.showValues;
            if (patch.varyColors !== undefined)
                next.varyColors = patch.varyColors;
            if (patch.dataLabels !== undefined)
                next.dataLabels = { ...patch.dataLabels };
            return rt.apply(new commands_1.SetChartDefCmd(slideIdx, shapeId, next));
        },
    }),
    // ============================================================================
    // 4) 切换 chart 类型（保留 series + categories）
    // ============================================================================
    (0, types_1.defineTool)({
        name: "setChartType",
        description: [
            "Change the chart type while keeping series / categories / colors. Useful when 'switch this column chart to a line'.",
            "Constraints: scatter is NOT type-compatible with the others (needs (x,y) points). Going scatter→other or other→scatter will REJECT — re-create with insertChart instead.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeId: zod_1.z.string(),
            type: chartTypeEnum,
            stacked: zod_1.z.boolean().optional(),
            smooth: zod_1.z.boolean().optional(),
            markers: zod_1.z.boolean().optional(),
            holeRatio: zod_1.z.number().min(0).max(0.95).optional(),
        }),
        tags: ["mutate", "chart"],
        shapeScoped: true,
        execute: async (rt, { slideIdx, shapeId, type, stacked, smooth, markers, holeRatio }) => {
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const shape = findChartShape(slide, shapeId);
            if (!shape)
                return (0, types_1.err)(`chart shape ${shapeId} not found`);
            const cur = shape.chart;
            if (cur.type === "scatter" || type === "scatter" || cur.type === "bubble" || type === "bubble") {
                return (0, types_1.err)("Type switch involving scatter/bubble is not supported — use insertChart with the new type and the matching data shape.");
            }
            const next = JSON.parse(JSON.stringify(cur));
            next.type = type;
            // 清掉旧类型独有字段，再按新类型补默认。
            const nextAny = next;
            delete nextAny.stacked;
            delete nextAny.percentStacked;
            delete nextAny.smooth;
            delete nextAny.markers;
            delete nextAny.holeRatio;
            if (type === "bar" || type === "column" || type === "area") {
                if (stacked !== undefined)
                    next.stacked = stacked;
            }
            if (type === "line") {
                if (smooth !== undefined)
                    next.smooth = smooth;
                if (markers !== undefined)
                    next.markers = markers;
            }
            if (type === "doughnut") {
                next.holeRatio = holeRatio ?? 0.5;
            }
            // pie/doughnut 仅支持 1 series；多 series 时仅保留首条，避免视觉错乱。
            if ((type === "pie" || type === "doughnut") && next.series.length > 1) {
                next.series = [next.series[0]];
            }
            return rt.apply(new commands_1.SetChartDefCmd(slideIdx, shapeId, next));
        },
    }),
];
// ---- 辅助 ----
function findChartShape(slide, id) {
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            const f = findChart(s, id);
            if (f)
                return f;
        }
    }
    return undefined;
}
function findChart(s, id) {
    if (s.id === id && s.kind === "chart")
        return s;
    if (s.kind === "group") {
        for (const c of s.children) {
            const f = findChart(c, id);
            if (f)
                return f;
        }
    }
    return undefined;
}
function buildChartDef(type, rest) {
    const baseFields = {};
    if (rest.title !== undefined)
        baseFields.title = rest.title;
    if (rest.legend !== undefined)
        baseFields.legend = rest.legend;
    if (rest.colors !== undefined)
        baseFields.colors = rest.colors.slice();
    if (rest.showValues !== undefined)
        baseFields.showValues = rest.showValues;
    if (rest.dataLabels !== undefined)
        baseFields.dataLabels = { ...rest.dataLabels };
    if (type === "scatter" || type === "bubble") {
        if (!rest.scatterPoints || rest.scatterPoints.length === 0) {
            return `insertChart type='${type}' requires scatterPoints (array of (x,y) point series).`;
        }
        const points = rest.scatterPoints.map((sp) => sp.points.map((p) => ({ x: p.x, y: p.y })));
        const series = rest.scatterPoints.map((sp) => ({
            values: sp.points.map((p) => p.y),
            ...(sp.name ? { name: sp.name } : {}),
            ...(sp.color ? { color: sp.color } : {}),
        }));
        if (type === "bubble") {
            const out = { type: "bubble", series, points, ...baseFields };
            return out;
        }
        const out = { type: "scatter", series, points, ...baseFields };
        return out;
    }
    if (!rest.series || rest.series.length === 0) {
        return `insertChart type='${type}' requires series (array of { name, values, color }).`;
    }
    const series = rest.series.map((s) => ({
        values: s.values.slice(),
        ...(s.name ? { name: s.name } : {}),
        ...(s.color ? { color: s.color } : {}),
    }));
    const categories = rest.categories?.slice();
    if (type === "bar" || type === "column") {
        const out = {
            type,
            series,
            ...(categories ? { categories } : {}),
            ...(rest.stacked !== undefined ? { stacked: rest.stacked } : {}),
            ...baseFields,
        };
        return out;
    }
    if (type === "line") {
        const out = {
            type: "line",
            series,
            ...(categories ? { categories } : {}),
            ...(rest.smooth !== undefined ? { smooth: rest.smooth } : {}),
            ...(rest.markers !== undefined ? { markers: rest.markers } : {}),
            ...baseFields,
        };
        return out;
    }
    if (type === "area") {
        const out = {
            type: "area",
            series,
            ...(categories ? { categories } : {}),
            ...(rest.stacked !== undefined ? { stacked: rest.stacked } : {}),
            ...baseFields,
        };
        return out;
    }
    if (type === "pie" || type === "doughnut") {
        // 仅保留首条 series（饼图本质 1 维数据）。
        const pieSeries = [series[0]];
        const out = {
            type,
            series: pieSeries,
            ...(categories ? { categories } : {}),
            ...(type === "doughnut" ? { holeRatio: rest.holeRatio ?? 0.5 } : {}),
            ...baseFields,
        };
        return out;
    }
    if (type === "radar") {
        const out = {
            type: "radar",
            series,
            radarStyle: "marker",
            ...(categories ? { categories } : {}),
            ...baseFields,
        };
        return out;
    }
    if (type === "stock") {
        const out = {
            type: "stock",
            series,
            ...(categories ? { categories } : {}),
            ...baseFields,
        };
        return out;
    }
    if (type === "surface") {
        const out = {
            type: "surface",
            series,
            ...(categories ? { categories } : {}),
            ...baseFields,
        };
        return out;
    }
    return `unsupported chart type: ${type}`;
}
