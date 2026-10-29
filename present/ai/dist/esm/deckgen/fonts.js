/**
 * Load VisualSystem typefaces (browser only).
 */
import { findFontPreset, injectFontCss } from "@sliiu/present-themes";
import { isCanvasSystemId } from "./ids.js";
import { fontFamiliesForSystem, resolveVisualSystem } from "./visual-system.js";
/** Google Font links for a builtin or registered custom system. Families without a preset are skipped. */
export function deckgenFontLinks(system) {
    const sys = typeof system === "string" ? resolveVisualSystem(system) : system;
    const out = [];
    for (const family of fontFamiliesForSystem(sys.id)) {
        const preset = findFontPreset(family);
        if (preset)
            out.push({ family: preset.family, cssUrl: preset.cssUrl });
    }
    return out;
}
export function injectDeckgenFonts(system) {
    for (const link of deckgenFontLinks(system)) {
        injectFontCss(link.cssUrl, link.family);
    }
}
/**
 * Fonts for a deck being opened. `meta.fontCssLinks` is written by the emitter, so a deck
 * authored on a custom system still loads its faces when that skill is not installed here.
 */
export function injectDeckgenFontsFromPres(pres) {
    const meta = pres.meta;
    const id = meta?.deckgen?.system;
    if (id && isCanvasSystemId(id))
        injectDeckgenFonts(id);
    for (const link of meta?.fontCssLinks ?? []) {
        if (link.cssUrl && link.family)
            injectFontCss(link.cssUrl, link.family);
    }
}
