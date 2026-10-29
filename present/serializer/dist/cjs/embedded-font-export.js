"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xmlHeader = exports.DeckEmbeddedFontRegistry = exports.FONT_REL_TYPE = void 0;
exports.groupEmbeddedFontsForExport = groupEmbeddedFontsForExport;
exports.renderEmbeddedFontLst = renderEmbeddedFontLst;
exports.embeddedFontsSnapshot = embeddedFontsSnapshot;
exports.embeddedFontsChanged = embeddedFontsChanged;
exports.renderPresentationFontRels = renderPresentationFontRels;
const zip_write_1 = require("./zip-write");
const font_eot_1 = require("./font-eot");
const xml_util_1 = require("./xml-util");
Object.defineProperty(exports, "xmlHeader", { enumerable: true, get: function () { return xml_util_1.xmlHeader; } });
exports.FONT_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/font";
class DeckEmbeddedFontRegistry {
    srcToName = new Map();
    files = new Map();
    nextIdx = 1;
    registerFont(src) {
        const hit = this.srcToName.get(src);
        if (hit)
            return hit;
        const decoded = (0, zip_write_1.dataUrlToBytes)(src);
        const sfnt = decoded?.bytes ?? new Uint8Array(0);
        const fntdata = (0, font_eot_1.sfntToEotFntdata)(sfnt);
        const name = `font${this.nextIdx++}.fntdata`;
        this.srcToName.set(src, name);
        this.files.set(name, fntdata);
        return name;
    }
    createPartTable() {
        return new SlideEmbeddedFontTable(this);
    }
    fileEntries() {
        return [...this.files.entries()].map(([name, bytes]) => ({ name, bytes }));
    }
}
exports.DeckEmbeddedFontRegistry = DeckEmbeddedFontRegistry;
class SlideEmbeddedFontTable {
    deck;
    srcToRelIdx = new Map();
    items = [];
    constructor(deck) {
        this.deck = deck;
    }
    registerFont(src) {
        const existing = this.srcToRelIdx.get(src);
        if (existing !== undefined)
            return `rIdFont${existing}`;
        const name = this.deck.registerFont(src);
        const bytes = this.deck.fileEntries().find((e) => e.name === name)?.bytes ?? new Uint8Array(0);
        const idx = this.items.length + 1;
        this.items.push({ name, bytes });
        this.srcToRelIdx.set(src, idx);
        return `rIdFont${idx}`;
    }
    list() {
        return this.items.map((it, i) => ({
            name: it.name,
            bytes: it.bytes,
            relId: `rIdFont${i + 1}`,
        }));
    }
}
function fontToSlot(weight, style) {
    const bold = weight >= 600;
    const italic = style === "italic";
    if (bold && italic)
        return "boldItalic";
    if (bold)
        return "bold";
    if (italic)
        return "italic";
    return "regular";
}
/** Collapse parser-expanded `pres.fonts` (incl. alias faces) into OOXML embeddedFont groups. */
function groupEmbeddedFontsForExport(fonts) {
    const groups = new Map();
    for (const f of fonts) {
        const suffix = /( Bold Italic| Bold| Italic)$/.exec(f.family);
        if (suffix && f.weight === 400 && f.style === "normal")
            continue;
        const base = suffix ? f.family.slice(0, -suffix[0].length) : f.family;
        const slot = fontToSlot(f.weight, f.style);
        let slots = groups.get(base);
        if (!slots) {
            slots = new Map();
            groups.set(base, slots);
        }
        const prev = slots.get(slot);
        if (!prev || f.src.length > prev.src.length)
            slots.set(slot, f);
    }
    return [...groups.entries()].map(([typeface, slots]) => ({ typeface, slots: Object.fromEntries(slots) }));
}
function renderEmbeddedFontLst(groups, fonts) {
    if (!groups.length)
        return "";
    const blocks = groups.map((g) => {
        const slots = [];
        const order = ["regular", "bold", "italic", "boldItalic"];
        for (const slot of order) {
            const face = g.slots[slot];
            if (!face?.src)
                continue;
            const relId = fonts.registerFont(face.src);
            slots.push(`<p:${slot} r:id="${relId}"/>`);
        }
        if (!slots.length)
            return "";
        return `<p:embeddedFont><p:font typeface="${(0, xml_util_1.esc)(g.typeface)}"/>${slots.join("")}</p:embeddedFont>`;
    });
    const body = blocks.filter(Boolean).join("");
    return body ? `<p:embeddedFontLst>${body}</p:embeddedFontLst>` : "";
}
function embeddedFontsSnapshot(fonts) {
    if (!fonts?.length)
        return "";
    return JSON.stringify(fonts.map((f) => ({ family: f.family, weight: f.weight, style: f.style, src: f.src })));
}
function embeddedFontsChanged(current, snapshot) {
    return embeddedFontsSnapshot(current) !== (snapshot ?? "");
}
function renderPresentationFontRels(items) {
    return items
        .map((f) => `<Relationship Id="${f.relId}" Type="${exports.FONT_REL_TYPE}" Target="fonts/${f.name}"/>`)
        .join("");
}
