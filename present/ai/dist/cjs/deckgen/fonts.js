"use strict";
/**
 * Load VisualSystem typefaces (browser only).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deckgenFontLinks = deckgenFontLinks;
exports.injectDeckgenFonts = injectDeckgenFonts;
exports.injectDeckgenFontsFromPres = injectDeckgenFontsFromPres;
const themes_1 = require("@sliiu/present-themes");
const ids_js_1 = require("./ids.js");
const visual_system_js_1 = require("./visual-system.js");
/** Google Font links for a builtin or registered custom system. Families without a preset are skipped. */
function deckgenFontLinks(system) {
    const sys = typeof system === "string" ? (0, visual_system_js_1.resolveVisualSystem)(system) : system;
    const out = [];
    for (const family of (0, visual_system_js_1.fontFamiliesForSystem)(sys.id)) {
        const preset = (0, themes_1.findFontPreset)(family);
        if (preset)
            out.push({ family: preset.family, cssUrl: preset.cssUrl });
    }
    return out;
}
function injectDeckgenFonts(system) {
    for (const link of deckgenFontLinks(system)) {
        (0, themes_1.injectFontCss)(link.cssUrl, link.family);
    }
}
/**
 * Fonts for a deck being opened. `meta.fontCssLinks` is written by the emitter, so a deck
 * authored on a custom system still loads its faces when that skill is not installed here.
 */
function injectDeckgenFontsFromPres(pres) {
    const meta = pres.meta;
    const id = meta?.deckgen?.system;
    if (id && (0, ids_js_1.isCanvasSystemId)(id))
        injectDeckgenFonts(id);
    for (const link of meta?.fontCssLinks ?? []) {
        if (link.cssUrl && link.family)
            (0, themes_1.injectFontCss)(link.cssUrl, link.family);
    }
}
