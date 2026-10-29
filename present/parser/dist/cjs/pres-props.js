"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseShowProperties = parseShowProperties;
const parts_1 = require("./parts");
const units_1 = require("./units");
const xml_1 = require("./xml");
const TYPE_PRES_PROPS = "/presProps";
const SHOW_MEDIA_CTRLS_URI = "{2FDB2607-1784-4EEB-B798-7EB5836EED8A}";
function followPresPropsPath(rels) {
    for (const r of rels.list) {
        if (r.type.endsWith(TYPE_PRES_PROPS) || r.type.includes(TYPE_PRES_PROPS)) {
            return rels.resolve(r.id);
        }
    }
    return undefined;
}
function parsePenColor(pen) {
    const srgb = (0, xml_1.findByLocalName)(pen, "srgbClr");
    const hex = (0, xml_1.attr)(srgb, "val");
    if (hex && /^[0-9A-Fa-f]{6}$/.test(hex))
        return `#${hex.toUpperCase()}`;
    const prst = (0, xml_1.attr)((0, xml_1.findByLocalName)(pen, "prstClr"), "val");
    if (prst === "red")
        return "#FF0000";
    if (prst === "black")
        return "#000000";
    if (prst === "white")
        return "#FFFFFF";
    return undefined;
}
function parseShowKind(showPr) {
    if ((0, xml_1.findByLocalName)(showPr, "kiosk"))
        return { kind: "kiosk" };
    const browse = (0, xml_1.findByLocalName)(showPr, "browse");
    if (browse) {
        const sb = (0, units_1.boolish)((0, xml_1.attr)(browse, "showScrollbar"));
        return { kind: "browse", browseShowScrollbar: sb };
    }
    return { kind: "present" };
}
function parseSlides(showPr) {
    const rg = (0, xml_1.findByLocalName)(showPr, "sldRg");
    if (rg) {
        const start = Number((0, xml_1.attr)(rg, "st") ?? "1");
        const end = Number((0, xml_1.attr)(rg, "end") ?? start);
        if (Number.isFinite(start) && Number.isFinite(end)) {
            const range = { start, end };
            return range;
        }
    }
    const cust = (0, xml_1.findByLocalName)(showPr, "custShow");
    if (cust) {
        const id = Number((0, xml_1.attr)(cust, "id") ?? "0");
        if (Number.isFinite(id))
            return { customShowId: id };
    }
    return "all";
}
function parseShowMediaControls(showPr) {
    const extLst = (0, xml_1.findByLocalName)(showPr, "extLst");
    if (!extLst)
        return undefined;
    for (const ext of (0, xml_1.findAllByLocalName)(extLst, "ext")) {
        const uri = (0, xml_1.attr)(ext, "uri") ?? "";
        const ctrls = (0, xml_1.findByLocalName)(ext, "showMediaCtrls");
        if (ctrls || uri === SHOW_MEDIA_CTRLS_URI) {
            const v = (0, units_1.boolish)((0, xml_1.attr)(ctrls, "val"));
            return v ?? true;
        }
    }
    return undefined;
}
function parseShowPr(showPr) {
    const out = {};
    const loop = (0, units_1.boolish)((0, xml_1.attr)(showPr, "loop"));
    out.loop = loop ?? false;
    const narr = (0, units_1.boolish)((0, xml_1.attr)(showPr, "showNarration"));
    out.showNarration = narr ?? true;
    const anim = (0, units_1.boolish)((0, xml_1.attr)(showPr, "showAnimation"));
    out.showAnimation = anim ?? true;
    const timings = (0, units_1.boolish)((0, xml_1.attr)(showPr, "useTimings"));
    out.useTimings = timings ?? true;
    const { kind, browseShowScrollbar } = parseShowKind(showPr);
    out.kind = kind;
    if (browseShowScrollbar !== undefined)
        out.browseShowScrollbar = browseShowScrollbar;
    const slides = parseSlides(showPr);
    if (slides && typeof slides === "object" && "customShowId" in slides) {
        out.customShowId = slides.customShowId;
        out.slides = "all";
    }
    else {
        out.slides = slides;
    }
    const pen = parsePenColor((0, xml_1.findByLocalName)(showPr, "penClr"));
    if (pen)
        out.penColor = pen;
    const media = parseShowMediaControls(showPr);
    if (media !== undefined)
        out.showMediaControls = media;
    else
        out.showMediaControls = true;
    return out;
}
/** ECMA-376 §19.2.2 `ppt/presProps.xml` — 放映方式。 */
function parseShowProperties(archive, presRels) {
    const path = followPresPropsPath(presRels);
    if (!path)
        return {};
    const xml = (0, parts_1.loadXmlPart)(archive, path);
    const root = (0, xml_1.findByLocalName)(xml, "presentationPr");
    const showEl = (0, xml_1.findByLocalName)(root, "showPr");
    if (!showEl)
        return { presPropsPartPath: path };
    return { showPr: parseShowPr(showEl), presPropsPartPath: path };
}
