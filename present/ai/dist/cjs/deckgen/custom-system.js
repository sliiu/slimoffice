"use strict";
/**
 * User-defined VisualSystems.
 *
 * A skill `.md` may carry one or more fenced blocks whose info string contains
 * `visual-system`; each holds a JSON object in the shape of {@link CustomVisualSystemDef}.
 * Everything is optional except `id`: missing fields come from the builtin system named by
 * `extends` (default `swiss`). The block is validated with zod on upload (save is refused
 * on a hard error) and turned into a {@link RegisteredVisualSystem} when the skill is
 * enabled. Colors are a *seed* only — the author still writes palette hex per deck.
 *
 * ```visual-system
 * {
 *   "id": "apple_keynote",
 *   "name": "Apple keynote",
 *   "extends": "soft-rounded",
 *   "voice": "neo-grotesk",
 *   "typeScale": { "display": 80, "displayCjk": 64, "h1": 40, "h2": 24, "body": 18, "caption": 13 },
 *   "fonts": { "display": "\"SF Pro Display\", \"Inter\", \"PingFang SC\", sans-serif" },
 *   "fontFamilies": ["Inter", "Noto Sans SC"],
 *   "canvas": { "radius": 18, "shadow": false, "glow": false, "tone": "light", "displayTreatment": "none",
 *               "character": "white paper, one product accent, semibold display, one idea per page" },
 *   "palette": { "bg": "#FFFFFF", "ink": "#1D1D1F", "accent": "#0071E3" },
 *   "aliases": ["apple", "keynote"]
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomVisualSystemError = exports.CustomVisualSystemSchema = void 0;
exports.extractCustomVisualSystems = extractCustomVisualSystems;
exports.formatCustomVisualSystemBlock = formatCustomVisualSystemBlock;
exports.buildCustomVisualSystem = buildCustomVisualSystem;
const zod_1 = require("zod");
const ids_js_1 = require("./ids.js");
const visual_system_js_1 = require("./visual-system.js");
const color_js_1 = require("../generate/qa/color.js");
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const Hex = zod_1.z.string().regex(HEX_RE, "expected #RRGGBB");
const Px = zod_1.z.number().finite().min(8).max(200);
exports.CustomVisualSystemSchema = zod_1.z
    .object({
    id: zod_1.z.string().regex(ids_js_1.CUSTOM_SYSTEM_ID_RE, "id must be lower_snake (a-z, 0-9, _), start with a letter, ≤64 chars"),
    name: zod_1.z.string().min(1).max(60).optional(),
    /** Builtin system whose values fill every field left out here. */
    extends: zod_1.z.enum(ids_js_1.CANVAS_SYSTEM_IDS).optional(),
    voice: zod_1.z.enum(visual_system_js_1.TYPE_VOICES).optional(),
    typeScale: zod_1.z
        .object({
        display: Px.optional(),
        displayCjk: Px.optional(),
        h1: Px.optional(),
        h2: Px.optional(),
        body: Px.optional(),
        caption: Px.optional(),
    })
        .strict()
        .optional(),
    grid: zod_1.z
        .object({
        columns: zod_1.z.number().int().min(4).max(24).optional(),
        gutter: zod_1.z.number().min(0).max(64).optional(),
        margin: zod_1.z.number().min(0.02).max(0.12).optional(),
    })
        .strict()
        .optional(),
    density: zod_1.z.enum(["airy", "tight"]).optional(),
    bans: zod_1.z
        .object({
        roundedCorners: zod_1.z.boolean().optional(),
        shadows: zod_1.z.boolean().optional(),
        gradients: zod_1.z.boolean().optional(),
        centeredDisplay: zod_1.z.boolean().optional(),
    })
        .strict()
        .optional(),
    fonts: zod_1.z
        .object({
        display: zod_1.z.string().min(1).max(200).optional(),
        body: zod_1.z.string().min(1).max(200).optional(),
        mono: zod_1.z.string().min(1).max(200).optional(),
    })
        .strict()
        .optional(),
    /** Google Font family names to load in the browser (unknown names are ignored, lint warns). */
    fontFamilies: zod_1.z.array(zod_1.z.string().min(1).max(60)).max(8).optional(),
    canvas: zod_1.z
        .object({
        radius: zod_1.z.number().min(0).max(64).optional(),
        shadow: zod_1.z.boolean().optional(),
        glow: zod_1.z.boolean().optional(),
        tone: zod_1.z.enum(["light", "dark"]).optional(),
        ruleWidth: zod_1.z.number().min(0.5).max(8).optional(),
        displayTreatment: zod_1.z.enum(["none", "gradient", "outline", "shadow", "glow"]).optional(),
        character: zod_1.z.string().min(1).max(240).optional(),
    })
        .strict()
        .optional(),
    /** Seed palette (bg + ink + accent required when present; the rest is derived). */
    palette: zod_1.z
        .object({
        bg: Hex,
        surface: Hex.optional(),
        ink: Hex,
        muted: Hex.optional(),
        line: Hex.optional(),
        accent: Hex,
        accentSoft: Hex.optional(),
    })
        .strict()
        .optional(),
    aliases: zod_1.z.array(zod_1.z.string().min(2).max(30)).max(8).optional(),
})
    .strict();
/** Fence info strings that mark a visual-system block: ```visual-system, ```json visual-system, ```visualsystem. */
const FENCE_RE = /```([^\n]*)\n([\s\S]*?)```/g;
function isVisualSystemFence(info) {
    return /\bvisual[-_ ]?system\b/i.test(info);
}
class CustomVisualSystemError extends Error {
    blockIndex;
    constructor(message, blockIndex) {
        super(message);
        this.blockIndex = blockIndex;
        this.name = "CustomVisualSystemError";
    }
}
exports.CustomVisualSystemError = CustomVisualSystemError;
/**
 * Pull every ```visual-system block out of a skill body. Returns the parsed definitions and
 * the body with those blocks removed (the JSON must not reach the prompt). Throws
 * {@link CustomVisualSystemError} on malformed JSON or schema violations.
 */
function extractCustomVisualSystems(body) {
    const defs = [];
    let index = 0;
    const seen = new Set();
    const stripped = body.replace(FENCE_RE, (whole, info, code) => {
        if (!isVisualSystemFence(info))
            return whole;
        const n = index++;
        let raw;
        try {
            raw = JSON.parse(code);
        }
        catch (e) {
            throw new CustomVisualSystemError(`visual-system block #${n + 1}: invalid JSON (${e.message})`, n);
        }
        const result = exports.CustomVisualSystemSchema.safeParse(raw);
        if (!result.success) {
            const first = result.error.issues[0];
            const path = first?.path.join(".") || "(root)";
            throw new CustomVisualSystemError(`visual-system block #${n + 1}: ${path}: ${first?.message ?? "invalid"}`, n);
        }
        const def = result.data;
        if ((0, ids_js_1.isBuiltinCanvasSystemId)(def.id)) {
            throw new CustomVisualSystemError(`visual-system block #${n + 1}: "${def.id}" is a builtin system id and cannot be redefined`, n);
        }
        if (seen.has(def.id)) {
            throw new CustomVisualSystemError(`visual-system block #${n + 1}: duplicate system id "${def.id}"`, n);
        }
        seen.add(def.id);
        defs.push(def);
        return "";
    });
    return { defs, body: stripped.replace(/\n{3,}/g, "\n\n").trim() };
}
/** Writes a definition back as the fenced block `extractCustomVisualSystems` reads. */
function formatCustomVisualSystemBlock(def) {
    return "```visual-system\n" + JSON.stringify(def, null, 2) + "\n```";
}
/**
 * Resolve a definition against its base: every field the author left out is the base's.
 * `alignment` is always flush-left — the whole canvas pipeline assumes it.
 */
function buildCustomVisualSystem(def, skillId) {
    const base = visual_system_js_1.VISUAL_SYSTEMS[def.extends ?? "swiss"];
    const typeScale = { ...base.typeScale, ...stripUndefined(def.typeScale ?? {}) };
    if (def.typeScale && def.typeScale.display != null && def.typeScale.displayCjk == null && base.typeScale.displayCjk != null) {
        // A new Latin display size with an inherited CJK override would invert the ramp; drop the override.
        delete typeScale.displayCjk;
    }
    const system = {
        id: def.id,
        name: def.name ?? def.id.replace(/_/g, " "),
        voice: def.voice ?? base.voice,
        typeScale,
        grid: { ...base.grid, ...stripUndefined(def.grid ?? {}) },
        alignment: { title: "start", body: "start" },
        density: def.density ?? base.density,
        bans: { ...base.bans, ...stripUndefined(def.bans ?? {}) },
        fonts: { ...base.fonts, ...stripUndefined(def.fonts ?? {}) },
        canvas: { ...base.canvas, ...stripUndefined(def.canvas ?? {}) },
    };
    // Policy and bans must agree: a system that bans rounded corners has radius 0, and vice versa.
    if (def.canvas?.radius != null && def.bans?.roundedCorners == null)
        system.bans.roundedCorners = def.canvas.radius === 0;
    if (def.canvas?.shadow != null && def.bans?.shadows == null)
        system.bans.shadows = !def.canvas.shadow;
    if (def.bans?.roundedCorners && def.canvas?.radius == null)
        system.canvas.radius = 0;
    if (def.bans?.shadows && def.canvas?.shadow == null)
        system.canvas.shadow = false;
    const fontFamilies = def.fontFamilies ?? visual_system_js_1.DECKGEN_FONT_FAMILIES[def.extends ?? "swiss"];
    return {
        system,
        fontFamilies,
        ...(def.palette ? { seedPalette: completeSeedPalette(def.palette) } : {}),
        aliases: (def.aliases ?? []).map((a) => a.toLowerCase()),
        ...(skillId ? { skillId } : {}),
    };
}
/** bg / ink / accent are authored; surface, muted, line, accentSoft are derived like mergeAuthoredPalette does. */
function completeSeedPalette(p) {
    const bg = (0, color_js_1.parseHex)(p.bg);
    const ink = (0, color_js_1.parseHex)(p.ink);
    const accent = (0, color_js_1.parseHex)(p.accent);
    const dark = (0, color_js_1.relativeLuminance)(bg) < 0.5;
    const white = { r: 255, g: 255, b: 255 };
    return {
        bg: p.bg,
        surface: p.surface ?? (0, color_js_1.toHex)(dark ? (0, color_js_1.mixRgb)(bg, white, 0.08) : (0, color_js_1.relativeLuminance)(bg) < 0.85 ? (0, color_js_1.mixRgb)(bg, white, 0.8) : (0, color_js_1.mixRgb)(bg, ink, 0.04)),
        ink: p.ink,
        muted: p.muted ?? (0, color_js_1.toHex)((0, color_js_1.mixRgb)(ink, bg, 0.35)),
        line: p.line ?? (0, color_js_1.toHex)((0, color_js_1.mixRgb)(bg, ink, dark ? 0.22 : 0.14)),
        accent: p.accent,
        accentSoft: p.accentSoft ?? (0, color_js_1.toHex)((0, color_js_1.mixRgb)(accent, bg, dark ? 0.75 : 0.86)),
    };
}
function stripUndefined(o) {
    const out = {};
    for (const [k, v] of Object.entries(o))
        if (v !== undefined)
            out[k] = v;
    return out;
}
