"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUICK_STYLE_PRESETS = void 0;
const solid = (color, alpha = 1) => ({ kind: "solid", color, alpha });
const noneFill = { kind: "none" };
const stroke = (color, width, alpha = 1) => ({
    paint: { kind: "solid", color, alpha },
    width,
    cap: "round",
    join: "round",
});
/** Home → Drawing quick style presets (fill + outline combos). */
exports.QUICK_STYLE_PRESETS = [
    {
        id: "colored-outline",
        labelKey: "quickStyle.coloredOutline",
        fill: noneFill,
        stroke: stroke("#2563eb", 2.5),
    },
    {
        id: "accent-fill",
        labelKey: "quickStyle.accentFill",
        fill: solid("#3b82f6"),
        stroke: stroke("#1d4ed8", 1),
    },
    {
        id: "subtle-fill",
        labelKey: "quickStyle.subtleFill",
        fill: solid("#e2e8f0"),
        stroke: stroke("#94a3b8", 1),
    },
    {
        id: "dark-fill",
        labelKey: "quickStyle.darkFill",
        fill: solid("#0f172a"),
        stroke: stroke("#334155", 1),
    },
    {
        id: "warm-accent",
        labelKey: "quickStyle.warmAccent",
        fill: solid("#f97316"),
        stroke: stroke("#c2410c", 1),
    },
    {
        id: "green-accent",
        labelKey: "quickStyle.greenAccent",
        fill: solid("#22c55e"),
        stroke: stroke("#15803d", 1),
    },
];
