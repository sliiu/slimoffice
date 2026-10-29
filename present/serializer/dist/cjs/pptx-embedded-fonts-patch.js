"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchEmbeddedFonts = patchEmbeddedFonts;
const fflate_1 = require("fflate");
const embedded_font_export_1 = require("./embedded-font-export");
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function removeContentTypesOverride(archive, partName) {
    const ctPath = "[Content_Types].xml";
    const bytes = archive.files.get(ctPath);
    if (!bytes)
        return;
    const xml = (0, fflate_1.strFromU8)(bytes);
    const re = new RegExp(`<Override PartName="${escapeRegExp(partName)}"[^>]*/>`);
    if (!re.test(xml))
        return;
    archive.files.set(ctPath, (0, fflate_1.strToU8)(xml.replace(re, "")));
}
function appendContentTypesOverride(archive, partName, contentType) {
    const ctPath = "[Content_Types].xml";
    const bytes = archive.files.get(ctPath);
    if (!bytes)
        return;
    const xml = (0, fflate_1.strFromU8)(bytes);
    if (xml.includes(`PartName="${partName}"`))
        return;
    const insertion = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
    archive.files.set(ctPath, (0, fflate_1.strToU8)(xml.replace(/<\/Types>/, `${insertion}</Types>`)));
}
function removeFontParts(archive) {
    for (const path of [...archive.files.keys()]) {
        if (/^ppt\/fonts\/.*\.fntdata$/.test(path)) {
            archive.files.delete(path);
            removeContentTypesOverride(archive, `/${path}`);
        }
    }
}
function patchEmbeddedFontLstNode(presPath, archive, lstXml) {
    const presBytes = archive.files.get(presPath);
    if (!presBytes)
        return;
    let xml = (0, fflate_1.strFromU8)(presBytes);
    xml = xml.replace(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>\s*/g, "");
    if (lstXml) {
        xml = xml.replace(/<p:sldSz/, `${lstXml}\n  <p:sldSz`);
    }
    archive.files.set(presPath, (0, fflate_1.strToU8)(xml));
}
function patchPresentationFontRels(archive, fontItems) {
    const relsPath = "ppt/_rels/presentation.xml.rels";
    const bytes = archive.files.get(relsPath);
    if (!bytes)
        return;
    const fontRelRe = new RegExp(`<Relationship[^>]*Type="${escapeRegExp(embedded_font_export_1.FONT_REL_TYPE)}"[^>]*/>`, "g");
    let xml = (0, fflate_1.strFromU8)(bytes).replace(fontRelRe, "");
    if (fontItems.length) {
        const inserts = fontItems
            .map((f) => `<Relationship Id="${f.relId}" Type="${embedded_font_export_1.FONT_REL_TYPE}" Target="fonts/${f.name}"/>`)
            .join("");
        xml = xml.replace(/<\/Relationships>/, `${inserts}</Relationships>`);
    }
    archive.files.set(relsPath, (0, fflate_1.strToU8)(xml));
}
/** ECMA-376 §15.2.13 — align embeddedFontLst + ppt/fonts/*.fntdata when `pres.fonts` changed. */
function patchEmbeddedFonts(pres, archive, opts) {
    const source = pres.__source;
    if (!(0, embedded_font_export_1.embeddedFontsChanged)(pres.fonts, source?.fontsSnapshot))
        return;
    const presPath = source?.presentationPath ?? "ppt/presentation.xml";
    removeFontParts(archive);
    const groups = (0, embedded_font_export_1.groupEmbeddedFontsForExport)(pres.fonts ?? []);
    if (!groups.length) {
        patchEmbeddedFontLstNode(presPath, archive, "");
        patchPresentationFontRels(archive, []);
        if (opts.debug)
            console.log("[roundtrip] embedded fonts cleared");
        return;
    }
    const deckFonts = new embedded_font_export_1.DeckEmbeddedFontRegistry();
    const fontTable = deckFonts.createPartTable();
    const lstXml = (0, embedded_font_export_1.renderEmbeddedFontLst)(groups, fontTable);
    const fontItems = fontTable.list();
    for (const { name, bytes } of deckFonts.fileEntries()) {
        const partPath = `ppt/fonts/${name}`;
        archive.files.set(partPath, bytes);
        appendContentTypesOverride(archive, `/${partPath}`, "application/x-fontdata");
    }
    patchEmbeddedFontLstNode(presPath, archive, lstXml);
    patchPresentationFontRels(archive, fontItems);
    if (opts.debug) {
        console.log(`[roundtrip] embedded fonts patched (${fontItems.length} part(s), ${groups.length} family group(s))`);
    }
}
