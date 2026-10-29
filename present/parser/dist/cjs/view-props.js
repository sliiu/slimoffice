"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseViewGuides = parseViewGuides;
const core_1 = require("@sliiu/present-core");
const units_1 = require("./units");
const xml_1 = require("./xml");
const parts_1 = require("./parts");
const TYPE_VIEW_PROPS = "/viewProps";
function followViewPropsPath(rels) {
    for (const r of rels.list) {
        if (r.type.endsWith(TYPE_VIEW_PROPS) || r.type.includes(TYPE_VIEW_PROPS)) {
            return rels.resolve(r.id);
        }
    }
    return undefined;
}
function parseGuideLst(lst) {
    if (!lst)
        return [];
    const out = [];
    for (const g of (0, xml_1.findAllByLocalName)(lst, "guide")) {
        const posRaw = (0, xml_1.attr)(g, "pos");
        const pos = posRaw !== undefined ? Number(posRaw) : 0;
        if (!Number.isFinite(pos))
            continue;
        const orient = (0, xml_1.attr)(g, "orient") === "horz" ? "horz" : "vert";
        out.push({ orient, pos: (0, core_1.guidePosToPx)(pos) });
    }
    return out;
}
function parseCSldView(viewPr, local) {
    const view = (0, xml_1.findByLocalName)(viewPr, local);
    const cSld = (0, xml_1.findByLocalName)(view, "cSldViewPr");
    const guides = parseGuideLst((0, xml_1.findByLocalName)(cSld, "guideLst"));
    const showGuides = (0, units_1.boolish)((0, xml_1.attr)(cSld, "showGuides"));
    const snapToGrid = (0, units_1.boolish)((0, xml_1.attr)(cSld, "snapToGrid"));
    const snapToObjects = (0, units_1.boolish)((0, xml_1.attr)(cSld, "snapToObjects"));
    return { guides, showGuides, snapToGrid, snapToObjects };
}
/** ECMA-376 §19.2.2 `ppt/viewProps.xml` — 幻灯片/备注视图参考线与网格。 */
function parseViewGuides(archive, presRels) {
    const path = followViewPropsPath(presRels);
    if (!path)
        return {};
    const xml = (0, parts_1.loadXmlPart)(archive, path);
    const viewPr = (0, xml_1.findByLocalName)(xml, "viewPr");
    if (!viewPr)
        return { viewPropsPartPath: path };
    const slide = parseCSldView(viewPr, "slideViewPr");
    const notes = parseCSldView(viewPr, "notesViewPr");
    const gridEl = (0, xml_1.findByLocalName)(viewPr, "gridSpacing");
    const gx = (0, units_1.emuToPx)((0, xml_1.attr)(gridEl, "cx"));
    const gy = (0, units_1.emuToPx)((0, xml_1.attr)(gridEl, "cy"));
    const out = { slide: slide.guides };
    if (notes.guides.length)
        out.notes = notes.guides;
    if (slide.showGuides !== undefined)
        out.showGuides = slide.showGuides;
    if (slide.snapToGrid !== undefined)
        out.snapToGrid = slide.snapToGrid;
    if (slide.snapToObjects !== undefined)
        out.snapToObjects = slide.snapToObjects;
    if (gx > 0 || gy > 0)
        out.gridSpacing = { x: gx || gy, y: gy || gx };
    return { viewGuides: out, viewPropsPartPath: path };
}
