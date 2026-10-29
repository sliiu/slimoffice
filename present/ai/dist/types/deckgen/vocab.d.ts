/**
 * Canvas-path expression vocabulary — whitelists the live author may use.
 * Inventing an id outside these tables drops the element (snap) and is
 * reported back in the repair prompt. Nothing here carries hex.
 */
import { type SmartArtLayoutKind } from "@sliiu/present-core";
import type { DeviceKind } from "./ir.js";
/**
 * OOXML preset geometries the author may place as `kind: "shape"`.
 * Curated from SHAPE_LIBRARY (editor) — every id resolves via
 * `createShapeFromPreset` and round-trips to `<a:prstGeom>`.
 */
export declare const CANVAS_PRESET_IDS: readonly ["roundRect", "snipRect", "snip2DiagRect", "round2DiagRect", "plaque", "bevel", "triangle", "rtTriangle", "parallelogram", "trapezoid", "diamond", "pentagon", "hexagon", "octagon", "plus", "donut", "blockArc", "pie", "teardrop", "can", "cube", "frame", "halfFrame", "foldedCorner", "arc", "chord", "cloud", "lightningBolt", "sun", "moon", "gear6", "funnel", "leftBracket", "rightBracket", "leftBrace", "rightBrace", "rightArrow", "leftArrow", "upArrow", "downArrow", "leftRightArrow", "upDownArrow", "quadArrow", "chevron", "homePlate", "bentArrow", "uTurnArrow", "notchedRightArrow", "stripedRightArrow", "curvedRightArrow", "curvedLeftArrow", "circularArrow", "flowChartProcess", "flowChartDecision", "flowChartTerminator", "flowChartData", "flowChartConnector", "flowChartDocument", "flowChartPreparation", "flowChartDelay", "flowChartMagneticDisk", "flowChartOr", "flowChartSummingJunction", "star4", "star5", "star6", "star8", "ribbon", "wave", "explosion1", "wedgeRectCallout", "wedgeRoundRectCallout", "wedgeEllipseCallout", "cloudCallout"];
export type CanvasPresetId = (typeof CANVAS_PRESET_IDS)[number];
/** Lucide ids the author may place as `kind: "icon"` or device `icon`. */
export declare const CANVAS_ICON_IDS: readonly ["rocket", "target", "lightbulb", "zap", "flag", "trophy", "award", "star", "heart", "shield", "shield-check", "lock", "key", "eye", "search", "compass", "map", "map-pin", "globe", "building-2", "factory", "briefcase", "wallet", "coins", "credit-card", "banknote", "piggy-bank", "trending-up", "trending-down", "chart-column", "chart-line", "chart-pie", "chart-bar", "activity", "gauge", "percent", "calculator", "scale", "clock", "calendar", "timer", "hourglass", "history", "users", "user", "user-check", "user-plus", "handshake", "message-circle", "message-square", "megaphone", "mail", "phone", "send", "bell", "book-open", "graduation-cap", "file-text", "clipboard-check", "list-checks", "check", "circle-check", "circle-x", "x", "triangle-alert", "circle-alert", "info", "circle-help", "settings", "wrench", "cog", "hammer", "package", "box", "boxes", "truck", "ship", "plane", "car", "train-front", "cpu", "server", "database", "cloud", "cloud-upload", "download", "upload", "wifi", "smartphone", "laptop", "monitor", "code", "terminal", "git-branch", "layers", "layout-grid", "puzzle", "workflow", "network", "share-2", "link", "refresh-cw", "repeat", "shuffle", "arrow-right", "arrow-up-right", "arrow-down-right", "arrow-left-right", "chevron-right", "move-right", "sparkles", "sun", "moon", "leaf", "tree-pine", "recycle", "droplets", "flame", "wind", "mountain", "camera", "image", "video", "music", "mic", "headphones", "gift", "shopping-cart", "shopping-bag", "store", "tag", "ticket", "utensils", "coffee", "stethoscope", "heart-pulse", "pill", "dna", "microscope", "flask-conical", "atom", "brain", "bot", "fingerprint", "scan", "quote"];
export type CanvasIconId = (typeof CANVAS_ICON_IDS)[number];
/** Lucide ids are kebab-case; models write "Rocket", "TrendingUp", "trending_up", "lucide:rocket". */
export declare function normalizeIconId(raw: unknown): string;
/** Icon exists in the shipped lucide build (independent of the curated list). */
export declare function lucideHasIcon(id: string): boolean;
export declare const CANVAS_DIAGRAM_LAYOUTS: readonly SmartArtLayoutKind[];
export declare const DEVICE_KINDS: readonly ["kpiRow", "stepStrip", "numberedList", "takeawayBand", "quoteBlock", "calloutNote", "comparePlanes", "iconLabelGrid", "agendaList"];
/** Short menu for the author prompt — what each device is for and what it needs. */
export declare const DEVICE_MENU: Record<DeviceKind, string>;
export declare function isCanvasPresetId(id: string): id is CanvasPresetId;
export declare function isCanvasIconId(id: string): boolean;
export declare function isCanvasDiagramLayout(id: string): id is SmartArtLayoutKind;
export declare function isDeviceKind(id: string): id is DeviceKind;
export declare function normalizeDeviceType(raw: unknown): string;
/** Vocabulary summary for the author prompt (one line each, no hex). */
export declare function vocabularyPromptLines(): string[];
