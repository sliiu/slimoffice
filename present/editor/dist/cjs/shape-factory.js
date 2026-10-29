"use strict";
// Shape factory：把"按几何预设建一个 Shape 实例"这件事集中起来。
//
// 历史背景：editor.ts 里 `makeShape` / `geomToShape` 是 ribbon 插入按钮的私有实现，
// 只负责"按默认配色 / 默认字号"摆一个新形状。现在 AI tool（chat 工具）也需要
// 同一能力 —— 而且要支持：
//   1. 指定自定义 fill / stroke（AI 想插一个"主题色填充的圆角矩形"，不能强写默认蓝）；
//   2. 指定文本内容（"加一个『核心指标』标题文本框"）；
//   3. 复用所有 SHAPE_LIBRARY 的预设（~80 种 OOXML preset，含 rect/ellipse/polygon/path/line）。
//
// 因此把工厂提出来，editor.ts 与 packages/ai 共用同一份实现，避免"两端各写一遍 → 行为分叉"。
//
// 关键不变量（与 editor.ts 历史 makeShape 一致 —— 改任何一条都需要回归 ribbon 插入）：
//   - id 一律 `sp_<prefix>_<ts>_<rand>` 前缀；OOXML timing 的 spTgt.spid 反向解析靠这个约定。
//   - PathShape.presetType 必须写 OOXML preset id，让 commands.ts 在 bbox 变化时
//     调用 registerPathPresetRegenerator 注册的回调重新生成 d。
//   - LineShape 的箭头通过 stroke.headEnd / tailEnd 表达（不依赖额外 shape）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.genShapeId = genShapeId;
exports.officeInsertStyleRefs = officeInsertStyleRefs;
exports.createShapeFromPreset = createShapeFromPreset;
exports.officialPresetId = officialPresetId;
exports.applyOfficialPresetGeometry = applyOfficialPresetGeometry;
exports.createTextBox = createTextBox;
exports.createLine = createLine;
exports.createChart = createChart;
exports.createTable = createTable;
const core_1 = require("@sliiu/present-core");
const parser_1 = require("@sliiu/present-parser");
const shape_library_1 = require("./shape-library");
// id 自增计数 —— 同毫秒内多次 createShape 也保证 id 唯一。
let _id = 0;
function genShapeId(prefix = "ai") {
    return `sp_${prefix}_${Date.now().toString(36)}_${(_id++).toString(36)}`;
}
// 默认配色：与 editor ribbon 的"插入形状"按钮一致 —— 把传统蓝/绿/橙保留，
// 让用户从 ribbon 与 AI 插入的同种形状视觉上无差。AI 可以通过 opts.fill / opts.stroke
// 覆盖。注意：当 SHAPE_LIBRARY 走 line 分支时已经写死自己的 stroke（黑色 2px），
// 这与 editor.ts 历史行为一致 —— 不动。
const DEFAULT_FILL_RECT = { kind: "solid", color: "#3b82f6" };
const DEFAULT_STROKE_RECT = { paint: { kind: "solid", color: "#1e3a8a" }, width: 1 };
const DEFAULT_FILL_ELLIPSE = { kind: "solid", color: "#10b981" };
const DEFAULT_STROKE_ELLIPSE = { paint: { kind: "solid", color: "#064e3b" }, width: 1 };
const DEFAULT_FILL_TRIANGLE = { kind: "solid", color: "#f59e0b" };
const DEFAULT_STROKE_TRIANGLE = { paint: { kind: "solid", color: "#92400e" }, width: 1 };
const DEFAULT_FILL_STAR = { kind: "solid", color: "#eab308" };
const DEFAULT_STROKE_STAR = { paint: { kind: "solid", color: "#854d0e" }, width: 1 };
const DEFAULT_LINE_STROKE = { paint: { kind: "solid", color: "#111827" }, width: 2 };
// 通用 fallback（其它 ~70 种 library preset 用）—— 与 editor 历史 geomToShape 一致。
const GENERIC_FILL = { kind: "solid", color: "#3b82f6" };
const GENERIC_STROKE = { paint: { kind: "solid", color: "#1e3a8a" }, width: 1 };
const FRIENDLY_NAMES = {
    rect: "Rectangle",
    ellipse: "Ellipse",
    text: "Text",
    triangle: "Triangle",
    star: "Star",
    arrow: "Arrow",
    line: "Line",
};
/** Office「插入形状」默认 `<p:style>`：导出后换主题时描边/填充仍跟 accent1。 */
function officeInsertStyleRefs(role = "shape") {
    const accent = { scheme: "accent1" };
    if (role === "text") {
        return {
            lnRef: 0,
            fillRef: 0,
            effectRef: 0,
            fontRef: "minor",
            lnColor: accent,
            fillColor: accent,
            effectColor: accent,
            fontColor: { scheme: "tx1" },
        };
    }
    if (role === "line") {
        return {
            lnRef: 1,
            fillRef: 0,
            effectRef: 0,
            fontRef: "minor",
            lnColor: accent,
            fillColor: accent,
            effectColor: accent,
            fontColor: { scheme: "tx1" },
        };
    }
    return {
        lnRef: 2,
        fillRef: 1,
        effectRef: 0,
        fontRef: "minor",
        lnColor: accent,
        fillColor: accent,
        effectColor: accent,
        fontColor: { scheme: "lt1" },
    };
}
function baseFor(bbox, opts) {
    const role = opts.themeStyle ?? "shape";
    return {
        id: opts.id ?? genShapeId(opts.idPrefix ?? "ai"),
        name: opts.name ?? "Shape",
        zIndex: 0,
        visible: true,
        locked: false,
        opacity: opts.opacity ?? 1,
        bbox: { ...bbox },
        transform: opts.rotation
            ? { ...(0, core_1.identityTransform)(), rotation: opts.rotation }
            : (0, core_1.identityTransform)(),
        ...(role ? { styleRefs: officeInsertStyleRefs(role) } : {}),
    };
}
// ============================================================================
// 1) 按 SHAPE_LIBRARY preset id 生成 Shape
// ============================================================================
/**
 * 从 SHAPE_LIBRARY 预设（rect / ellipse / triangle / star / pentagon / hexagon /
 * rightArrow / chevron / flowChartDecision / lightningBolt / cloudCallout / ...）
 * 生成一个 Shape。fill / stroke / opacity / rotation 可覆盖默认值。
 *
 * 返回 null 仅当 presetId 既不是已知简写也不在 SHAPE_LIBRARY 时 —— 调用方
 * 需要兜底为普通 rect 或返回错误给上游。
 */
function createShapeFromPreset(presetId, bbox, opts = {}) {
    const name = opts.name ?? FRIENDLY_NAMES[presetId] ?? shape_library_1.SHAPE_BY_ID[presetId]?.fallback ?? presetId;
    const base = baseFor(bbox, { ...opts, name });
    // 快捷分支：原生 rect / ellipse / 直线箭头保留（没有黄色 adj，bbox 手柄足够）。
    switch (presetId) {
        case "rect":
            return {
                ...base,
                kind: "rect",
                fill: opts.fill ?? DEFAULT_FILL_RECT,
                stroke: opts.stroke ?? DEFAULT_STROKE_RECT,
            };
        case "ellipse":
            return {
                ...base,
                kind: "ellipse",
                fill: opts.fill ?? DEFAULT_FILL_ELLIPSE,
                stroke: opts.stroke ?? DEFAULT_STROKE_ELLIPSE,
            };
        case "line":
            return {
                ...base,
                kind: "line",
                x1: bbox.x,
                y1: bbox.y + bbox.h / 2,
                x2: bbox.x + bbox.w,
                y2: bbox.y + bbox.h / 2,
                stroke: opts.stroke ?? DEFAULT_LINE_STROKE,
                styleRefs: officeInsertStyleRefs("line"),
            };
        case "arrow":
            return {
                ...base,
                kind: "line",
                x1: bbox.x,
                y1: bbox.y + bbox.h / 2,
                x2: bbox.x + bbox.w,
                y2: bbox.y + bbox.h / 2,
                stroke: opts.stroke ?? {
                    ...DEFAULT_LINE_STROKE,
                    tailEnd: { kind: "triangle", w: "med", len: "med" },
                },
                styleRefs: officeInsertStyleRefs("line"),
            };
        case "text":
            return createTextBox(bbox, { text: opts.text ?? "Text" });
    }
    const officialId = officialPresetId(presetId);
    if (!NATIVE_PRESETS.has(officialId)) {
        const fill = opts.fill ?? presetFill(presetId);
        const stroke = opts.stroke ?? presetStroke(presetId);
        const official = fromOfficialPresetPath(officialId, bbox, base, fill, stroke);
        if (official) {
            if (FLIP_H_LIBRARY_IDS.has(presetId)) {
                official.transform = { ...official.transform, scaleX: -1 };
            }
            return official;
        }
    }
    const entry = shape_library_1.SHAPE_BY_ID[presetId];
    if (!entry) {
        return {
            ...base,
            kind: "rect",
            fill: opts.fill ?? GENERIC_FILL,
            stroke: opts.stroke ?? GENERIC_STROKE,
        };
    }
    return geomToShape(entry.geom(bbox), base, officialId, opts);
}
/** Picker id → OOXML ST_ShapeType。库里用了友好名的，插入时必须写成官方 token。 */
const LIBRARY_TO_OFFICIAL = {
    star: "star5",
    snipRect: "snip1Rect",
    uTurnArrow: "uturnArrow",
    flowChartData: "flowChartInputOutput",
    explosion1: "irregularSeal1",
    elbowConnector: "bentConnector3",
    curvedConnector: "curvedConnector3",
    rightCircularArrow: "circularArrow",
    rightUpArrow: "leftUpArrow",
};
const NATIVE_PRESETS = new Set([
    "rect",
    "ellipse",
    "line",
    "straightConnector1",
    "flowChartProcess",
    "flowChartConnector",
]);
const FLIP_H_LIBRARY_IDS = new Set(["rightUpArrow"]);
function officialPresetId(libraryId) {
    return LIBRARY_TO_OFFICIAL[libraryId] ?? libraryId;
}
function presetFill(presetId) {
    if (presetId === "triangle")
        return DEFAULT_FILL_TRIANGLE;
    if (presetId === "star" || presetId === "star5")
        return DEFAULT_FILL_STAR;
    return GENERIC_FILL;
}
function presetStroke(presetId) {
    if (presetId === "triangle")
        return DEFAULT_STROKE_TRIANGLE;
    if (presetId === "star" || presetId === "star5")
        return DEFAULT_STROKE_STAR;
    return GENERIC_STROKE;
}
function dFromPresetResult(r) {
    return geometryFromPreset(r)?.d;
}
function geometryFromPreset(r) {
    if (r.kind === "path" && r.d)
        return { d: r.d, strokeOnly: false };
    if (r.kind === "multiPath" && r.paths?.length) {
        const filled = r.paths.filter((p) => p.fillMod !== "none");
        if (filled.length)
            return { d: filled.map((p) => p.d).join(" "), strokeOnly: false };
        return { d: r.paths.map((p) => p.d).join(" "), strokeOnly: true };
    }
    return undefined;
}
/** 按当前 bbox + presetType + presetAdj 重算 PathShape.d（resize / 调整锚点共用）。 */
function applyOfficialPresetGeometry(s) {
    if (!s.presetType)
        return false;
    const adj = s.presetAdj ?? (0, parser_1.officialPresetAdjDefaults)(s.presetType) ?? {};
    const d = dFromPresetResult((0, parser_1.presetToShape)(s.presetType, s.bbox, adj));
    if (!d)
        return false;
    s.d = d;
    if ((0, parser_1.pathHasSubPaths)(d))
        s.fillRule = "evenodd";
    else
        delete s.fillRule;
    return true;
}
function fromOfficialPresetPath(presetId, bbox, base, fill, stroke) {
    const adj = (0, parser_1.officialPresetAdjDefaults)(presetId) ?? {};
    const geo = geometryFromPreset((0, parser_1.presetToShape)(presetId, bbox, adj));
    if (!geo)
        return null;
    return {
        ...base,
        kind: "path",
        d: geo.d,
        fillRule: (0, parser_1.pathHasSubPaths)(geo.d) ? "evenodd" : undefined,
        fill: geo.strokeOnly ? undefined : fill,
        stroke: geo.strokeOnly ? strokeForConnector(stroke) : stroke,
        presetType: presetId,
        ...(Object.keys(adj).length ? { presetAdj: adj } : {}),
        ...(geo.strokeOnly ? { styleRefs: officeInsertStyleRefs("line") } : {}),
    };
}
function strokeForConnector(stroke) {
    return stroke === GENERIC_STROKE ? DEFAULT_LINE_STROKE : stroke;
}
function geomToShape(g, base, presetId, opts) {
    const fill = opts.fill ?? GENERIC_FILL;
    const stroke = opts.stroke ?? GENERIC_STROKE;
    // 官方 prstGeom（rightArrow 等）走 path + presetType/adj，选中框才是 8 个
    // bbox 手柄 + 黄色调整锚点，而不是把每个顶点当自由多边形拖。
    if (g.kind === "polygon" || g.kind === "path") {
        const official = fromOfficialPresetPath(presetId, base.bbox, base, fill, stroke);
        if (official)
            return official;
    }
    switch (g.kind) {
        case "rect":
            return { ...base, kind: "rect", fill, stroke, ...(g.rx !== undefined ? { rx: g.rx } : {}), ...(g.ry !== undefined ? { ry: g.ry } : {}) };
        case "ellipse":
            return { ...base, kind: "ellipse", fill, stroke };
        case "polygon":
            return { ...base, kind: "polygon", points: g.points, fill, stroke };
        case "path":
            return {
                ...base,
                kind: "path",
                d: g.d,
                ...(g.fillRule ? { fillRule: g.fillRule } : {}),
                fill,
                stroke,
                presetType: presetId,
            };
        case "line": {
            const arrowKind = g.arrow ?? "none";
            const lineStroke = opts.stroke
                ? { ...opts.stroke }
                : { paint: { kind: "solid", color: "#111827" }, width: 2 };
            if (arrowKind === "tail" || arrowKind === "both")
                lineStroke.tailEnd = lineStroke.tailEnd ?? { kind: "triangle", w: "med", len: "med" };
            if (arrowKind === "head" || arrowKind === "both")
                lineStroke.headEnd = lineStroke.headEnd ?? { kind: "triangle", w: "med", len: "med" };
            return { ...base, kind: "line", x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2, stroke: lineStroke, styleRefs: officeInsertStyleRefs("line") };
        }
    }
}
/**
 * 创建一个独立的文本框（OOXML txBox=1）。
 *
 * 与 SHAPE_LIBRARY 的"text"快捷分支区分：这个版本接受多行文本（按 \n 拆段），
 * 并允许设定字号 / 字色 / 对齐，让 AI 一次性插一段带格式的文本。
 */
function createTextBox(bbox, opts) {
    const base = baseFor(bbox, { ...opts, name: opts.name ?? "Text", themeStyle: "text" });
    const lines = opts.text.split("\n");
    const align = opts.align ?? "start";
    const text = {
        ...base,
        kind: "text",
        paragraphs: lines.map((line) => ({
            align,
            runs: [
                {
                    text: line,
                    fontFamily: opts.fontFamily ?? "sans-serif",
                    fontSize: opts.fontSize ?? 24,
                    color: opts.color ?? "#111827",
                    ...(opts.fontWeight !== undefined ? { fontWeight: opts.fontWeight } : {}),
                    ...(opts.italic !== undefined ? { italic: opts.italic } : {}),
                },
            ],
        })),
        wrap: opts.wrap ?? true,
        ...(opts.vAlign ? { vAlign: opts.vAlign } : {}),
        ...(opts.fill ? { fill: opts.fill } : {}),
        ...(opts.stroke ? { stroke: opts.stroke } : {}),
        txBox: true,
    };
    return text;
}
function createLine(opts) {
    const minX = Math.min(opts.x1, opts.x2);
    const minY = Math.min(opts.y1, opts.y2);
    const maxX = Math.max(opts.x1, opts.x2);
    const maxY = Math.max(opts.y1, opts.y2);
    const bbox = { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
    const base = baseFor(bbox, { ...opts, name: opts.name ?? "Line", themeStyle: "line" });
    const stroke = opts.stroke ?? {
        paint: { kind: "solid", color: opts.color ?? "#111827" },
        width: opts.width ?? 2,
        ...(opts.dashPreset ? { dashPreset: opts.dashPreset } : {}),
    };
    if (opts.headArrow && opts.headArrow !== "none")
        stroke.headEnd = { kind: opts.headArrow, w: "med", len: "med" };
    if (opts.tailArrow && opts.tailArrow !== "none")
        stroke.tailEnd = { kind: opts.tailArrow, w: "med", len: "med" };
    return {
        ...base,
        kind: "line",
        x1: opts.x1,
        y1: opts.y1,
        x2: opts.x2,
        y2: opts.y2,
        stroke,
    };
}
/**
 * 创建一个 ChartShape。chart 字段直接是 OOXML §21.2.2 的内存等价物：
 *   - type: bar/column/line/pie/doughnut/area/scatter（核心 5 类）+ chartEx 类型
 *   - series: 各序列名称 + 数值数组
 *   - categories: X 轴类别（line/bar/area/column）或饼图扇区标签
 *   - colors / legend / showValues / title / axes / dataLabels: 视觉配置
 *
 * AI / 调用方负责保证 series.values.length === categories.length（除 scatter
 * 用 points 二维数组外）；不一致时渲染层会按 min(values.length, categories.length)
 * 截断绘制。
 */
function createChart(opts) {
    const base = baseFor(opts.bbox, { ...opts, name: opts.name ?? opts.chart.title ?? "Chart", themeStyle: false });
    return {
        ...base,
        kind: "chart",
        chart: JSON.parse(JSON.stringify(opts.chart)),
    };
}
function createTable(opts) {
    const { rows, cols, bbox } = opts;
    if (rows < 1 || cols < 1)
        throw new Error(`createTable requires rows>=1 cols>=1 (got ${rows}x${cols})`);
    const cellW = bbox.w / cols;
    const cellH = bbox.h / rows;
    const headerRow = opts.headerRow !== false;
    const headerFill = opts.headerFill ?? "#1e3a8a";
    const headerColor = opts.headerColor ?? "#ffffff";
    const cellFill = opts.cellFill ?? "#ffffff";
    const cellColor = opts.cellColor ?? "#111827";
    const borderColor = opts.borderColor ?? "#1e3a8a";
    const fontFamily = opts.fontFamily ?? "sans-serif";
    const fontSize = opts.fontSize ?? 14;
    const children = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const isHeader = headerRow && r === 0;
            const text = opts.data?.[r]?.[c] ?? "";
            const cellBbox = {
                x: bbox.x + c * cellW,
                y: bbox.y + r * cellH,
                w: cellW,
                h: cellH,
            };
            const cell = {
                id: genShapeId("cell"),
                name: `R${r + 1}C${c + 1}`,
                zIndex: 0,
                visible: true,
                locked: false,
                opacity: 1,
                bbox: cellBbox,
                transform: (0, core_1.identityTransform)(),
                kind: "text",
                fill: { kind: "solid", color: isHeader ? headerFill : cellFill },
                stroke: { paint: { kind: "solid", color: borderColor }, width: 1 },
                paragraphs: [
                    {
                        align: "middle",
                        runs: [
                            {
                                text,
                                fontFamily,
                                fontSize,
                                color: isHeader ? headerColor : cellColor,
                                ...(isHeader ? { fontWeight: 600 } : {}),
                            },
                        ],
                    },
                ],
                vAlign: "middle",
                wrap: true,
                cellMeta: { gridSpan: 1, rowSpan: 1 },
            };
            children.push(cell);
        }
    }
    const base = baseFor(bbox, { ...opts, name: opts.name ?? "Table", themeStyle: false });
    return {
        ...base,
        kind: "group",
        children,
        tableMeta: { rows, cols, firstRow: true, bandRow: true },
    };
}
