"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CT_PRES_PROPS = exports.REL_TYPE_PRES_PROPS = void 0;
exports.renderShowPrXml = renderShowPrXml;
exports.renderPresPropsXml = renderPresPropsXml;
exports.injectScratchPresProps = injectScratchPresProps;
exports.patchPresProps = patchPresProps;
const core_1 = require("@sliiu/present-core");
const fflate_1 = require("fflate");
const xml_util_1 = require("./xml-util");
exports.REL_TYPE_PRES_PROPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps";
exports.CT_PRES_PROPS = "application/vnd.openxmlformats-officedocument.presentationml.presProps+xml";
const PML = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const P14 = "http://schemas.microsoft.com/office/powerpoint/2010/main";
const SHOW_MEDIA_CTRLS_URI = "{2FDB2607-1784-4EEB-B798-7EB5836EED8A}";
function bool01(v, fallback) {
    return (v ?? fallback) ? "1" : "0";
}
function showKindXml(s) {
    if (s.kind === "kiosk")
        return "<p:kiosk/>";
    if (s.kind === "browse") {
        const sb = s.browseShowScrollbar === false ? ' showScrollbar="0"' : "";
        return `<p:browse${sb}/>`;
    }
    return "<p:present/>";
}
function slidesXml(s) {
    if (s.customShowId !== undefined)
        return `<p:custShow id="${s.customShowId}"/>`;
    if (s.slides && s.slides !== "all") {
        return `<p:sldRg st="${s.slides.start}" end="${s.slides.end}"/>`;
    }
    return "<p:sldAll/>";
}
function penClrXml(s) {
    const hex = (s.penColor ?? "#FF0000").replace(/^#/, "").toUpperCase();
    return `<p:penClr><a:srgbClr val="${(0, xml_util_1.esc)(hex)}"/></p:penClr>`;
}
function mediaCtrlsExt(s) {
    const val = bool01(s.showMediaControls, true);
    return `<p:ext uri="${SHOW_MEDIA_CTRLS_URI}"><p14:showMediaCtrls xmlns:p14="${P14}" val="${val}"/></p:ext>`;
}
function mergeExtLst(existing, s) {
    let ext = existing ?? "";
    if (/showMediaCtrls/.test(ext)) {
        ext = ext.replace(/<p14:showMediaCtrls\b[^>]*(?:\/>|>\s*<\/p14:showMediaCtrls>)/, `<p14:showMediaCtrls xmlns:p14="${P14}" val="${bool01(s.showMediaControls, true)}"/>`);
    }
    else if (/<\/p:extLst>/.test(ext)) {
        ext = ext.replace("</p:extLst>", `${mediaCtrlsExt(s)}</p:extLst>`);
    }
    else {
        ext = `<p:extLst>${mediaCtrlsExt(s)}</p:extLst>`;
    }
    return ext;
}
function renderShowPrXml(s, existingExtLst) {
    const attrs = [
        `loop="${bool01(s.loop, false)}"`,
        `showNarration="${bool01(s.showNarration, true)}"`,
        `showAnimation="${bool01(s.showAnimation, true)}"`,
        `useTimings="${bool01(s.useTimings, true)}"`,
    ].join(" ");
    return `<p:showPr ${attrs}>${showKindXml(s)}${slidesXml(s)}${penClrXml(s)}${mergeExtLst(existingExtLst, s)}</p:showPr>`;
}
function renderPresPropsXml(s) {
    return `${(0, xml_util_1.xmlHeader)()}
<p:presentationPr ${PML}>${renderShowPrXml(s)}</p:presentationPr>`;
}
function allocRelId(relsXml) {
    const used = new Set();
    for (const m of relsXml.matchAll(/Id="([^"]+)"/g))
        used.add(m[1]);
    let n = 1;
    while (used.has(`rId${n}`))
        n++;
    return `rId${n}`;
}
function insertRel(relsXml, relId, type, target) {
    if (relsXml.includes(`Type="${type}"`))
        return relsXml;
    const rel = `<Relationship Id="${relId}" Type="${type}" Target="${target}"/>`;
    if (!relsXml) {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${rel}
</Relationships>`;
    }
    return relsXml.replace(/<\/Relationships>/, `${rel}</Relationships>`);
}
function insertContentTypeOverride(ctXml, partName, contentType) {
    if (ctXml.includes(`PartName="${partName}"`))
        return ctXml;
    const row = `<Override PartName="${partName}" ContentType="${(0, xml_util_1.esc)(contentType)}"/>`;
    if (!ctXml.includes("</Types>"))
        return ctXml;
    return ctXml.replace("</Types>", `${row}</Types>`);
}
function ensurePresPropsPart(archive, xml, presSrc) {
    const path = presSrc?.presPropsPartPath ?? "ppt/presProps.xml";
    archive.files.set(path, (0, fflate_1.strToU8)(xml));
    const relsPath = "ppt/_rels/presentation.xml.rels";
    const relsXml = archive.files.has(relsPath) ? (0, fflate_1.strFromU8)(archive.files.get(relsPath)) : "";
    if (!relsXml.includes(`Type="${exports.REL_TYPE_PRES_PROPS}"`)) {
        const relId = allocRelId(relsXml);
        archive.files.set(relsPath, (0, fflate_1.strToU8)(insertRel(relsXml, relId, exports.REL_TYPE_PRES_PROPS, "presProps.xml")));
    }
    const ctPath = "[Content_Types].xml";
    const ctBytes = archive.files.get(ctPath);
    if (ctBytes) {
        archive.files.set(ctPath, (0, fflate_1.strToU8)(insertContentTypeOverride((0, fflate_1.strFromU8)(ctBytes), `/${path}`, exports.CT_PRES_PROPS)));
    }
    if (presSrc)
        presSrc.presPropsPartPath = path;
}
function patchShowPrInXml(xml, s) {
    const m = xml.match(/<p:showPr\b[\s\S]*?<\/p:showPr>/);
    const ext = m?.[0]?.match(/<p:extLst>[\s\S]*?<\/p:extLst>/)?.[0];
    const next = renderShowPrXml(s, ext);
    if (m)
        return xml.replace(m[0], next);
    return xml.replace(/<p:presentationPr([^>]*)>/, `<p:presentationPr$1>${next}`);
}
function injectScratchPresProps(pres, files) {
    if (!(0, core_1.showPropertiesHasContent)(pres.showPr))
        return;
    const path = "ppt/presProps.xml";
    files[path] = renderPresPropsXml(pres.showPr);
    const relsPath = "ppt/_rels/presentation.xml.rels";
    const relId = allocRelId(files[relsPath] ?? "");
    files[relsPath] = insertRel(files[relsPath] ?? "", relId, exports.REL_TYPE_PRES_PROPS, "presProps.xml");
    files["[Content_Types].xml"] = insertContentTypeOverride(files["[Content_Types].xml"] ?? "", `/${path}`, exports.CT_PRES_PROPS);
}
function patchPresProps(pres, archive, opts = {}) {
    const presSrc = pres.__source;
    const nextSnap = (0, core_1.showPropertiesSnapshot)(pres.showPr);
    const prevSnap = presSrc?.showPrSnapshot ?? "";
    if (nextSnap === prevSnap)
        return;
    if (!(0, core_1.showPropertiesHasContent)(pres.showPr))
        return;
    const path = presSrc?.presPropsPartPath ?? "ppt/presProps.xml";
    const existing = archive.files.get(path);
    if (!existing) {
        ensurePresPropsPart(archive, renderPresPropsXml(pres.showPr), presSrc);
    }
    else {
        archive.files.set(path, (0, fflate_1.strToU8)(patchShowPrInXml((0, fflate_1.strFromU8)(existing), pres.showPr)));
    }
    if (opts.debug)
        console.log(`[roundtrip] ${path} showPr patched`);
}
