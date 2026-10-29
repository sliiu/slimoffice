/**
 * L4 ColorTheme — id + VisualSystem pairing + registered palettes.
 * Token keys are exactly: bg · surface · ink · muted · line · accent · accentSoft
 */
import { COLOR_THEME_PAIRING, type BuiltinCanvasSystemId, type CanvasSystemId, type ColorThemeId, type PaintRole, type VisualSystemId } from "./ids.js";
export type ColorPalette = Record<PaintRole, string>;
export interface ColorTheme {
    id: ColorThemeId | "custom";
    systemId: CanvasSystemId;
    palette?: ColorPalette;
    /** Brand / campaign accent (may equal palette.accent). */
    brand?: string;
    /** Type color when sitting on a photo canvas. */
    onPhoto?: string;
}
/**
 * Locked ColorTheme hex (token order: bg surface ink muted line accent accentSoft).
 * Editorial palettes keep accent equal to ink (no third hue).
 * Swiss palettes share paper / grey / ink and a single accent.
 */
export declare const COLOR_THEME_PALETTES: Record<ColorThemeId, ColorPalette>;
export declare function registerColorThemePalette(id: ColorThemeId, next: ColorPalette): void;
export declare function resolveColorTheme(id: string, systemId: VisualSystemId): ColorTheme;
export declare function defaultColorThemeId(systemId: VisualSystemId): ColorThemeId;
export declare function isHexColor(s: string): boolean;
/**
 * Contrast floors a deck palette must clear against its own paper. These are the pairings the
 * emitter produces on every page (ink copy on bg, muted captions on bg, ink copy on a surface /
 * accentSoft card), so a miss here is a miss on every slide — fix it once, at the palette.
 */
export declare const PALETTE_FLOORS: {
    /** Body copy on paper: AAA-ish so muted / lifted variants still clear AA. */
    readonly inkOnBg: 7;
    /** Captions, labels, device bodies set in `muted`. */
    readonly mutedOnBg: 4.5;
    /** Copy inside a card or a soft chip. */
    readonly inkOnSurface: 4.5;
    readonly inkOnAccentSoft: 4.5;
    /** A card must read as a card: below this the surface dissolves into the paper. */
    readonly surfaceOnBg: 1.1;
    /** A chip must read as a chip. */
    readonly accentSoftOnBg: 1.05;
    /** Rules and connectors must be visible. */
    readonly lineOnBg: 1.15;
    /** Accent as a rule / band / icon must not vanish into the paper (text on it is fixed per element). */
    readonly accentOnBg: 1.5;
};
/**
 * Make an authored palette usable as a *system*: every role pairing the emitter relies on clears
 * its floor, and roles that were written as near-duplicates of the paper (surface = bg, accentSoft
 * = bg, line = bg) are pulled apart. Hue is kept — colours move only along the light/dark axis
 * (mixing toward black / white / ink), never toward a different hue.
 */
export declare function harmonizePalette(input: ColorPalette): ColorPalette;
/**
 * Colour of type set directly on a filled role (band, table header, step node, hub). Picks whichever
 * of bg / ink / onPhoto reads best on that fill — `bg` text on a lemon accent band was invisible.
 */
export declare function onRoleText(pal: ColorPalette, fillRole: PaintRole, onPhoto?: string): string;
/**
 * Seed palettes for canvas-only systems (id stays "custom" — they are not
 * in the locked ColorTheme whitelist). The author normally overrides hex;
 * this keeps the paper tone right when it does not.
 */
export declare const CANVAS_SYSTEM_SEED_PALETTES: Record<Exclude<BuiltinCanvasSystemId, VisualSystemId>, ColorPalette>;
/** Named theme is a seed. Brand hex replaces accent. Pairing is not required. */
export declare function seedColorTheme(systemId: CanvasSystemId, themeId?: string, brandHex?: string): ColorTheme;
/**
 * Authored hex replaces the seed role by role; the result is harmonized so a model that wrote
 * `surface` = `bg` or a faint `muted` still yields cards that read and captions that clear AA.
 * When the author gave only bg / ink / accent, the missing roles are *derived* from those three
 * (not inherited from an unrelated seed) so the deck stays in one family.
 */
export declare function mergeAuthoredPalette(seed: ColorTheme, patch?: Partial<ColorPalette> & {
    brand?: string;
    onPhoto?: string;
}): ColorTheme;
/** Live author look: system + optional named seed + authored hex. Not a user picker. */
export declare function themeFromAuthoredLook(opts: {
    systemId: CanvasSystemId;
    themeId?: string;
    palette?: Partial<ColorPalette> & {
        brand?: string;
        onPhoto?: string;
    };
    brand?: string;
}): ColorTheme;
export declare function parseBrandHex(...blobs: Array<string | undefined>): string | undefined;
export declare function paletteOf(theme: ColorTheme): ColorPalette;
export declare function isPaintRole(role: string): role is PaintRole;
export declare function listColorThemes(): ColorTheme[];
export declare function pairingTable(): typeof COLOR_THEME_PAIRING;
export declare function parseSystemId(id: string): VisualSystemId;
