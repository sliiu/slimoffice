"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanvasDeckSchema = exports.CanvasSlideSchema = exports.CanvasElementSchema = exports.CANVAS_ELEMENT_KINDS = exports.normalizeSystemId = void 0;
exports.normalizeCanvasDeck = normalizeCanvasDeck;
const zod_1 = require("zod");
const ids_js_1 = require("../deckgen/ids.js");
const visual_system_js_1 = require("../deckgen/visual-system.js");
Object.defineProperty(exports, "normalizeSystemId", { enumerable: true, get: function () { return visual_system_js_1.normalizeSystemId; } });
const vocab_js_1 = require("../deckgen/vocab.js");
const ir_js_1 = require("../deckgen/ir.js");
const snap_js_1 = require("../deckgen/snap.js");
const core_1 = require("@sliiu/present-core");
const PaintRoleSchema = zod_1.z.enum(["bg", "surface", "ink", "muted", "line", "accent", "accentSoft"]);
const BBoxSchema = zod_1.z.object({
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    w: zod_1.z.number(),
    h: zod_1.z.number(),
});
exports.CANVAS_ELEMENT_KINDS = [
    "text",
    "image",
    "rule",
    "bar",
    "surface",
    "ellipse",
    "line",
    "chart",
    "table",
    "overlay",
    "shape",
    "icon",
    "diagram",
    "device",
];
const RunSchema = zod_1.z.object({
    text: zod_1.z.string(),
    emphasis: zod_1.z.enum(["bold", "accent", "mono"]).optional(),
});
const DeviceItemSchema = zod_1.z.object({
    title: zod_1.z.string().optional(),
    body: zod_1.z.string().optional(),
    value: zod_1.z.string().optional(),
    note: zod_1.z.string().optional(),
    icon: zod_1.z.string().optional(),
    /** agendaList: 1-based page this row opens. */
    target: zod_1.z.number().optional(),
});
const PlaneSchema = zod_1.z.object({ title: zod_1.z.string(), points: zod_1.z.array(zod_1.z.string()) });
exports.CanvasElementSchema = zod_1.z.object({
    slot: zod_1.z.string().optional(),
    kind: zod_1.z.enum(exports.CANVAS_ELEMENT_KINDS),
    bbox: BBoxSchema,
    paintRole: PaintRoleSchema.optional(),
    text: zod_1.z.string().optional(),
    /** Inline emphasis; concatenation replaces `text`. ≤ 2 emphasised spans. */
    runs: zod_1.z.array(RunSchema).optional(),
    fontSize: zod_1.z.number().optional(),
    fontWeight: zod_1.z.number().optional(),
    align: zod_1.z.enum(["start", "middle", "end"]).optional(),
    src: zod_1.z.string().optional(),
    rx: zod_1.z.number().optional(),
    fillAlpha: zod_1.z.number().optional(),
    italic: zod_1.z.boolean().optional(),
    caps: zod_1.z.literal("all").optional(),
    glow: zod_1.z.boolean().optional(),
    /** kind=text: display treatment (art type). Snap gates it per system and keeps one per page. */
    treatment: zod_1.z.enum(ir_js_1.TEXT_TREATMENTS).optional(),
    gradient: zod_1.z
        .object({
        angle: zod_1.z.number(),
        toRole: PaintRoleSchema,
        fromAlpha: zod_1.z.number().optional(),
        toAlpha: zod_1.z.number().optional(),
    })
        .optional(),
    shadow: zod_1.z
        .object({
        blur: zod_1.z.number(),
        dx: zod_1.z.number(),
        dy: zod_1.z.number(),
        alpha: zod_1.z.number(),
    })
        .optional(),
    chart: zod_1.z
        .object({
        type: zod_1.z.enum(["column", "bar", "line", "area", "pie", "doughnut"]),
        categories: zod_1.z.array(zod_1.z.string()),
        series: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string(), values: zod_1.z.array(zod_1.z.number()) })),
    })
        .optional(),
    table: zod_1.z
        .object({
        headers: zod_1.z.array(zod_1.z.string()),
        rows: zod_1.z.array(zod_1.z.array(zod_1.z.string())),
    })
        .optional(),
    x2: zod_1.z.number().optional(),
    y2: zod_1.z.number().optional(),
    dash: zod_1.z.enum(["solid", "dash", "dot"]).optional(),
    arrow: zod_1.z.enum(["none", "end", "both"]).optional(),
    /** kind=shape: SHAPE_LIBRARY preset id from the whitelist in the system prompt. */
    preset: zod_1.z.string().optional(),
    strokeOnly: zod_1.z.boolean().optional(),
    /** kind=icon: lucide id from the whitelist. */
    icon: zod_1.z.string().optional(),
    /** Click → jump to this 1-based page ("see page 7", back-to-contents marks). */
    link: zod_1.z.number().optional(),
    diagram: zod_1.z
        .object({
        layout: zod_1.z.enum(core_1.SMARTART_LAYOUT_KINDS),
        items: zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.object({ title: zod_1.z.string(), body: zod_1.z.string().optional() })])),
    })
        .optional(),
    device: zod_1.z
        .object({
        type: zod_1.z.enum(vocab_js_1.DEVICE_KINDS),
        items: zod_1.z.array(zod_1.z.union([zod_1.z.string(), DeviceItemSchema])).optional(),
        text: zod_1.z.string().optional(),
        attribution: zod_1.z.string().optional(),
        icon: zod_1.z.string().optional(),
        left: PlaneSchema.optional(),
        right: PlaneSchema.optional(),
    })
        .optional(),
});
exports.CanvasSlideSchema = zod_1.z.object({
    job: zod_1.z.string(),
    variant: zod_1.z.string().optional(),
    background: zod_1.z
        .object({
        kind: zod_1.z.enum(["solid", "image", "linear"]),
        src: zod_1.z.string().optional(),
        paintRole: PaintRoleSchema.optional(),
        overlay: zod_1.z.number().optional(),
        overlayRole: PaintRoleSchema.optional(),
        scrim: zod_1.z
            .object({
            direction: zod_1.z.enum(["left", "right", "top", "bottom", "radial", "flat"]),
            strength: zod_1.z.number().optional(),
        })
            .optional(),
        angle: zod_1.z.number().optional(),
        toRole: PaintRoleSchema.optional(),
    })
        .optional(),
    elements: zod_1.z.array(exports.CanvasElementSchema).min(1),
});
const HexSchema = zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const NAMED_THEME = new Set(["ink", "indigo", "kraft", "ikb", "signal", "lemon"]);
function coerceHex(v) {
    if (typeof v !== "string")
        return undefined;
    let t = v.trim();
    if (/^0x[0-9A-Fa-f]{6}$/i.test(t))
        t = `#${t.slice(2)}`;
    if (/^[0-9A-Fa-f]{6}$/.test(t))
        t = `#${t}`;
    const short = t.match(/^#([0-9A-Fa-f]{3})$/);
    if (short) {
        const [a, b, c] = short[1];
        t = `#${a}${a}${b}${b}${c}${c}`;
    }
    return /^#[0-9A-Fa-f]{6}$/.test(t) ? t : undefined;
}
function normalizePalette(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
        const hex = coerceHex(v);
        if (hex)
            out[k] = hex;
    }
    if (!out.bg || !out.ink || !out.accent)
        return undefined;
    return out;
}
/**
 * Canvas JSON must not go through outline field aliases (`layout` → `layoutHint`).
 * Models often say layout/theme/shapes; map those onto the canvas schema.
 */
function normalizeCanvasDeck(raw) {
    if (!raw || typeof raw !== "object")
        return raw;
    const o = { ...raw };
    const sys = (0, visual_system_js_1.normalizeSystemId)(o.systemId ?? o.system ?? o.visualSystem ?? o.visualSystemId);
    if (sys)
        o.systemId = sys;
    if (o.theme && typeof o.theme === "object" && !o.palette)
        o.palette = o.theme;
    const themeHint = String(o.themeId ?? (typeof o.theme === "string" ? o.theme : "")).toLowerCase();
    if (NAMED_THEME.has(themeHint))
        o.themeId = themeHint;
    else
        delete o.themeId;
    const pal = normalizePalette(o.palette);
    if (pal)
        o.palette = pal;
    else
        delete o.palette;
    if (Array.isArray(o.slides)) {
        o.slides = o.slides
            .map((slide, i) => {
            if (!slide || typeof slide !== "object")
                return undefined;
            const s = { ...slide };
            const job = String(s.job ?? s.layout ?? s.intent ?? s.layoutHint ?? "").trim();
            s.job = job || `page-${i}`;
            // null / "none" background → omit; a bare string is a src (image) or a role (solid).
            if (s.background == null || s.background === "none" || s.background === "")
                delete s.background;
            else if (typeof s.background === "string") {
                s.background = /^(data:|https?:|blob:)/i.test(s.background) ? { kind: "image", src: s.background } : { kind: "solid", paintRole: s.background };
            }
            if (s.background && typeof s.background === "object") {
                const b = { ...s.background };
                for (const k of Object.keys(b))
                    if (b[k] === null)
                        delete b[k];
                const k = String(b.kind ?? b.type ?? (b.src ? "image" : "solid")).toLowerCase();
                b.kind = k === "color" || k === "fill" || k === "flat" || k === "plain" ? "solid" : k === "photo" || k === "picture" || k === "img" ? "image" : k === "gradient" ? "linear" : k;
                if (b.kind === "solid" && !b.paintRole && typeof b.role === "string")
                    b.paintRole = b.role;
                if (b.kind === "image" && !b.src && typeof b.url === "string")
                    b.src = b.url;
                s.background = b;
            }
            // Drop null-valued keys everywhere on the slide (zod optional ≠ nullable).
            for (const k of Object.keys(s))
                if (s[k] === null)
                    delete s[k];
            if (!Array.isArray(s.elements) && Array.isArray(s.shapes))
                s.elements = s.shapes;
            if (Array.isArray(s.elements))
                s.elements = s.elements.map(normalizeElement);
            return s;
        })
            .filter((s) => s && Array.isArray(s.elements) && s.elements.length);
    }
    return o;
}
/** Field aliases the model reaches for: `presetId`/`shape` → preset, `name` → icon, `smartArt` → diagram. */
function toNumber(v) {
    if (typeof v === "number")
        return Number.isFinite(v) ? v : 0;
    const n = Number.parseFloat(String(v ?? "").replace(/[,%\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
}
/** series: [{name, values}] | [{name, data}] | {name: [..]} | [[..],[..]] → canonical. */
function normalizeSeries(raw) {
    if (!raw)
        return [];
    if (Array.isArray(raw)) {
        return raw
            .map((s, i) => {
            if (Array.isArray(s))
                return { name: `S${i + 1}`, values: s.map(toNumber) };
            if (s && typeof s === "object") {
                const o = s;
                const vals = o.values ?? o.data ?? o.points ?? o.y;
                return { name: String(o.name ?? o.label ?? `S${i + 1}`), values: Array.isArray(vals) ? vals.map(toNumber) : [] };
            }
            return { name: `S${i + 1}`, values: [] };
        })
            .filter((s) => s.values.length);
    }
    if (typeof raw === "object") {
        return Object.entries(raw)
            .filter(([, v]) => Array.isArray(v))
            .map(([name, v]) => ({ name, values: v.map(toNumber) }));
    }
    return [];
}
function normalizeElement(raw) {
    if (!raw || typeof raw !== "object")
        return raw;
    const e = { ...raw };
    for (const k of Object.keys(e))
        if (e[k] === null)
            delete e[k];
    const kind = String(e.kind ?? e.type ?? "").trim();
    if (kind && !e.kind)
        e.kind = kind;
    // device: "kpiRow" with items/text on the element → device:{type, …}
    if (e.kind === "device" && typeof e.device === "string") {
        e.deviceType = e.device;
        delete e.device;
    }
    // bbox as [x,y,w,h] or {x,y,width,height} / {left,top,…} — seen live from DeepSeek; a zod miss here costs a whole retry call.
    if (Array.isArray(e.bbox) && e.bbox.length >= 4) {
        const [x, y, w, h] = e.bbox.map(toNumber);
        e.bbox = { x, y, w, h };
    }
    else if (e.bbox && typeof e.bbox === "object") {
        const b = e.bbox;
        e.bbox = {
            x: toNumber(b.x ?? b.left),
            y: toNumber(b.y ?? b.top),
            w: toNumber(b.w ?? b.width),
            h: toNumber(b.h ?? b.height),
        };
    }
    else if (e.x != null && e.y != null && (e.w != null || e.width != null)) {
        e.bbox = { x: toNumber(e.x), y: toNumber(e.y), w: toNumber(e.w ?? e.width), h: toNumber(e.h ?? e.height) };
    }
    // Common model slips: a geometry noun as kind ("rect" + preset), a device type as kind ("kpiRow").
    if ((e.kind === "rect" || e.kind === "rectangle" || e.kind === "geometry") && e.preset)
        e.kind = "shape";
    // A circle is its own kind here; models write it as a shape preset ("ellipse" / "circle" / "oval").
    if (e.kind === "shape" && typeof e.preset === "string" && /^(ellipse|circle|oval)$/i.test(e.preset)) {
        e.kind = "ellipse";
        delete e.preset;
    }
    if (e.kind === "circle" || e.kind === "oval")
        e.kind = "ellipse";
    if (typeof e.kind === "string" && vocab_js_1.DEVICE_KINDS.includes(e.kind)) {
        if (!e.device)
            e.deviceType = e.kind;
        e.kind = "device";
    }
    // Type: models write size / fontSizePx / weight; keep the canonical names.
    if (e.fontSize == null)
        e.fontSize = e.size ?? e.fontSizePx ?? e.fontsize;
    if (typeof e.fontSize === "string")
        e.fontSize = Number.parseFloat(e.fontSize);
    if (typeof e.fontSize !== "number" || !Number.isFinite(e.fontSize))
        delete e.fontSize;
    if (e.fontWeight == null && e.weight != null)
        e.fontWeight = e.weight;
    if (e.fontWeight === "bold")
        e.fontWeight = 700;
    if (typeof e.fontWeight !== "number")
        delete e.fontWeight;
    // Art type: models write treatment / textStyle / wordArt / effect: "outline" | "gradient" | …
    if (e.kind === "text") {
        const t = (0, snap_js_1.normalizeTreatment)(e.treatment ?? e.textStyle ?? e.wordArt ?? e.textEffect ?? e.effect ?? e.artStyle);
        if (t)
            e.treatment = t;
        else
            delete e.treatment;
        for (const k of ["textStyle", "wordArt", "textEffect", "artStyle"])
            delete e[k];
    }
    else {
        delete e.treatment;
    }
    // Chart: data flattened onto the element, or nested under data/chartData.
    if (e.kind === "chart") {
        const src = (e.chart ?? e.data ?? e.chartData ?? e);
        const series = normalizeSeries(src.series ?? src.datasets ?? (Array.isArray(src.values) ? [{ name: src.name ?? "", values: src.values }] : undefined));
        const catsRaw = src.categories ?? src.labels ?? src.x;
        const categories = Array.isArray(catsRaw) ? catsRaw.map((c) => String(c ?? "")) : [];
        const typeRaw = String(src.type ?? src.chartType ?? e.chartType ?? "column").toLowerCase();
        const CHART_TYPES = ["column", "bar", "line", "area", "pie", "doughnut"];
        const aliased = typeRaw === "donut" ? "doughnut" : /^(col|columns|vertical-?bar|stacked.*)$/.test(typeRaw) ? "column" : /^(horizontal-?bar)$/.test(typeRaw) ? "bar" : typeRaw;
        const type = CHART_TYPES.includes(aliased) ? aliased : "column";
        e.chart = { type, categories: categories.length ? categories : series[0]?.values.map((_, i) => `C${i + 1}`) ?? [], series };
        for (const k of ["data", "chartData", "series", "categories", "labels", "values", "chartType"])
            delete e[k];
    }
    // Table: headers/columns + rows/cells; cells must be strings.
    if (e.kind === "table") {
        const src = (e.table ?? e.data ?? e);
        let headers = (src.headers ?? src.columns ?? src.header ?? src.head);
        let rows = (src.rows ?? src.cells ?? src.body ?? src.data);
        if (Array.isArray(rows) && rows.length && rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
            // rows as objects keyed by header
            const keys = Array.isArray(headers) && headers.length ? headers.map(String) : Object.keys(rows[0]);
            headers = keys;
            rows = rows.map((r) => keys.map((k) => r[k]));
        }
        if (!Array.isArray(headers) && Array.isArray(rows) && rows.length > 1 && Array.isArray(rows[0])) {
            // header is the first row
            headers = rows[0];
            rows = rows.slice(1);
        }
        e.table = {
            headers: Array.isArray(headers) ? headers.map((h) => String(h ?? "")) : [],
            rows: Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [String(r ?? "")])) : [],
        };
        for (const k of ["data", "headers", "columns", "header", "head", "rows", "cells", "body"])
            delete e[k];
    }
    if (e.kind === "shape") {
        // shape:{preset:"plaque"} nested, or presetId / shape / geometry as the id.
        if (e.shape && typeof e.shape === "object") {
            const sh = e.shape;
            if (!e.preset)
                e.preset = sh.preset ?? sh.presetId ?? sh.id ?? sh.type;
            if (e.text == null && typeof sh.text === "string")
                e.text = sh.text;
            if (e.strokeOnly == null && sh.strokeOnly != null)
                e.strokeOnly = sh.strokeOnly;
            delete e.shape;
        }
        if (!e.preset)
            e.preset = e.presetId ?? e.shape ?? e.geometry;
        if (typeof e.preset !== "string")
            delete e.preset;
    }
    if (e.kind === "icon") {
        if (!e.icon)
            e.icon = e.name ?? e.iconName ?? e.lucide;
        if (typeof e.icon === "string")
            e.icon = (0, vocab_js_1.normalizeIconId)(e.icon);
    }
    if (e.kind === "smartart" || e.kind === "smartArt")
        e.kind = "diagram";
    if (e.kind === "diagram" && !e.diagram) {
        const layout = e.layout ?? e.smartArt ?? e.type;
        const items = e.items ?? e.nodes;
        if (layout && Array.isArray(items))
            e.diagram = { layout, items };
    }
    if (e.kind === "device" && !e.device) {
        const type = e.deviceType ?? (e.type !== "device" ? e.type : undefined);
        if (typeof type === "string")
            e.device = { type };
    }
    // Device data written beside `device:{type}` instead of inside it ("device":{"type":"stepStrip"},
    // "items":[…]) — the most common live slip; hoist every payload key the device lacks.
    if (e.kind === "device" && e.device && typeof e.device === "object") {
        const dev = e.device;
        if (dev.type != null)
            dev.type = (0, vocab_js_1.normalizeDeviceType)(dev.type);
        for (const key of ["items", "text", "attribution", "icon", "left", "right"]) {
            if (dev[key] == null && e[key] != null)
                dev[key] = e[key];
        }
        // `steps` / `cards` / `points` / `kpis` / `rows` as the item list.
        if (dev.items == null) {
            for (const alias of ["steps", "cards", "points", "kpis", "rows", "entries", "tiles", "sections", "chapters"]) {
                if (Array.isArray(dev[alias])) {
                    dev.items = dev[alias];
                    break;
                }
                if (Array.isArray(e[alias])) {
                    dev.items = e[alias];
                    break;
                }
            }
        }
        // Agenda rows: `page` / `slide` / `goto` / `pageIndex` → target (1-based); strings coerced.
        if (Array.isArray(dev.items)) {
            dev.items = dev.items.map((it) => {
                if (!it || typeof it !== "object")
                    return it;
                const row = { ...it };
                const raw = row.target ?? row.page ?? row.slide ?? row.goto ?? row.pageIndex ?? row.slideIndex;
                delete row.page;
                delete row.slide;
                delete row.goto;
                delete row.pageIndex;
                delete row.slideIndex;
                const n = typeof raw === "string" ? Number(raw.replace(/[^\d]/g, "")) : typeof raw === "number" ? raw : NaN;
                if (Number.isInteger(n) && n >= 1)
                    row.target = n;
                else
                    delete row.target;
                return row;
            });
        }
    }
    // Element-level slide jump written as an object or a string ("page 7", "slide:3").
    if (e.link != null && typeof e.link !== "number") {
        const raw = e.link;
        const val = typeof raw === "string"
            ? Number(raw.replace(/[^\d]/g, ""))
            : raw && typeof raw === "object"
                ? Number(raw.slide ?? raw.page ?? raw.target)
                : NaN;
        if (Number.isInteger(val) && val >= 1)
            e.link = val;
        else
            delete e.link;
    }
    return e;
}
exports.CanvasDeckSchema = zod_1.z.object({
    systemId: zod_1.z.string().refine(ids_js_1.isCanvasSystemId, { message: "unknown systemId" }),
    themeId: zod_1.z.enum(["ink", "indigo", "kraft", "ikb", "signal", "lemon"]).optional(),
    palette: zod_1.z
        .object({
        bg: HexSchema,
        surface: HexSchema.optional(),
        ink: HexSchema,
        muted: HexSchema.optional(),
        line: HexSchema.optional(),
        accent: HexSchema,
        accentSoft: HexSchema.optional(),
        brand: HexSchema.optional(),
        onPhoto: HexSchema.optional(),
    })
        .optional(),
    slides: zod_1.z.array(exports.CanvasSlideSchema).min(1),
});
