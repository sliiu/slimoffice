"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECTION_LST_URI = void 0;
exports.parsePresentationSectionLst = parsePresentationSectionLst;
const core_1 = require("@sliiu/present-core");
const xml_1 = require("./xml");
exports.SECTION_LST_URI = "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}";
function parsePresentationSectionLst(presEl, slideCount) {
    if (!presEl)
        return [];
    const sldIdLst = (0, xml_1.findByLocalName)(presEl, "sldIdLst");
    const sldIdNodes = (0, xml_1.findAllByLocalName)(sldIdLst, "sldId");
    const indexBySldId = new Map();
    sldIdNodes.forEach((n, i) => {
        const id = Number((0, xml_1.attr)(n, "id"));
        if (Number.isFinite(id) && !indexBySldId.has(id))
            indexBySldId.set(id, i);
    });
    const extLst = (0, xml_1.findByLocalName)(presEl, "extLst");
    let sectionLst;
    for (const ext of (0, xml_1.findAllByLocalName)(extLst, "ext")) {
        if ((0, xml_1.attr)(ext, "uri") === exports.SECTION_LST_URI) {
            sectionLst = (0, xml_1.findByLocalName)(ext, "sectionLst");
            break;
        }
    }
    if (!sectionLst)
        return [];
    const out = [];
    for (const sec of (0, xml_1.findAllByLocalName)(sectionLst, "section")) {
        const name = ((0, xml_1.attr)(sec, "name") ?? "").trim();
        const id = ((0, xml_1.attr)(sec, "id") ?? "").trim();
        if (!name)
            continue;
        const ids = (0, xml_1.findAllByLocalName)((0, xml_1.findByLocalName)(sec, "sldIdLst"), "sldId");
        let start = Number.POSITIVE_INFINITY;
        for (const n of ids) {
            const sid = Number((0, xml_1.attr)(n, "id"));
            const idx = indexBySldId.get(sid);
            if (idx !== undefined && idx < start)
                start = idx;
        }
        if (!Number.isFinite(start))
            continue;
        out.push({
            id: id || `sec_${start}`,
            name,
            startIndex: start,
        });
    }
    return (0, core_1.normalizeDeckSections)(out, slideCount);
}
