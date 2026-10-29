import { strFromU8, strToU8 } from "fflate";
import { DeckEmbeddedFontRegistry, embeddedFontsChanged, FONT_REL_TYPE, groupEmbeddedFontsForExport, renderEmbeddedFontLst, } from "./embedded-font-export.js";
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function removeContentTypesOverride(archive, partName) {
    const ctPath = "[Content_Types].xml";
    const bytes = archive.files.get(ctPath);
    if (!bytes)
        return;
    const xml = strFromU8(bytes);
    const re = new RegExp(`<Override PartName="${escapeRegExp(partName)}"[^>]*/>`);
    if (!re.test(xml))
        return;
    archive.files.set(ctPath, strToU8(xml.replace(re, "")));
}
function appendContentTypesOverride(archive, partName, contentType) {
    const ctPath = "[Content_Types].xml";
    const bytes = archive.files.get(ctPath);
    if (!bytes)
        return;
    const xml = strFromU8(bytes);
    if (xml.includes(`PartName="${partName}"`))
        return;
    const insertion = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
    archive.files.set(ctPath, strToU8(xml.replace(/<\/Types>/, `${insertion}</Types>`)));
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
    let xml = strFromU8(presBytes);
    xml = xml.replace(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>\s*/g, "");
    if (lstXml) {
        xml = xml.replace(/<p:sldSz/, `${lstXml}\n  <p:sldSz`);
    }
    archive.files.set(presPath, strToU8(xml));
}
function patchPresentationFontRels(archive, fontItems) {
    const relsPath = "ppt/_rels/presentation.xml.rels";
    const bytes = archive.files.get(relsPath);
    if (!bytes)
        return;
    const fontRelRe = new RegExp(`<Relationship[^>]*Type="${escapeRegExp(FONT_REL_TYPE)}"[^>]*/>`, "g");
    let xml = strFromU8(bytes).replace(fontRelRe, "");
    if (fontItems.length) {
        const inserts = fontItems
            .map((f) => `<Relationship Id="${f.relId}" Type="${FONT_REL_TYPE}" Target="fonts/${f.name}"/>`)
            .join("");
        xml = xml.replace(/<\/Relationships>/, `${inserts}</Relationships>`);
    }
    archive.files.set(relsPath, strToU8(xml));
}
/** ECMA-376 §15.2.13 — align embeddedFontLst + ppt/fonts/*.fntdata when `pres.fonts` changed. */
export function patchEmbeddedFonts(pres, archive, opts) {
    const source = pres.__source;
    if (!embeddedFontsChanged(pres.fonts, source?.fontsSnapshot))
        return;
    const presPath = source?.presentationPath ?? "ppt/presentation.xml";
    removeFontParts(archive);
    const groups = groupEmbeddedFontsForExport(pres.fonts ?? []);
    if (!groups.length) {
        patchEmbeddedFontLstNode(presPath, archive, "");
        patchPresentationFontRels(archive, []);
        if (opts.debug)
            console.log("[roundtrip] embedded fonts cleared");
        return;
    }
    const deckFonts = new DeckEmbeddedFontRegistry();
    const fontTable = deckFonts.createPartTable();
    const lstXml = renderEmbeddedFontLst(groups, fontTable);
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
