"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbedFontsCmd = void 0;
const core_1 = require("@sliiu/present-core");
class EmbedFontsCmd {
    additions;
    optionsPatch;
    removeFamilies;
    label;
    prevFonts;
    prevOptions;
    constructor(additions, optionsPatch = { embedTrueTypeFonts: true }, removeFamilies = []) {
        this.additions = additions;
        this.optionsPatch = optionsPatch;
        this.removeFamilies = removeFamilies;
        this.label =
            additions.length === 1
                ? `Embed font "${additions[0].family}"`
                : additions.length
                    ? `Embed ${additions.length} fonts`
                    : "Update embedded fonts";
    }
    apply(pres) {
        this.prevFonts = pres.fonts ? [...pres.fonts] : undefined;
        this.prevOptions = pres.options ? { ...pres.options } : undefined;
        const base = this.removeFamilies.length
            ? (0, core_1.removeEmbeddedFontFamilies)(pres.fonts, this.removeFamilies)
            : pres.fonts;
        pres.fonts = (0, core_1.mergeEmbeddedFonts)(base, this.additions);
        pres.options = { ...pres.options, ...this.optionsPatch };
    }
    revert(pres) {
        pres.fonts = this.prevFonts;
        pres.options = this.prevOptions;
    }
}
exports.EmbedFontsCmd = EmbedFontsCmd;
