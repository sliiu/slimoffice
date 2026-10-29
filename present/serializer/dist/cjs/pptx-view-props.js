"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CT_VIEW_PROPS = exports.REL_TYPE_VIEW_PROPS = void 0;
exports.renderViewPropsXml = renderViewPropsXml;
exports.injectScratchViewProps = injectScratchViewProps;
exports.patchViewProps = patchViewProps;
const core_1 = require("@sliiu/present-core");
const fflate_1 = require("fflate");
const xml_util_1 = require("./xml-util");
exports.REL_TYPE_VIEW_PROPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps";
exports.CT_VIEW_PROPS = "application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml";
const PML = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
function boolAttr(v) {
    if (v === undefined)
        return "";
    return v ? "1" : "0";
}
function renderGuideLst(guides) {
    const rows = (guides ?? [])
        .map((g) => {
        const pos = (0, core_1.pxToGuidePos)(g.pos);
        return g.orient === "horz"
            ? `<p:guide orient="horz" pos="${pos}"/>`
            : `<p:guide pos="${pos}"/>`;
    })
        .join("");
    return `<p:guideLst>${rows}</p:guideLst>`;
}
function cSldViewPrOpen(g) {
    const parts = [];
    const snap = boolAttr(g?.snapToGrid);
    const objs = boolAttr(g?.snapToObjects);
    const show = boolAttr(g?.showGuides);
    if (snap)
        parts.push(`snapToGrid="${snap}"`);
    if (objs)
        parts.push(`snapToObjects="${objs}"`);
    if (show)
        parts.push(`showGuides="${show}"`);
    return parts.length ? `<p:cSldViewPr ${parts.join(" ")}>` : "<p:cSldViewPr>";
}
function gridSpacingXml(g) {
    if (!g?.gridSpacing)
        return "";
    return `<p:gridSpacing cx="${(0, xml_util_1.pxToEmu)(g.gridSpacing.x)}" cy="${(0, xml_util_1.pxToEmu)(g.gridSpacing.y)}"/>`;
}
function defaultCViewPr() {
    return `<p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr>`;
}
function renderViewPropsXml(g) {
    const notesLst = g.notes?.length
        ? `<p:notesViewPr><p:cSldViewPr>${defaultCViewPr()}${renderGuideLst(g.notes)}</p:cSldViewPr></p:notesViewPr>`
        : "";
    return `${(0, xml_util_1.xmlHeader)()}
<p:viewPr ${PML} lastView="sldView">
  <p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>
  <p:slideViewPr>${cSldViewPrOpen(g)}${defaultCViewPr()}${renderGuideLst(g.slide)}</p:cSldViewPr></p:slideViewPr>
  <p:outlineViewPr>${defaultCViewPr()}</p:outlineViewPr>
  <p:notesTextViewPr>${defaultCViewPr()}</p:notesTextViewPr>
  <p:sorterViewPr>${defaultCViewPr()}</p:sorterViewPr>
  ${notesLst}
  ${gridSpacingXml(g)}
</p:viewPr>`;
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
function ensureViewPropsPart(archive, xml, presSrc) {
    const path = presSrc?.viewPropsPartPath ?? "ppt/viewProps.xml";
    archive.files.set(path, (0, fflate_1.strToU8)(xml));
    const relsPath = "ppt/_rels/presentation.xml.rels";
    const relsXml = archive.files.has(relsPath) ? (0, fflate_1.strFromU8)(archive.files.get(relsPath)) : "";
    if (!relsXml.includes(`Type="${exports.REL_TYPE_VIEW_PROPS}"`)) {
        const relId = allocRelId(relsXml);
        archive.files.set(relsPath, (0, fflate_1.strToU8)(insertRel(relsXml, relId, exports.REL_TYPE_VIEW_PROPS, "viewProps.xml")));
    }
    const ctPath = "[Content_Types].xml";
    const ctBytes = archive.files.get(ctPath);
    if (ctBytes) {
        archive.files.set(ctPath, (0, fflate_1.strToU8)(insertContentTypeOverride((0, fflate_1.strFromU8)(ctBytes), `/${path}`, exports.CT_VIEW_PROPS)));
    }
    if (presSrc)
        presSrc.viewPropsPartPath = path;
}
function patchSlideViewSection(xml, g) {
    const start = xml.indexOf("<p:slideViewPr");
    const end = xml.indexOf("</p:slideViewPr>");
    if (start < 0 || end < 0 || end < start) {
        const block = `<p:slideViewPr>${cSldViewPrOpen(g)}${defaultCViewPr()}${renderGuideLst(g.slide)}</p:cSldViewPr></p:slideViewPr>`;
        return xml.replace(/<\/p:viewPr>/, `${block}</p:viewPr>`);
    }
    let section = xml.slice(start, end + "</p:slideViewPr>".length);
    section = section.replace(/<p:cSldViewPr\b[^>]*>/, cSldViewPrOpen(g));
    if (/<p:guideLst\b/.test(section)) {
        section = section.replace(/<p:guideLst\b[^>]*\/>/, renderGuideLst(g.slide));
        section = section.replace(/<p:guideLst\b[\s\S]*?<\/p:guideLst>/, renderGuideLst(g.slide));
    }
    else if (section.includes("</p:cSldViewPr>")) {
        section = section.replace("</p:cSldViewPr>", `${renderGuideLst(g.slide)}</p:cSldViewPr>`);
    }
    if (g.gridSpacing) {
        const grid = gridSpacingXml(g);
        if (/<p:gridSpacing\b/.test(xml)) {
            xml = xml.replace(/<p:gridSpacing\b[^/]*\/>/, grid);
        }
        else {
            xml = xml.replace(/<\/p:viewPr>/, `${grid}</p:viewPr>`);
        }
    }
    return xml.slice(0, start) + section + xml.slice(end + "</p:slideViewPr>".length);
}
/** from-scratch：把 `pres.viewGuides` 写成 `ppt/viewProps.xml`。 */
function injectScratchViewProps(pres, files) {
    if (!(0, core_1.viewGuidesHasContent)(pres.viewGuides))
        return;
    const path = "ppt/viewProps.xml";
    files[path] = renderViewPropsXml(pres.viewGuides);
    const relsPath = "ppt/_rels/presentation.xml.rels";
    const relId = allocRelId(files[relsPath] ?? "");
    files[relsPath] = insertRel(files[relsPath] ?? "", relId, exports.REL_TYPE_VIEW_PROPS, "viewProps.xml");
    files["[Content_Types].xml"] = insertContentTypeOverride(files["[Content_Types].xml"] ?? "", `/${path}`, exports.CT_VIEW_PROPS);
}
/** round-trip：仅当参考线 / 网格开关相对解析快照有改动时 patch viewProps。 */
function patchViewProps(pres, archive, opts = {}) {
    const presSrc = pres.__source;
    const nextSnap = (0, core_1.viewGuidesSnapshot)(pres.viewGuides);
    const prevSnap = presSrc?.viewGuidesSnapshot ?? "";
    if (nextSnap === prevSnap)
        return;
    if (!(0, core_1.viewGuidesHasContent)(pres.viewGuides)) {
        return;
    }
    const path = presSrc?.viewPropsPartPath ?? "ppt/viewProps.xml";
    const existing = archive.files.get(path);
    if (!existing) {
        ensureViewPropsPart(archive, renderViewPropsXml(pres.viewGuides), presSrc);
    }
    else {
        const patched = patchSlideViewSection((0, fflate_1.strFromU8)(existing), pres.viewGuides);
        archive.files.set(path, (0, fflate_1.strToU8)(patched));
    }
    if (opts.debug)
        console.log(`[roundtrip] ${path} view guides patched`);
}
