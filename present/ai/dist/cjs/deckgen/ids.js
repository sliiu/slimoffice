"use strict";
/**
 * Locked catalog ids for the no-key fill path (and outline page-lock pills).
 * Inventing an id outside these tables is a hard fail on that path.
 * Live canvas author may use CANVAS_SYSTEM_IDS plus skill-registered systems.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAINT_ROLES = exports.SLOT_CAPS = exports.DEFAULT_COLOR_THEME = exports.COLOR_THEME_PAIRING = exports.COLOR_THEME_IDS = exports.LAYOUT_VARIANTS = exports.LAYOUT_IDS = exports.CUSTOM_SYSTEM_ID_RE = exports.CANVAS_SYSTEM_IDS = exports.VISUAL_SYSTEM_IDS = void 0;
exports.isBuiltinCanvasSystemId = isBuiltinCanvasSystemId;
exports.isCanvasSystemId = isCanvasSystemId;
exports.listCanvasSystemIds = listCanvasSystemIds;
exports.setRegisteredCanvasSystemIds = setRegisteredCanvasSystemIds;
exports.isVisualSystemId = isVisualSystemId;
exports.isLayoutId = isLayoutId;
exports.isColorThemeId = isColorThemeId;
exports.variantsForLayout = variantsForLayout;
exports.isVariantForLayout = isVariantForLayout;
exports.themesForSystem = themesForSystem;
exports.assertThemePairing = assertThemePairing;
exports.VISUAL_SYSTEM_IDS = ["editorial", "swiss"];
/**
 * Canvas-path (live author) VisualSystems. Superset of the locked catalog
 * systems: the extra ids define typography / grid / radius / shadow policy
 * only — never hex — and are not available to the no-key fill catalog.
 */
exports.CANVAS_SYSTEM_IDS = [
    ...exports.VISUAL_SYSTEM_IDS,
    "dark-tech",
    "soft-rounded",
    "photo-editorial",
    "data-dense",
    "brutalist",
];
/** Ids of user-defined systems registered for this session (see visual-system.ts). */
const registeredCanvasSystemIds = new Set();
function isBuiltinCanvasSystemId(id) {
    return exports.CANVAS_SYSTEM_IDS.includes(id);
}
function isCanvasSystemId(id) {
    return isBuiltinCanvasSystemId(id) || registeredCanvasSystemIds.has(id);
}
/** Builtin ids followed by the registered custom ids (author whitelist + prompt lists). */
function listCanvasSystemIds() {
    return [...exports.CANVAS_SYSTEM_IDS, ...registeredCanvasSystemIds];
}
/** Custom system id shape: lower_snake, 2–64 chars — same rule as skill ids. */
exports.CUSTOM_SYSTEM_ID_RE = /^[a-z][a-z0-9_]{1,63}$/;
/** @internal — visual-system.ts keeps the definitions; ids.ts only tracks the whitelist. */
function setRegisteredCanvasSystemIds(ids) {
    registeredCanvasSystemIds.clear();
    for (const id of ids)
        if (!isBuiltinCanvasSystemId(id))
            registeredCanvasSystemIds.add(id);
}
exports.LAYOUT_IDS = [
    "cover",
    "section",
    "statement",
    "quote",
    "bullets",
    "steps",
    "timeline",
    "cards",
    "bars",
    "loop",
    "split",
    "figure",
    "gallery",
    "kpi",
    "compare",
    "banner",
    "close",
];
exports.LAYOUT_VARIANTS = {
    cover: ["hero-title", "title-meta", "poster"],
    section: ["num-title"],
    statement: ["single-line", "line-plus-note", "question"],
    quote: ["serif-mark", "band"],
    bullets: ["title-5"],
    steps: ["row-5", "row-3"],
    timeline: ["horizontal", "vertical"],
    cards: ["three", "four", "six"],
    bars: ["tower", "horizontal"],
    loop: ["cycle-4"],
    split: ["text-text", "text-figure", "figure-text"],
    figure: ["image-caption", "hero"],
    gallery: ["trio", "matrix"],
    kpi: ["big-number", "number-row", "ledger"],
    compare: ["two-col"],
    banner: ["ink-band"],
    close: ["three-takeaways", "next-step", "manifesto"],
};
exports.COLOR_THEME_IDS = ["ink", "indigo", "kraft", "ikb", "signal", "lemon"];
/** L4 pairing: ColorTheme may only sit on its VisualSystem. */
exports.COLOR_THEME_PAIRING = {
    editorial: ["ink", "indigo", "kraft"],
    swiss: ["ikb", "signal", "lemon"],
};
exports.DEFAULT_COLOR_THEME = {
    editorial: "ink",
    swiss: "ikb",
};
exports.SLOT_CAPS = {
    statementClaimChars: 18,
    quoteChars: 42,
    bulletItems: 5,
    bulletItemChars: 28,
    stepItems: 5,
    cardItems: 6,
    barItems: 4,
    timelineItems: 5,
    loopItems: 4,
    galleryItems: 6,
    kpiRow: 3,
    closeTakeaways: 3,
    figureNoteLines: 2,
};
exports.PAINT_ROLES = ["bg", "surface", "ink", "muted", "line", "accent", "accentSoft"];
function isVisualSystemId(id) {
    return exports.VISUAL_SYSTEM_IDS.includes(id);
}
function isLayoutId(id) {
    return exports.LAYOUT_IDS.includes(id);
}
function isColorThemeId(id) {
    return exports.COLOR_THEME_IDS.includes(id);
}
function variantsForLayout(layout) {
    return exports.LAYOUT_VARIANTS[layout];
}
function isVariantForLayout(layout, variant) {
    return exports.LAYOUT_VARIANTS[layout].includes(variant);
}
function themesForSystem(system) {
    return exports.COLOR_THEME_PAIRING[system];
}
function assertThemePairing(system, theme) {
    if (!themesForSystem(system).includes(theme)) {
        throw new Error(`ColorTheme "${theme}" cannot pair with VisualSystem "${system}". Allowed: ${themesForSystem(system).join(", ")}.`);
    }
}
