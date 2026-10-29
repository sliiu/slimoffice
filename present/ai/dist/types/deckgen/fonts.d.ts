/**
 * Load VisualSystem typefaces (browser only).
 */
import type { Presentation } from "@sliiu/present-core";
import { type CanvasSystemId } from "./ids.js";
import { type VisualSystem } from "./visual-system.js";
export interface DeckgenFontLink {
    family: string;
    cssUrl: string;
}
/** Google Font links for a builtin or registered custom system. Families without a preset are skipped. */
export declare function deckgenFontLinks(system: VisualSystem | CanvasSystemId): DeckgenFontLink[];
export declare function injectDeckgenFonts(system: VisualSystem | CanvasSystemId): void;
/**
 * Fonts for a deck being opened. `meta.fontCssLinks` is written by the emitter, so a deck
 * authored on a custom system still loads its faces when that skill is not installed here.
 */
export declare function injectDeckgenFontsFromPres(pres: Presentation): void;
