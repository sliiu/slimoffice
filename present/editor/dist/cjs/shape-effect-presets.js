"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHAPE_EFFECT_PRESETS = void 0;
/** Format tab / Inspector → shape effect shortcuts (full editor via AI tools). */
exports.SHAPE_EFFECT_PRESETS = [
    {
        id: "none",
        labelKey: "shapeEffect.none",
        swatch: "transparent",
        patch: { shadow: null, glow: null, softEdge: null, reflection: null },
    },
    {
        id: "shadow-soft",
        labelKey: "shapeEffect.shadowSoft",
        swatch: "0 2px 6px rgba(0,0,0,.25)",
        patch: {
            shadow: { kind: "outer", blur: 6, dist: 3, dir: 90, color: "#000000", alpha: 0.3 },
        },
    },
    {
        id: "shadow-medium",
        labelKey: "shapeEffect.shadowMedium",
        swatch: "0 4px 10px rgba(0,0,0,.35)",
        patch: {
            shadow: { kind: "outer", blur: 8, dist: 5, dir: 90, color: "#000000", alpha: 0.4 },
        },
    },
    {
        id: "shadow-strong",
        labelKey: "shapeEffect.shadowStrong",
        swatch: "0 6px 16px rgba(0,0,0,.45)",
        patch: {
            shadow: { kind: "outer", blur: 12, dist: 8, dir: 90, color: "#000000", alpha: 0.5 },
        },
    },
    {
        id: "shadow-inner",
        labelKey: "shapeEffect.shadowInner",
        swatch: "inset 0 2px 6px rgba(0,0,0,.35)",
        patch: {
            shadow: { kind: "inner", blur: 6, dist: 2, dir: 90, color: "#000000", alpha: 0.35 },
        },
    },
    {
        id: "glow-blue",
        labelKey: "shapeEffect.glowBlue",
        swatch: "0 0 12px #3b82f6",
        patch: { glow: { radius: 8, color: "#3b82f6", alpha: 0.65 } },
    },
    {
        id: "glow-gold",
        labelKey: "shapeEffect.glowGold",
        swatch: "0 0 12px #f59e0b",
        patch: { glow: { radius: 8, color: "#f59e0b", alpha: 0.7 } },
    },
    {
        id: "glow-green",
        labelKey: "shapeEffect.glowGreen",
        swatch: "0 0 12px #22c55e",
        patch: { glow: { radius: 8, color: "#22c55e", alpha: 0.65 } },
    },
    {
        id: "soft-edge",
        labelKey: "shapeEffect.softEdge",
        swatch: "0 0 8px rgba(0,0,0,.15)",
        patch: { softEdge: { radius: 6 } },
    },
    {
        id: "reflection",
        labelKey: "shapeEffect.reflection",
        swatch: "linear-gradient(180deg, rgba(255,255,255,.4), transparent)",
        patch: { reflection: { blur: 4, startAlpha: 0.45, endAlpha: 0, dist: 4, dir: 90 } },
    },
];
