/**
 * Locked catalog ids for the no-key fill path (and outline page-lock pills).
 * Inventing an id outside these tables is a hard fail on that path.
 * Live canvas author may use CANVAS_SYSTEM_IDS plus skill-registered systems.
 */
export const VISUAL_SYSTEM_IDS = ["editorial", "swiss"];
/**
 * Canvas-path (live author) VisualSystems. Superset of the locked catalog
 * systems: the extra ids define typography / grid / radius / shadow policy
 * only — never hex — and are not available to the no-key fill catalog.
 */
export const CANVAS_SYSTEM_IDS = [
    ...VISUAL_SYSTEM_IDS,
    "dark-tech",
    "soft-rounded",
    "photo-editorial",
    "data-dense",
    "brutalist",
];
/** Ids of user-defined systems registered for this session (see visual-system.ts). */
const registeredCanvasSystemIds = new Set();
export function isBuiltinCanvasSystemId(id) {
    return CANVAS_SYSTEM_IDS.includes(id);
}
export function isCanvasSystemId(id) {
    return isBuiltinCanvasSystemId(id) || registeredCanvasSystemIds.has(id);
}
/** Builtin ids followed by the registered custom ids (author whitelist + prompt lists). */
export function listCanvasSystemIds() {
    return [...CANVAS_SYSTEM_IDS, ...registeredCanvasSystemIds];
}
/** Custom system id shape: lower_snake, 2–64 chars — same rule as skill ids. */
export const CUSTOM_SYSTEM_ID_RE = /^[a-z][a-z0-9_]{1,63}$/;
/** @internal — visual-system.ts keeps the definitions; ids.ts only tracks the whitelist. */
export function setRegisteredCanvasSystemIds(ids) {
    registeredCanvasSystemIds.clear();
    for (const id of ids)
        if (!isBuiltinCanvasSystemId(id))
            registeredCanvasSystemIds.add(id);
}
export const LAYOUT_IDS = [
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
export const LAYOUT_VARIANTS = {
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
export const COLOR_THEME_IDS = ["ink", "indigo", "kraft", "ikb", "signal", "lemon"];
/** L4 pairing: ColorTheme may only sit on its VisualSystem. */
export const COLOR_THEME_PAIRING = {
    editorial: ["ink", "indigo", "kraft"],
    swiss: ["ikb", "signal", "lemon"],
};
export const DEFAULT_COLOR_THEME = {
    editorial: "ink",
    swiss: "ikb",
};
export const SLOT_CAPS = {
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
export const PAINT_ROLES = ["bg", "surface", "ink", "muted", "line", "accent", "accentSoft"];
export function isVisualSystemId(id) {
    return VISUAL_SYSTEM_IDS.includes(id);
}
export function isLayoutId(id) {
    return LAYOUT_IDS.includes(id);
}
export function isColorThemeId(id) {
    return COLOR_THEME_IDS.includes(id);
}
export function variantsForLayout(layout) {
    return LAYOUT_VARIANTS[layout];
}
export function isVariantForLayout(layout, variant) {
    return LAYOUT_VARIANTS[layout].includes(variant);
}
export function themesForSystem(system) {
    return COLOR_THEME_PAIRING[system];
}
export function assertThemePairing(system, theme) {
    if (!themesForSystem(system).includes(theme)) {
        throw new Error(`ColorTheme "${theme}" cannot pair with VisualSystem "${system}". Allowed: ${themesForSystem(system).join(", ")}.`);
    }
}
