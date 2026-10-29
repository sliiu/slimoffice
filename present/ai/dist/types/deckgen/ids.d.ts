/**
 * Locked catalog ids for the no-key fill path (and outline page-lock pills).
 * Inventing an id outside these tables is a hard fail on that path.
 * Live canvas author may use CANVAS_SYSTEM_IDS plus skill-registered systems.
 */
export declare const VISUAL_SYSTEM_IDS: readonly ["editorial", "swiss"];
export type VisualSystemId = (typeof VISUAL_SYSTEM_IDS)[number];
/**
 * Canvas-path (live author) VisualSystems. Superset of the locked catalog
 * systems: the extra ids define typography / grid / radius / shadow policy
 * only — never hex — and are not available to the no-key fill catalog.
 */
export declare const CANVAS_SYSTEM_IDS: readonly ["editorial", "swiss", "dark-tech", "soft-rounded", "photo-editorial", "data-dense", "brutalist"];
/** Compiled-in canvas systems. */
export type BuiltinCanvasSystemId = (typeof CANVAS_SYSTEM_IDS)[number];
/**
 * Any canvas system id the deck may name: a builtin id, or a user-defined system
 * registered at runtime (from an enabled skill's `visual-system` block). Always
 * validate with {@link isCanvasSystemId} — the set is open, the whitelist is not.
 */
export type CanvasSystemId = string;
export declare function isBuiltinCanvasSystemId(id: string): id is BuiltinCanvasSystemId;
export declare function isCanvasSystemId(id: string): boolean;
/** Builtin ids followed by the registered custom ids (author whitelist + prompt lists). */
export declare function listCanvasSystemIds(): string[];
/** Custom system id shape: lower_snake, 2–64 chars — same rule as skill ids. */
export declare const CUSTOM_SYSTEM_ID_RE: RegExp;
/** @internal — visual-system.ts keeps the definitions; ids.ts only tracks the whitelist. */
export declare function setRegisteredCanvasSystemIds(ids: Iterable<string>): void;
export declare const LAYOUT_IDS: readonly ["cover", "section", "statement", "quote", "bullets", "steps", "timeline", "cards", "bars", "loop", "split", "figure", "gallery", "kpi", "compare", "banner", "close"];
export type LayoutId = (typeof LAYOUT_IDS)[number];
export declare const LAYOUT_VARIANTS: {
    readonly cover: readonly ["hero-title", "title-meta", "poster"];
    readonly section: readonly ["num-title"];
    readonly statement: readonly ["single-line", "line-plus-note", "question"];
    readonly quote: readonly ["serif-mark", "band"];
    readonly bullets: readonly ["title-5"];
    readonly steps: readonly ["row-5", "row-3"];
    readonly timeline: readonly ["horizontal", "vertical"];
    readonly cards: readonly ["three", "four", "six"];
    readonly bars: readonly ["tower", "horizontal"];
    readonly loop: readonly ["cycle-4"];
    readonly split: readonly ["text-text", "text-figure", "figure-text"];
    readonly figure: readonly ["image-caption", "hero"];
    readonly gallery: readonly ["trio", "matrix"];
    readonly kpi: readonly ["big-number", "number-row", "ledger"];
    readonly compare: readonly ["two-col"];
    readonly banner: readonly ["ink-band"];
    readonly close: readonly ["three-takeaways", "next-step", "manifesto"];
};
export type VariantId<L extends LayoutId = LayoutId> = (typeof LAYOUT_VARIANTS)[L][number];
export type AnyVariantId = VariantId;
export declare const COLOR_THEME_IDS: readonly ["ink", "indigo", "kraft", "ikb", "signal", "lemon"];
export type ColorThemeId = (typeof COLOR_THEME_IDS)[number];
/** L4 pairing: ColorTheme may only sit on its VisualSystem. */
export declare const COLOR_THEME_PAIRING: {
    readonly editorial: readonly ["ink", "indigo", "kraft"];
    readonly swiss: readonly ["ikb", "signal", "lemon"];
};
export declare const DEFAULT_COLOR_THEME: Record<VisualSystemId, ColorThemeId>;
export declare const SLOT_CAPS: {
    readonly statementClaimChars: 18;
    readonly quoteChars: 42;
    readonly bulletItems: 5;
    readonly bulletItemChars: 28;
    readonly stepItems: 5;
    readonly cardItems: 6;
    readonly barItems: 4;
    readonly timelineItems: 5;
    readonly loopItems: 4;
    readonly galleryItems: 6;
    readonly kpiRow: 3;
    readonly closeTakeaways: 3;
    readonly figureNoteLines: 2;
};
export declare const PAINT_ROLES: readonly ["bg", "surface", "ink", "muted", "line", "accent", "accentSoft"];
export type PaintRole = (typeof PAINT_ROLES)[number];
export declare function isVisualSystemId(id: string): id is VisualSystemId;
export declare function isLayoutId(id: string): id is LayoutId;
export declare function isColorThemeId(id: string): id is ColorThemeId;
export declare function variantsForLayout(layout: LayoutId): readonly string[];
export declare function isVariantForLayout(layout: LayoutId, variant: string): boolean;
export declare function themesForSystem(system: VisualSystemId): readonly ColorThemeId[];
export declare function assertThemePairing(system: VisualSystemId, theme: ColorThemeId): void;
