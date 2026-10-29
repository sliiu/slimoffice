/**
 * Canvas-path expression vocabulary — whitelists the live author may use.
 * Inventing an id outside these tables drops the element (snap) and is
 * reported back in the repair prompt. Nothing here carries hex.
 */

import { SMARTART_LAYOUT_KINDS, type SmartArtLayoutKind } from "@ppt/core";
import { icons } from "lucide";
import type { DeviceKind } from "./ir.js";

/**
 * OOXML preset geometries the author may place as `kind: "shape"`.
 * Curated from SHAPE_LIBRARY (editor) — every id resolves via
 * `createShapeFromPreset` and round-trips to `<a:prstGeom>`.
 */
export const CANVAS_PRESET_IDS = [
  // rect family
  "roundRect",
  "snipRect",
  "snip2DiagRect",
  "round2DiagRect",
  "plaque",
  "bevel",
  // basic
  "triangle",
  "rtTriangle",
  "parallelogram",
  "trapezoid",
  "diamond",
  "pentagon",
  "hexagon",
  "octagon",
  "plus",
  "donut",
  "blockArc",
  "pie",
  "teardrop",
  "can",
  "cube",
  "frame",
  "halfFrame",
  "foldedCorner",
  "arc",
  "chord",
  "cloud",
  "lightningBolt",
  "sun",
  "moon",
  "gear6",
  "funnel",
  "leftBracket",
  "rightBracket",
  "leftBrace",
  "rightBrace",
  // arrows
  "rightArrow",
  "leftArrow",
  "upArrow",
  "downArrow",
  "leftRightArrow",
  "upDownArrow",
  "quadArrow",
  "chevron",
  "homePlate",
  "bentArrow",
  "uTurnArrow",
  "notchedRightArrow",
  "stripedRightArrow",
  "curvedRightArrow",
  "curvedLeftArrow",
  "circularArrow",
  // flowchart
  "flowChartProcess",
  "flowChartDecision",
  "flowChartTerminator",
  "flowChartData",
  "flowChartConnector",
  "flowChartDocument",
  "flowChartPreparation",
  "flowChartDelay",
  "flowChartMagneticDisk",
  "flowChartOr",
  "flowChartSummingJunction",
  // stars / banners
  "star4",
  "star5",
  "star6",
  "star8",
  "ribbon",
  "wave",
  "explosion1",
  // callouts
  "wedgeRectCallout",
  "wedgeRoundRectCallout",
  "wedgeEllipseCallout",
  "cloudCallout",
] as const;
export type CanvasPresetId = (typeof CANVAS_PRESET_IDS)[number];

const PRESET_SET = new Set<string>(CANVAS_PRESET_IDS);

/** Lucide ids the author may place as `kind: "icon"` or device `icon`. */
export const CANVAS_ICON_IDS = [
  "rocket",
  "target",
  "lightbulb",
  "zap",
  "flag",
  "trophy",
  "award",
  "star",
  "heart",
  "shield",
  "shield-check",
  "lock",
  "key",
  "eye",
  "search",
  "compass",
  "map",
  "map-pin",
  "globe",
  "building-2",
  "factory",
  "briefcase",
  "wallet",
  "coins",
  "credit-card",
  "banknote",
  "piggy-bank",
  "trending-up",
  "trending-down",
  "chart-column",
  "chart-line",
  "chart-pie",
  "chart-bar",
  "activity",
  "gauge",
  "percent",
  "calculator",
  "scale",
  "clock",
  "calendar",
  "timer",
  "hourglass",
  "history",
  "users",
  "user",
  "user-check",
  "user-plus",
  "handshake",
  "message-circle",
  "message-square",
  "megaphone",
  "mail",
  "phone",
  "send",
  "bell",
  "book-open",
  "graduation-cap",
  "file-text",
  "clipboard-check",
  "list-checks",
  "check",
  "circle-check",
  "circle-x",
  "x",
  "triangle-alert",
  "circle-alert",
  "info",
  "circle-help",
  "settings",
  "wrench",
  "cog",
  "hammer",
  "package",
  "box",
  "boxes",
  "truck",
  "ship",
  "plane",
  "car",
  "train-front",
  "cpu",
  "server",
  "database",
  "cloud",
  "cloud-upload",
  "download",
  "upload",
  "wifi",
  "smartphone",
  "laptop",
  "monitor",
  "code",
  "terminal",
  "git-branch",
  "layers",
  "layout-grid",
  "puzzle",
  "workflow",
  "network",
  "share-2",
  "link",
  "refresh-cw",
  "repeat",
  "shuffle",
  "arrow-right",
  "arrow-up-right",
  "arrow-down-right",
  "arrow-left-right",
  "chevron-right",
  "move-right",
  "sparkles",
  "sun",
  "moon",
  "leaf",
  "tree-pine",
  "recycle",
  "droplets",
  "flame",
  "wind",
  "mountain",
  "camera",
  "image",
  "video",
  "music",
  "mic",
  "headphones",
  "gift",
  "shopping-cart",
  "shopping-bag",
  "store",
  "tag",
  "ticket",
  "utensils",
  "coffee",
  "stethoscope",
  "heart-pulse",
  "pill",
  "dna",
  "microscope",
  "flask-conical",
  "atom",
  "brain",
  "bot",
  "fingerprint",
  "scan",
  "quote",
] as const;
export type CanvasIconId = (typeof CANVAS_ICON_IDS)[number];

const ICON_SET = new Set<string>(CANVAS_ICON_IDS);

function kebabToPascal(id: string): string {
  return id.replace(/[-_]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^(.)/, (m) => m.toUpperCase());
}

/** Lucide ids are kebab-case; models write "Rocket", "TrendingUp", "trending_up", "lucide:rocket". */
export function normalizeIconId(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/^lucide[:/-]/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/** Icon exists in the shipped lucide build (independent of the curated list). */
export function lucideHasIcon(id: string): boolean {
  const rec = icons as Record<string, unknown>;
  return Boolean(rec[id] ?? rec[kebabToPascal(id)]);
}

export const CANVAS_DIAGRAM_LAYOUTS: readonly SmartArtLayoutKind[] = SMARTART_LAYOUT_KINDS;
const DIAGRAM_SET = new Set<string>(SMARTART_LAYOUT_KINDS);

export const DEVICE_KINDS = [
  "kpiRow",
  "stepStrip",
  "numberedList",
  "takeawayBand",
  "quoteBlock",
  "calloutNote",
  "comparePlanes",
  "iconLabelGrid",
  "agendaList",
] as const satisfies readonly DeviceKind[];
const DEVICE_SET = new Set<string>(DEVICE_KINDS);

/** Short menu for the author prompt — what each device is for and what it needs. */
export const DEVICE_MENU: Record<DeviceKind, string> = {
  kpiRow: "2–4 metrics side by side · items[{value,title,note?}] · use for numbers that must be read first",
  stepStrip: "3–6 ordered steps as numbered nodes with connectors · items[{title,body?}] · order / process",
  numberedList: "3–6 rows, numeral badge + title + body · items[{title,body?}] · ranked or ordered points",
  takeawayBand: "one-line conclusion in an accent band · text · bottom of an evidence page",
  quoteBlock: "large quotation mark + quote + attribution · text, attribution? · quote pages",
  calloutNote: "icon + one short warning / insight in a soft surface · text, icon? · one per page max",
  comparePlanes: "two columns with headers and points · left{title,points[]}, right{title,points[]} · contrast · the RIGHT plane is the favoured side (accent header, “+” points; left is neutral with “–” points) — put the option you argue for on the right",
  iconLabelGrid: "2–6 icon tiles with title and body · items[{icon,title,body?}] · membership / features",
  agendaList:
    "contents / 目录: 3–8 rows, numeral + section title + one-line body?, every row is a click-to-jump link · items[{title, body?, target}] · target = 1-based page number of the section it opens (otherPages index + 1) · only on job=agenda pages, one per deck",
};

export function isCanvasPresetId(id: string): id is CanvasPresetId {
  return PRESET_SET.has(id);
}

export function isCanvasIconId(id: string): boolean {
  return ICON_SET.has(id) || lucideHasIcon(id);
}

export function isCanvasDiagramLayout(id: string): id is SmartArtLayoutKind {
  return DIAGRAM_SET.has(id);
}

export function isDeviceKind(id: string): id is DeviceKind {
  return DEVICE_SET.has(id);
}

const DEVICE_ALIASES: Record<string, DeviceKind> = {
  kpi: "kpiRow",
  kpis: "kpiRow",
  metrics: "kpiRow",
  stats: "kpiRow",
  steps: "stepStrip",
  process: "stepStrip",
  timeline: "stepStrip",
  list: "numberedList",
  numbered: "numberedList",
  numberedlist: "numberedList",
  takeaway: "takeawayBand",
  band: "takeawayBand",
  quote: "quoteBlock",
  callout: "calloutNote",
  note: "calloutNote",
  compare: "comparePlanes",
  comparison: "comparePlanes",
  planes: "comparePlanes",
  grid: "iconLabelGrid",
  icongrid: "iconLabelGrid",
  tiles: "iconLabelGrid",
  cards: "iconLabelGrid",
  agenda: "agendaList",
  toc: "agendaList",
  contents: "agendaList",
  tableofcontents: "agendaList",
  目录: "agendaList",
  outline: "agendaList",
};

/** Canonical device type from a loose name ("KPI row", "quote", "icon-grid"); returns the input when unknown. */
const DEVICE_BY_FLAT = new Map<string, DeviceKind>(DEVICE_KINDS.map((k) => [k.toLowerCase(), k]));

export function normalizeDeviceType(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s || DEVICE_SET.has(s)) return s;
  const flat = s.toLowerCase().replace(/[\s_-]+/g, "");
  return DEVICE_BY_FLAT.get(flat) ?? DEVICE_ALIASES[flat] ?? s;
}

/** Vocabulary summary for the author prompt (one line each, no hex). */
export function vocabularyPromptLines(): string[] {
  return [
    `shape.preset ∈ { ${CANVAS_PRESET_IDS.join(" ")} }`,
    `icon.icon ∈ { ${CANVAS_ICON_IDS.join(" ")} }`,
    `diagram.layout ∈ { ${CANVAS_DIAGRAM_LAYOUTS.join(" ")} } with items[{title, body?}] (3–7 items)`,
    `device.type ∈ { ${DEVICE_KINDS.join(" ")} }`,
    ...DEVICE_KINDS.map((d) => `  ${d}: ${DEVICE_MENU[d]}`),
  ];
}
