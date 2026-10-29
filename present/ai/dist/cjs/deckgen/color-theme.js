"use strict";
/**
 * L4 ColorTheme — id + VisualSystem pairing + registered palettes.
 * Token keys are exactly: bg · surface · ink · muted · line · accent · accentSoft
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANVAS_SYSTEM_SEED_PALETTES = exports.PALETTE_FLOORS = exports.COLOR_THEME_PALETTES = void 0;
exports.registerColorThemePalette = registerColorThemePalette;
exports.resolveColorTheme = resolveColorTheme;
exports.defaultColorThemeId = defaultColorThemeId;
exports.isHexColor = isHexColor;
exports.harmonizePalette = harmonizePalette;
exports.onRoleText = onRoleText;
exports.seedColorTheme = seedColorTheme;
exports.mergeAuthoredPalette = mergeAuthoredPalette;
exports.themeFromAuthoredLook = themeFromAuthoredLook;
exports.parseBrandHex = parseBrandHex;
exports.paletteOf = paletteOf;
exports.isPaintRole = isPaintRole;
exports.listColorThemes = listColorThemes;
exports.pairingTable = pairingTable;
exports.parseSystemId = parseSystemId;
const ids_js_1 = require("./ids.js");
const visual_system_js_1 = require("./visual-system.js");
const color_js_1 = require("../generate/qa/color.js");
function palette(bg, surface, ink, muted, line, accent, accentSoft) {
    return { bg, surface, ink, muted, line, accent, accentSoft };
}
/**
 * Locked ColorTheme hex (token order: bg surface ink muted line accent accentSoft).
 * Editorial palettes keep accent equal to ink (no third hue).
 * Swiss palettes share paper / grey / ink and a single accent.
 */
exports.COLOR_THEME_PALETTES = {
    ink: palette("#F1EFEA", "#E8E5DE", "#0A0A0B", "#5C5852", "#C8C2B6", "#0A0A0B", "#E8E5DE"),
    indigo: palette("#F1F3F5", "#E4E8EC", "#0A1F3D", "#5A6B7D", "#C5CDD8", "#0A1F3D", "#E4E8EC"),
    kraft: palette("#EEDFC7", "#E0D0B6", "#2A1E13", "#6B5744", "#C9B396", "#2A1E13", "#E0D0B6"),
    ikb: palette("#FAFAF8", "#F0F0EE", "#0A0A0A", "#737373", "#D4D4D2", "#002FA7", "#E8ECF6"),
    signal: palette("#FAFAF8", "#F0F0EE", "#0A0A0A", "#737373", "#D4D4D2", "#FF6B35", "#F6E8E2"),
    lemon: palette("#FAFAF8", "#F0F0EE", "#0A0A0A", "#737373", "#D4D4D2", "#C5E803", "#F3F6E0"),
};
const REGISTRY = {
    ink: { id: "ink", systemId: "editorial" },
    indigo: { id: "indigo", systemId: "editorial" },
    kraft: { id: "kraft", systemId: "editorial" },
    ikb: { id: "ikb", systemId: "swiss" },
    signal: { id: "signal", systemId: "swiss" },
    lemon: { id: "lemon", systemId: "swiss" },
};
function registerColorThemePalette(id, next) {
    const cur = REGISTRY[id];
    if (!cur)
        throw new Error(`Unknown ColorTheme "${id}".`);
    for (const key of ids_js_1.PAINT_ROLES) {
        if (!next[key] || !/^#[0-9A-Fa-f]{6}$/.test(next[key])) {
            throw new Error(`ColorTheme "${id}" missing valid hex for token "${key}".`);
        }
    }
    REGISTRY[id] = { ...cur, palette: { ...next } };
}
for (const id of ids_js_1.COLOR_THEME_IDS) {
    registerColorThemePalette(id, exports.COLOR_THEME_PALETTES[id]);
}
function resolveColorTheme(id, systemId) {
    if (!(0, ids_js_1.isColorThemeId)(id)) {
        throw new Error(`Unknown ColorTheme "${id}". Whitelist: ${ids_js_1.COLOR_THEME_IDS.join(", ")}.`);
    }
    (0, ids_js_1.assertThemePairing)(systemId, id);
    return REGISTRY[id];
}
function defaultColorThemeId(systemId) {
    return ids_js_1.DEFAULT_COLOR_THEME[systemId];
}
const HEX = /^#[0-9A-Fa-f]{6}$/;
function isHexColor(s) {
    return HEX.test(s.trim());
}
/** Tint share of the accent over the paper that reads as a chip / soft field, not as the accent itself. */
const SOFT_TINT = { light: 0.14, dark: 0.24 };
/** accentSoft = the accent tinted over the paper (was `bg` — chips and callouts vanished on every brand deck). */
function mixSoft(brand, bg) {
    const a = (0, color_js_1.parseHex)(brand);
    const b = (0, color_js_1.parseHex)(bg);
    if (!a || !b)
        return bg;
    const dark = (0, color_js_1.relativeLuminance)(b) < 0.5;
    return (0, color_js_1.toHex)((0, color_js_1.mixRgb)(b, a, dark ? SOFT_TINT.dark : SOFT_TINT.light));
}
/**
 * Contrast floors a deck palette must clear against its own paper. These are the pairings the
 * emitter produces on every page (ink copy on bg, muted captions on bg, ink copy on a surface /
 * accentSoft card), so a miss here is a miss on every slide — fix it once, at the palette.
 */
exports.PALETTE_FLOORS = {
    /** Body copy on paper: AAA-ish so muted / lifted variants still clear AA. */
    inkOnBg: 7,
    /** Captions, labels, device bodies set in `muted`. */
    mutedOnBg: 4.5,
    /** Copy inside a card or a soft chip. */
    inkOnSurface: 4.5,
    inkOnAccentSoft: 4.5,
    /** A card must read as a card: below this the surface dissolves into the paper. */
    surfaceOnBg: 1.1,
    /** A chip must read as a chip. */
    accentSoftOnBg: 1.05,
    /** Rules and connectors must be visible. */
    lineOnBg: 1.15,
    /** Accent as a rule / band / icon must not vanish into the paper (text on it is fixed per element). */
    accentOnBg: 1.5,
};
/**
 * Make an authored palette usable as a *system*: every role pairing the emitter relies on clears
 * its floor, and roles that were written as near-duplicates of the paper (surface = bg, accentSoft
 * = bg, line = bg) are pulled apart. Hue is kept — colours move only along the light/dark axis
 * (mixing toward black / white / ink), never toward a different hue.
 */
function harmonizePalette(input) {
    const pal = { ...input };
    const bg = (0, color_js_1.parseHex)(pal.bg);
    if (!bg)
        return pal;
    const dark = (0, color_js_1.relativeLuminance)(bg) < 0.5;
    const far = dark ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    const rgb = (hex, fallback) => (0, color_js_1.parseHex)(hex) ?? fallback;
    /** Keep the author's string (case included) when the colour did not actually move. */
    const keep = (authored, next) => {
        const prev = authored ? (0, color_js_1.parseHex)(authored) : undefined;
        return prev && prev.r === next.r && prev.g === next.g && prev.b === next.b ? authored : (0, color_js_1.toHex)(next);
    };
    const bgLum = (0, color_js_1.relativeLuminance)(bg);
    /** Text on the wrong side of the paper (a light ink on cream, a dark caption on navy) is unreadable, not "a look". */
    const wrongSide = (c) => (dark ? (0, color_js_1.relativeLuminance)(c) <= bgLum : (0, color_js_1.relativeLuminance)(c) >= bgLum);
    // 1. ink — the copy colour. Push toward black / white until it clears the paper.
    let ink = rgb(pal.ink, far);
    if (wrongSide(ink))
        ink = far;
    ink = (0, color_js_1.ensureContrast)(ink, bg, far, exports.PALETTE_FLOORS.inkOnBg);
    pal.ink = keep(pal.ink, ink);
    // 2. muted — captions and device bodies. Toward ink, so it stays in the family.
    let muted = rgb(pal.muted, ink);
    if (wrongSide(muted))
        muted = (0, color_js_1.mixRgb)(bg, ink, 0.6);
    pal.muted = keep(pal.muted, (0, color_js_1.ensureContrast)(muted, bg, ink, exports.PALETTE_FLOORS.mutedOnBg));
    // 3. accent — must at least be visible as a rule / band; text set in it is re-checked per element.
    const accent = rgb(pal.accent, ink);
    pal.accent = keep(pal.accent, (0, color_js_1.ensureContrast)(accent, bg, far, exports.PALETTE_FLOORS.accentOnBg));
    // 4. surface — a card. Light paper: white cards on tinted paper, a faint ink tint on near-white
    //    paper. Dark paper: a step lighter. Then keep ink readable on it.
    let surface = rgb(pal.surface, bg);
    if ((0, color_js_1.contrastRatio)(surface, bg) < exports.PALETTE_FLOORS.surfaceOnBg) {
        if (dark)
            surface = (0, color_js_1.mixRgb)(bg, { r: 255, g: 255, b: 255 }, 0.08);
        else if ((0, color_js_1.relativeLuminance)(bg) < 0.85)
            surface = (0, color_js_1.mixRgb)(bg, { r: 255, g: 255, b: 255 }, 0.8);
        else
            surface = (0, color_js_1.mixRgb)(bg, ink, 0.06);
    }
    surface = pullToward(surface, bg, ink, exports.PALETTE_FLOORS.inkOnSurface);
    pal.surface = keep(pal.surface, surface);
    // 5. accentSoft — a tint of the accent, never the paper itself; ink must read on it.
    let soft = rgb(pal.accentSoft, bg);
    if ((0, color_js_1.contrastRatio)(soft, bg) < exports.PALETTE_FLOORS.accentSoftOnBg || (0, color_js_1.contrastRatio)(ink, soft) < exports.PALETTE_FLOORS.inkOnAccentSoft) {
        soft = (0, color_js_1.mixRgb)(bg, rgb(pal.accent, ink), dark ? SOFT_TINT.dark : SOFT_TINT.light);
    }
    soft = pullToward(soft, bg, ink, exports.PALETTE_FLOORS.inkOnAccentSoft);
    pal.accentSoft = keep(pal.accentSoft, soft);
    // 6. line — a hairline that exists. Heavy lines (brutalist black rules) are left alone.
    const line = rgb(pal.line, bg);
    if ((0, color_js_1.contrastRatio)(line, bg) < exports.PALETTE_FLOORS.lineOnBg)
        pal.line = (0, color_js_1.toHex)((0, color_js_1.mixRgb)(bg, ink, dark ? 0.22 : 0.18));
    return pal;
}
/** Mix `field` toward `bg` until `text` clears `min` on it (a card that got too dark for ink). */
function pullToward(field, bg, text, min) {
    if ((0, color_js_1.contrastRatio)(text, field) >= min)
        return field;
    for (let t = 0.2; t <= 1; t += 0.2) {
        const c = (0, color_js_1.mixRgb)(field, bg, t);
        if ((0, color_js_1.contrastRatio)(text, c) >= min)
            return c;
    }
    return bg;
}
/**
 * Colour of type set directly on a filled role (band, table header, step node, hub). Picks whichever
 * of bg / ink / onPhoto reads best on that fill — `bg` text on a lemon accent band was invisible.
 */
function onRoleText(pal, fillRole, onPhoto) {
    const fill = (0, color_js_1.parseHex)(pal[fillRole]);
    if (!fill)
        return pal.bg;
    const candidates = [pal.bg, pal.ink, onPhoto, "#FFFFFF", "#0F172A"].filter((c) => Boolean(c));
    let best = candidates[0];
    let bestRatio = 0;
    for (const c of candidates) {
        const r = (0, color_js_1.parseHex)(c);
        if (!r)
            continue;
        const ratio = (0, color_js_1.contrastRatio)(r, fill);
        if (ratio >= 4.5)
            return c;
        if (ratio > bestRatio) {
            bestRatio = ratio;
            best = c;
        }
    }
    return best;
}
/**
 * Seed palettes for canvas-only systems (id stays "custom" — they are not
 * in the locked ColorTheme whitelist). The author normally overrides hex;
 * this keeps the paper tone right when it does not.
 */
exports.CANVAS_SYSTEM_SEED_PALETTES = {
    "dark-tech": palette("#0B0F17", "#141A25", "#F2F5FA", "#8B94A7", "#232B3A", "#38BDF8", "#0F2A3A"),
    "soft-rounded": palette("#FBFAF7", "#FFFFFF", "#1F2430", "#6B7280", "#E5E7EB", "#6366F1", "#EEF0FD"),
    "photo-editorial": palette("#111111", "#1C1C1C", "#F5F1E8", "#B8B2A6", "#333333", "#F5F1E8", "#2A2A2A"),
    "data-dense": palette("#F7F7F5", "#FFFFFF", "#111827", "#6B7280", "#D9D9D6", "#0F766E", "#E0F2F0"),
    brutalist: palette("#F2F2F2", "#FFFFFF", "#000000", "#4B4B4B", "#000000", "#FF3B30", "#FFE2DF"),
};
/** Neutral paper for a custom system that declared no seed palette: follows its `canvas.tone`. */
const TONE_SEED_PALETTES = {
    light: palette("#FFFFFF", "#F5F5F7", "#1D1D1F", "#6E6E73", "#D2D2D7", "#2563EB", "#E6EEFC"),
    dark: palette("#0E0E10", "#1C1C1E", "#F5F5F7", "#A1A1A6", "#2C2C2E", "#5AC8FA", "#10232E"),
};
function seedPaletteFor(systemId, themeId) {
    if ((0, ids_js_1.isVisualSystemId)(systemId)) {
        const id = themeId && (0, ids_js_1.isColorThemeId)(themeId) ? themeId : ids_js_1.DEFAULT_COLOR_THEME[systemId];
        return { id, base: { ...exports.COLOR_THEME_PALETTES[id] } };
    }
    if (themeId && (0, ids_js_1.isColorThemeId)(themeId))
        return { id: themeId, base: { ...exports.COLOR_THEME_PALETTES[themeId] } };
    if ((0, ids_js_1.isBuiltinCanvasSystemId)(systemId) && systemId in exports.CANVAS_SYSTEM_SEED_PALETTES) {
        return { id: "custom", base: { ...exports.CANVAS_SYSTEM_SEED_PALETTES[systemId] } };
    }
    const custom = (0, visual_system_js_1.getRegisteredVisualSystem)(systemId);
    if (custom?.seedPalette)
        return { id: "custom", base: { ...custom.seedPalette } };
    return { id: "custom", base: { ...TONE_SEED_PALETTES[custom?.system.canvas.tone ?? "light"] } };
}
/** Named theme is a seed. Brand hex replaces accent. Pairing is not required. */
function seedColorTheme(systemId, themeId, brandHex) {
    const { id, base } = seedPaletteFor(systemId, themeId);
    const brand = brandHex && isHexColor(brandHex) ? brandHex.trim() : undefined;
    const palette = brand ? harmonizePalette({ ...base, accent: brand, accentSoft: mixSoft(brand, base.bg) }) : base;
    const onPhoto = "#F8FAFC";
    return {
        id,
        systemId,
        palette,
        ...(brand ? { brand } : {}),
        onPhoto,
    };
}
function luminance(hex) {
    const rgb = (0, color_js_1.parseHex)(hex);
    return rgb ? (0, color_js_1.relativeLuminance)(rgb) : 0.5;
}
/**
 * Authored hex replaces the seed role by role; the result is harmonized so a model that wrote
 * `surface` = `bg` or a faint `muted` still yields cards that read and captions that clear AA.
 * When the author gave only bg / ink / accent, the missing roles are *derived* from those three
 * (not inherited from an unrelated seed) so the deck stays in one family.
 */
function mergeAuthoredPalette(seed, patch) {
    const pal = { ...paletteOf(seed) };
    const authored = new Set();
    if (patch) {
        for (const key of ids_js_1.PAINT_ROLES) {
            const v = patch[key];
            if (v && isHexColor(v)) {
                pal[key] = v.trim();
                authored.add(key);
            }
        }
    }
    if (authored.has("bg") && authored.has("ink")) {
        const bg = (0, color_js_1.parseHex)(pal.bg);
        const ink = (0, color_js_1.parseHex)(pal.ink);
        const dark = (0, color_js_1.relativeLuminance)(bg) < 0.5;
        if (!authored.has("surface"))
            pal.surface = (0, color_js_1.toHex)(dark ? (0, color_js_1.mixRgb)(bg, { r: 255, g: 255, b: 255 }, 0.08) : (0, color_js_1.relativeLuminance)(bg) < 0.85 ? (0, color_js_1.mixRgb)(bg, { r: 255, g: 255, b: 255 }, 0.8) : (0, color_js_1.mixRgb)(bg, ink, 0.06));
        if (!authored.has("muted"))
            pal.muted = (0, color_js_1.toHex)((0, color_js_1.mixRgb)(ink, bg, 0.35));
        if (!authored.has("line"))
            pal.line = (0, color_js_1.toHex)((0, color_js_1.mixRgb)(bg, ink, dark ? 0.22 : 0.18));
        if (!authored.has("accentSoft") && authored.has("accent"))
            pal.accentSoft = mixSoft(pal.accent, pal.bg);
    }
    const brand = patch?.brand && isHexColor(patch.brand) ? patch.brand.trim() : seed.brand;
    if (brand) {
        pal.accent = brand;
        if (!patch?.accentSoft || !isHexColor(patch.accentSoft))
            pal.accentSoft = mixSoft(brand, pal.bg);
    }
    const harmonized = harmonizePalette(pal);
    const onPhoto = patch?.onPhoto && isHexColor(patch.onPhoto) ? patch.onPhoto.trim() : seed.onPhoto ?? (luminance(harmonized.bg) > 0.55 ? "#F8FAFC" : "#0F172A");
    return { ...seed, palette: harmonized, ...(brand ? { brand } : {}), onPhoto };
}
/** Live author look: system + optional named seed + authored hex. Not a user picker. */
function themeFromAuthoredLook(opts) {
    const named = opts.themeId && (0, ids_js_1.isColorThemeId)(opts.themeId) ? opts.themeId : undefined;
    const seed = seedColorTheme(opts.systemId, named, opts.brand);
    const merged = mergeAuthoredPalette(seed, opts.palette);
    if (!named)
        return { ...merged, id: "custom" };
    return merged;
}
function parseBrandHex(...blobs) {
    for (const blob of blobs) {
        const m = blob?.match(/#([0-9A-Fa-f]{6})\b/);
        if (m)
            return `#${m[1]}`;
    }
    return undefined;
}
function paletteOf(theme) {
    if (theme.palette)
        return theme.palette;
    if (theme.id === "custom") {
        throw new Error(`ColorTheme "custom" has no palette.`);
    }
    const registered = REGISTRY[theme.id]?.palette;
    if (!registered) {
        throw new Error(`ColorTheme "${theme.id}" has no registered palette.`);
    }
    return registered;
}
function isPaintRole(role) {
    return ids_js_1.PAINT_ROLES.includes(role);
}
function listColorThemes() {
    return ids_js_1.COLOR_THEME_IDS.map((id) => ({ ...REGISTRY[id] }));
}
function pairingTable() {
    return ids_js_1.COLOR_THEME_PAIRING;
}
function parseSystemId(id) {
    if (!(0, ids_js_1.isVisualSystemId)(id)) {
        throw new Error(`Unknown VisualSystem "${id}".`);
    }
    return id;
}
