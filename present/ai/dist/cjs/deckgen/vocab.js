"use strict";
/**
 * Canvas-path expression vocabulary — whitelists the live author may use.
 * Inventing an id outside these tables drops the element (snap) and is
 * reported back in the repair prompt. Nothing here carries hex.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEVICE_MENU = exports.DEVICE_KINDS = exports.CANVAS_DIAGRAM_LAYOUTS = exports.CANVAS_ICON_IDS = exports.CANVAS_PRESET_IDS = void 0;
exports.normalizeIconId = normalizeIconId;
exports.lucideHasIcon = lucideHasIcon;
exports.isCanvasPresetId = isCanvasPresetId;
exports.isCanvasIconId = isCanvasIconId;
exports.isCanvasDiagramLayout = isCanvasDiagramLayout;
exports.isDeviceKind = isDeviceKind;
exports.normalizeDeviceType = normalizeDeviceType;
exports.vocabularyPromptLines = vocabularyPromptLines;
const core_1 = require("@sliiu/present-core");
const lucide_1 = require("lucide");
/**
 * OOXML preset geometries the author may place as `kind: "shape"`.
 * Curated from SHAPE_LIBRARY (editor) — every id resolves via
 * `createShapeFromPreset` and round-trips to `<a:prstGeom>`.
 */
exports.CANVAS_PRESET_IDS = [
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
];
const PRESET_SET = new Set(exports.CANVAS_PRESET_IDS);
/** Lucide ids the author may place as `kind: "icon"` or device `icon`. */
exports.CANVAS_ICON_IDS = [
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
];
const ICON_SET = new Set(exports.CANVAS_ICON_IDS);
function kebabToPascal(id) {
    return id.replace(/[-_]+(.)/g, (_, c) => c.toUpperCase()).replace(/^(.)/, (m) => m.toUpperCase());
}
/** Lucide ids are kebab-case; models write "Rocket", "TrendingUp", "trending_up", "lucide:rocket". */
function normalizeIconId(raw) {
    return String(raw ?? "")
        .trim()
        .replace(/^lucide[:/-]/i, "")
        .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
        .replace(/[\s_]+/g, "-")
        .toLowerCase();
}
/** Icon exists in the shipped lucide build (independent of the curated list). */
function lucideHasIcon(id) {
    const rec = lucide_1.icons;
    return Boolean(rec[id] ?? rec[kebabToPascal(id)]);
}
exports.CANVAS_DIAGRAM_LAYOUTS = core_1.SMARTART_LAYOUT_KINDS;
const DIAGRAM_SET = new Set(core_1.SMARTART_LAYOUT_KINDS);
exports.DEVICE_KINDS = [
    "kpiRow",
    "stepStrip",
    "numberedList",
    "takeawayBand",
    "quoteBlock",
    "calloutNote",
    "comparePlanes",
    "iconLabelGrid",
    "agendaList",
];
const DEVICE_SET = new Set(exports.DEVICE_KINDS);
/** Short menu for the author prompt — what each device is for and what it needs. */
exports.DEVICE_MENU = {
    kpiRow: "2–4 metrics side by side · items[{value,title,note?}] · use for numbers that must be read first",
    stepStrip: "3–6 ordered steps as numbered nodes with connectors · items[{title,body?}] · order / process",
    numberedList: "3–6 rows, numeral badge + title + body · items[{title,body?}] · ranked or ordered points",
    takeawayBand: "one-line conclusion in an accent band · text · bottom of an evidence page",
    quoteBlock: "large quotation mark + quote + attribution · text, attribution? · quote pages",
    calloutNote: "icon + one short warning / insight in a soft surface · text, icon? · one per page max",
    comparePlanes: "two columns with headers and points · left{title,points[]}, right{title,points[]} · contrast · the RIGHT plane is the favoured side (accent header, “+” points; left is neutral with “–” points) — put the option you argue for on the right",
    iconLabelGrid: "2–6 icon tiles with title and body · items[{icon,title,body?}] · membership / features",
    agendaList: "contents / 目录: 3–8 rows, numeral + section title + one-line body?, every row is a click-to-jump link · items[{title, body?, target}] · target = 1-based page number of the section it opens (otherPages index + 1) · only on job=agenda pages, one per deck",
};
function isCanvasPresetId(id) {
    return PRESET_SET.has(id);
}
function isCanvasIconId(id) {
    return ICON_SET.has(id) || lucideHasIcon(id);
}
function isCanvasDiagramLayout(id) {
    return DIAGRAM_SET.has(id);
}
function isDeviceKind(id) {
    return DEVICE_SET.has(id);
}
const DEVICE_ALIASES = {
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
const DEVICE_BY_FLAT = new Map(exports.DEVICE_KINDS.map((k) => [k.toLowerCase(), k]));
function normalizeDeviceType(raw) {
    const s = String(raw ?? "").trim();
    if (!s || DEVICE_SET.has(s))
        return s;
    const flat = s.toLowerCase().replace(/[\s_-]+/g, "");
    return DEVICE_BY_FLAT.get(flat) ?? DEVICE_ALIASES[flat] ?? s;
}
/** Vocabulary summary for the author prompt (one line each, no hex). */
function vocabularyPromptLines() {
    return [
        `shape.preset ∈ { ${exports.CANVAS_PRESET_IDS.join(" ")} }`,
        `icon.icon ∈ { ${exports.CANVAS_ICON_IDS.join(" ")} }`,
        `diagram.layout ∈ { ${exports.CANVAS_DIAGRAM_LAYOUTS.join(" ")} } with items[{title, body?}] (3–7 items)`,
        `device.type ∈ { ${exports.DEVICE_KINDS.join(" ")} }`,
        ...exports.DEVICE_KINDS.map((d) => `  ${d}: ${exports.DEVICE_MENU[d]}`),
    ];
}
