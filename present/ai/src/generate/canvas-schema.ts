import { z } from "zod";
import { isCanvasSystemId } from "../deckgen/ids.js";
import { normalizeSystemId } from "../deckgen/visual-system.js";
export { normalizeSystemId };
import { DEVICE_KINDS, normalizeDeviceType, normalizeIconId } from "../deckgen/vocab.js";
import { TEXT_TREATMENTS } from "../deckgen/ir.js";
import { normalizeTreatment } from "../deckgen/snap.js";
import { SMARTART_LAYOUT_KINDS } from "@ppt/core";

const PaintRoleSchema = z.enum(["bg", "surface", "ink", "muted", "line", "accent", "accentSoft"]);

const BBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const CANVAS_ELEMENT_KINDS = [
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
] as const;

const RunSchema = z.object({
  text: z.string(),
  emphasis: z.enum(["bold", "accent", "mono"]).optional(),
});

const DeviceItemSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  value: z.string().optional(),
  note: z.string().optional(),
  icon: z.string().optional(),
  /** agendaList: 1-based page this row opens. */
  target: z.number().optional(),
});

const PlaneSchema = z.object({ title: z.string(), points: z.array(z.string()) });

export const CanvasElementSchema = z.object({
  slot: z.string().optional(),
  kind: z.enum(CANVAS_ELEMENT_KINDS),
  bbox: BBoxSchema,
  paintRole: PaintRoleSchema.optional(),
  text: z.string().optional(),
  /** Inline emphasis; concatenation replaces `text`. ≤ 2 emphasised spans. */
  runs: z.array(RunSchema).optional(),
  fontSize: z.number().optional(),
  fontWeight: z.number().optional(),
  align: z.enum(["start", "middle", "end"]).optional(),
  src: z.string().optional(),
  rx: z.number().optional(),
  fillAlpha: z.number().optional(),
  italic: z.boolean().optional(),
  caps: z.literal("all").optional(),
  glow: z.boolean().optional(),
  /** kind=text: display treatment (art type). Snap gates it per system and keeps one per page. */
  treatment: z.enum(TEXT_TREATMENTS as [string, ...string[]]).optional(),
  gradient: z
    .object({
      angle: z.number(),
      toRole: PaintRoleSchema,
      fromAlpha: z.number().optional(),
      toAlpha: z.number().optional(),
    })
    .optional(),
  shadow: z
    .object({
      blur: z.number(),
      dx: z.number(),
      dy: z.number(),
      alpha: z.number(),
    })
    .optional(),
  chart: z
    .object({
      type: z.enum(["column", "bar", "line", "area", "pie", "doughnut"]),
      categories: z.array(z.string()),
      series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
    })
    .optional(),
  table: z
    .object({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
    .optional(),
  x2: z.number().optional(),
  y2: z.number().optional(),
  dash: z.enum(["solid", "dash", "dot"]).optional(),
  arrow: z.enum(["none", "end", "both"]).optional(),
  /** kind=shape: SHAPE_LIBRARY preset id from the whitelist in the system prompt. */
  preset: z.string().optional(),
  strokeOnly: z.boolean().optional(),
  /** kind=icon: lucide id from the whitelist. */
  icon: z.string().optional(),
  /** Click → jump to this 1-based page ("see page 7", back-to-contents marks). */
  link: z.number().optional(),
  diagram: z
    .object({
      layout: z.enum(SMARTART_LAYOUT_KINDS as [string, ...string[]]),
      items: z.array(z.union([z.string(), z.object({ title: z.string(), body: z.string().optional() })])),
    })
    .optional(),
  device: z
    .object({
      type: z.enum(DEVICE_KINDS),
      items: z.array(z.union([z.string(), DeviceItemSchema])).optional(),
      text: z.string().optional(),
      attribution: z.string().optional(),
      icon: z.string().optional(),
      left: PlaneSchema.optional(),
      right: PlaneSchema.optional(),
    })
    .optional(),
});

export const CanvasSlideSchema = z.object({
  job: z.string(),
  variant: z.string().optional(),
  background: z
    .object({
      kind: z.enum(["solid", "image", "linear"]),
      src: z.string().optional(),
      paintRole: PaintRoleSchema.optional(),
      overlay: z.number().optional(),
      overlayRole: PaintRoleSchema.optional(),
      scrim: z
        .object({
          direction: z.enum(["left", "right", "top", "bottom", "radial", "flat"]),
          strength: z.number().optional(),
        })
        .optional(),
      angle: z.number().optional(),
      toRole: PaintRoleSchema.optional(),
    })
    .optional(),
  elements: z.array(CanvasElementSchema).min(1),
});

const HexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const NAMED_THEME = new Set(["ink", "indigo", "kraft", "ikb", "signal", "lemon"]);

function coerceHex(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let t = v.trim();
  if (/^0x[0-9A-Fa-f]{6}$/i.test(t)) t = `#${t.slice(2)}`;
  if (/^[0-9A-Fa-f]{6}$/.test(t)) t = `#${t}`;
  const short = t.match(/^#([0-9A-Fa-f]{3})$/);
  if (short) {
    const [a, b, c] = short[1]!;
    t = `#${a}${a}${b}${b}${c}${c}`;
  }
  return /^#[0-9A-Fa-f]{6}$/.test(t) ? t : undefined;
}

function normalizePalette(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const hex = coerceHex(v);
    if (hex) out[k] = hex;
  }
  if (!out.bg || !out.ink || !out.accent) return undefined;
  return out;
}

/**
 * Canvas JSON must not go through outline field aliases (`layout` → `layoutHint`).
 * Models often say layout/theme/shapes; map those onto the canvas schema.
 */
export function normalizeCanvasDeck(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  const sys = normalizeSystemId(o.systemId ?? o.system ?? o.visualSystem ?? o.visualSystemId);
  if (sys) o.systemId = sys;

  if (o.theme && typeof o.theme === "object" && !o.palette) o.palette = o.theme;
  const themeHint = String(o.themeId ?? (typeof o.theme === "string" ? o.theme : "")).toLowerCase();
  if (NAMED_THEME.has(themeHint)) o.themeId = themeHint;
  else delete o.themeId;

  const pal = normalizePalette(o.palette);
  if (pal) o.palette = pal;
  else delete o.palette;

  if (Array.isArray(o.slides)) {
    o.slides = o.slides
      .map((slide, i) => {
        if (!slide || typeof slide !== "object") return undefined;
        const s = { ...(slide as Record<string, unknown>) };
        const job = String(s.job ?? s.layout ?? s.intent ?? s.layoutHint ?? "").trim();
        s.job = job || `page-${i}`;
        // null / "none" background → omit; a bare string is a src (image) or a role (solid).
        if (s.background == null || s.background === "none" || s.background === "") delete s.background;
        else if (typeof s.background === "string") {
          s.background = /^(data:|https?:|blob:)/i.test(s.background) ? { kind: "image", src: s.background } : { kind: "solid", paintRole: s.background };
        }
        if (s.background && typeof s.background === "object") {
          const b = { ...(s.background as Record<string, unknown>) };
          for (const k of Object.keys(b)) if (b[k] === null) delete b[k];
          const k = String(b.kind ?? b.type ?? (b.src ? "image" : "solid")).toLowerCase();
          b.kind = k === "color" || k === "fill" || k === "flat" || k === "plain" ? "solid" : k === "photo" || k === "picture" || k === "img" ? "image" : k === "gradient" ? "linear" : k;
          if (b.kind === "solid" && !b.paintRole && typeof b.role === "string") b.paintRole = b.role;
          if (b.kind === "image" && !b.src && typeof b.url === "string") b.src = b.url;
          s.background = b;
        }
        // Drop null-valued keys everywhere on the slide (zod optional ≠ nullable).
        for (const k of Object.keys(s)) if (s[k] === null) delete s[k];
        if (!Array.isArray(s.elements) && Array.isArray(s.shapes)) s.elements = s.shapes;
        if (Array.isArray(s.elements)) s.elements = s.elements.map(normalizeElement);
        return s;
      })
      .filter((s) => s && Array.isArray((s as { elements?: unknown }).elements) && (s as { elements: unknown[] }).elements.length);
  }
  return o;
}

/** Field aliases the model reaches for: `presetId`/`shape` → preset, `name` → icon, `smartArt` → diagram. */
function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number.parseFloat(String(v ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** series: [{name, values}] | [{name, data}] | {name: [..]} | [[..],[..]] → canonical. */
function normalizeSeries(raw: unknown): Array<{ name: string; values: number[] }> {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((s, i) => {
        if (Array.isArray(s)) return { name: `S${i + 1}`, values: s.map(toNumber) };
        if (s && typeof s === "object") {
          const o = s as Record<string, unknown>;
          const vals = o.values ?? o.data ?? o.points ?? o.y;
          return { name: String(o.name ?? o.label ?? `S${i + 1}`), values: Array.isArray(vals) ? vals.map(toNumber) : [] };
        }
        return { name: `S${i + 1}`, values: [] };
      })
      .filter((s) => s.values.length);
  }
  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v))
      .map(([name, v]) => ({ name, values: (v as unknown[]).map(toNumber) }));
  }
  return [];
}

function normalizeElement(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const e = { ...(raw as Record<string, unknown>) };
  for (const k of Object.keys(e)) if (e[k] === null) delete e[k];
  const kind = String(e.kind ?? e.type ?? "").trim();
  if (kind && !e.kind) e.kind = kind;
  // device: "kpiRow" with items/text on the element → device:{type, …}
  if (e.kind === "device" && typeof e.device === "string") {
    e.deviceType = e.device;
    delete e.device;
  }
  // bbox as [x,y,w,h] or {x,y,width,height} / {left,top,…} — seen live from DeepSeek; a zod miss here costs a whole retry call.
  if (Array.isArray(e.bbox) && e.bbox.length >= 4) {
    const [x, y, w, h] = e.bbox.map(toNumber);
    e.bbox = { x, y, w, h };
  } else if (e.bbox && typeof e.bbox === "object") {
    const b = e.bbox as Record<string, unknown>;
    e.bbox = {
      x: toNumber(b.x ?? b.left),
      y: toNumber(b.y ?? b.top),
      w: toNumber(b.w ?? b.width),
      h: toNumber(b.h ?? b.height),
    };
  } else if (e.x != null && e.y != null && (e.w != null || e.width != null)) {
    e.bbox = { x: toNumber(e.x), y: toNumber(e.y), w: toNumber(e.w ?? e.width), h: toNumber(e.h ?? e.height) };
  }
  // Common model slips: a geometry noun as kind ("rect" + preset), a device type as kind ("kpiRow").
  if ((e.kind === "rect" || e.kind === "rectangle" || e.kind === "geometry") && e.preset) e.kind = "shape";
  // A circle is its own kind here; models write it as a shape preset ("ellipse" / "circle" / "oval").
  if (e.kind === "shape" && typeof e.preset === "string" && /^(ellipse|circle|oval)$/i.test(e.preset)) {
    e.kind = "ellipse";
    delete e.preset;
  }
  if (e.kind === "circle" || e.kind === "oval") e.kind = "ellipse";
  if (typeof e.kind === "string" && (DEVICE_KINDS as readonly string[]).includes(e.kind)) {
    if (!e.device) e.deviceType = e.kind;
    e.kind = "device";
  }
  // Type: models write size / fontSizePx / weight; keep the canonical names.
  if (e.fontSize == null) e.fontSize = e.size ?? e.fontSizePx ?? e.fontsize;
  if (typeof e.fontSize === "string") e.fontSize = Number.parseFloat(e.fontSize);
  if (typeof e.fontSize !== "number" || !Number.isFinite(e.fontSize)) delete e.fontSize;
  if (e.fontWeight == null && e.weight != null) e.fontWeight = e.weight;
  if (e.fontWeight === "bold") e.fontWeight = 700;
  if (typeof e.fontWeight !== "number") delete e.fontWeight;
  // Art type: models write treatment / textStyle / wordArt / effect: "outline" | "gradient" | …
  if (e.kind === "text") {
    const t = normalizeTreatment(e.treatment ?? e.textStyle ?? e.wordArt ?? e.textEffect ?? e.effect ?? e.artStyle);
    if (t) e.treatment = t;
    else delete e.treatment;
    for (const k of ["textStyle", "wordArt", "textEffect", "artStyle"]) delete e[k];
  } else {
    delete e.treatment;
  }
  // Chart: data flattened onto the element, or nested under data/chartData.
  if (e.kind === "chart") {
    const src = (e.chart ?? e.data ?? e.chartData ?? e) as Record<string, unknown>;
    const series = normalizeSeries(src.series ?? src.datasets ?? (Array.isArray(src.values) ? [{ name: src.name ?? "", values: src.values }] : undefined));
    const catsRaw = src.categories ?? src.labels ?? src.x;
    const categories = Array.isArray(catsRaw) ? catsRaw.map((c) => String(c ?? "")) : [];
    const typeRaw = String(src.type ?? src.chartType ?? e.chartType ?? "column").toLowerCase();
    const CHART_TYPES = ["column", "bar", "line", "area", "pie", "doughnut"];
    const aliased = typeRaw === "donut" ? "doughnut" : /^(col|columns|vertical-?bar|stacked.*)$/.test(typeRaw) ? "column" : /^(horizontal-?bar)$/.test(typeRaw) ? "bar" : typeRaw;
    const type = CHART_TYPES.includes(aliased) ? aliased : "column";
    e.chart = { type, categories: categories.length ? categories : series[0]?.values.map((_, i) => `C${i + 1}`) ?? [], series };
    for (const k of ["data", "chartData", "series", "categories", "labels", "values", "chartType"]) delete e[k];
  }
  // Table: headers/columns + rows/cells; cells must be strings.
  if (e.kind === "table") {
    const src = (e.table ?? e.data ?? e) as Record<string, unknown>;
    let headers = (src.headers ?? src.columns ?? src.header ?? src.head) as unknown;
    let rows = (src.rows ?? src.cells ?? src.body ?? src.data) as unknown;
    if (Array.isArray(rows) && rows.length && rows.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
      // rows as objects keyed by header
      const keys = Array.isArray(headers) && headers.length ? headers.map(String) : Object.keys(rows[0] as object);
      headers = keys;
      rows = (rows as Record<string, unknown>[]).map((r) => keys.map((k) => r[k]));
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
    for (const k of ["data", "headers", "columns", "header", "head", "rows", "cells", "body"]) delete e[k];
  }
  if (e.kind === "shape") {
    // shape:{preset:"plaque"} nested, or presetId / shape / geometry as the id.
    if (e.shape && typeof e.shape === "object") {
      const sh = e.shape as Record<string, unknown>;
      if (!e.preset) e.preset = sh.preset ?? sh.presetId ?? sh.id ?? sh.type;
      if (e.text == null && typeof sh.text === "string") e.text = sh.text;
      if (e.strokeOnly == null && sh.strokeOnly != null) e.strokeOnly = sh.strokeOnly;
      delete e.shape;
    }
    if (!e.preset) e.preset = e.presetId ?? e.shape ?? e.geometry;
    if (typeof e.preset !== "string") delete e.preset;
  }
  if (e.kind === "icon") {
    if (!e.icon) e.icon = e.name ?? e.iconName ?? e.lucide;
    if (typeof e.icon === "string") e.icon = normalizeIconId(e.icon);
  }
  if (e.kind === "smartart" || e.kind === "smartArt") e.kind = "diagram";
  if (e.kind === "diagram" && !e.diagram) {
    const layout = e.layout ?? e.smartArt ?? e.type;
    const items = e.items ?? e.nodes;
    if (layout && Array.isArray(items)) e.diagram = { layout, items };
  }
  if (e.kind === "device" && !e.device) {
    const type = e.deviceType ?? (e.type !== "device" ? e.type : undefined);
    if (typeof type === "string") e.device = { type };
  }
  // Device data written beside `device:{type}` instead of inside it ("device":{"type":"stepStrip"},
  // "items":[…]) — the most common live slip; hoist every payload key the device lacks.
  if (e.kind === "device" && e.device && typeof e.device === "object") {
    const dev = e.device as Record<string, unknown>;
    if (dev.type != null) dev.type = normalizeDeviceType(dev.type);
    for (const key of ["items", "text", "attribution", "icon", "left", "right"] as const) {
      if (dev[key] == null && e[key] != null) dev[key] = e[key];
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
        if (!it || typeof it !== "object") return it;
        const row = { ...(it as Record<string, unknown>) };
        const raw = row.target ?? row.page ?? row.slide ?? row.goto ?? row.pageIndex ?? row.slideIndex;
        delete row.page;
        delete row.slide;
        delete row.goto;
        delete row.pageIndex;
        delete row.slideIndex;
        const n = typeof raw === "string" ? Number(raw.replace(/[^\d]/g, "")) : typeof raw === "number" ? raw : NaN;
        if (Number.isInteger(n) && n >= 1) row.target = n;
        else delete row.target;
        return row;
      });
    }
  }
  // Element-level slide jump written as an object or a string ("page 7", "slide:3").
  if (e.link != null && typeof e.link !== "number") {
    const raw = e.link;
    const val =
      typeof raw === "string"
        ? Number(raw.replace(/[^\d]/g, ""))
        : raw && typeof raw === "object"
          ? Number((raw as Record<string, unknown>).slide ?? (raw as Record<string, unknown>).page ?? (raw as Record<string, unknown>).target)
          : NaN;
    if (Number.isInteger(val) && val >= 1) e.link = val;
    else delete e.link;
  }
  return e;
}

export const CanvasDeckSchema = z.object({
  systemId: z.string().refine(isCanvasSystemId, { message: "unknown systemId" }),
  themeId: z.enum(["ink", "indigo", "kraft", "ikb", "signal", "lemon"]).optional(),
  palette: z
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
  slides: z.array(CanvasSlideSchema).min(1),
});

export type CanvasDeck = z.infer<typeof CanvasDeckSchema>;
