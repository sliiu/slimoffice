"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBuildList = parseBuildList;
const xml_1 = require("./xml");
function parseBuildList(timingEl) {
    if (!timingEl)
        return [];
    const bldLst = (0, xml_1.findByLocalName)(timingEl, "bldLst");
    if (!bldLst)
        return [];
    const out = [];
    for (const c of (0, xml_1.orderedChildren)(bldLst)) {
        const local = (0, xml_1.stripNs)(c.tag);
        const node = c.node;
        const spId = (0, xml_1.attr)(node, "spid");
        if (!spId)
            continue;
        const grpIdRaw = (0, xml_1.attr)(node, "grpId");
        const grpId = grpIdRaw ? Number(grpIdRaw) : undefined;
        // §19.5.3 animBg / autoUpdateAnimBg / rev：xsd:boolean，PowerPoint 写 "1"/"true"/"0"。
        const animBg = (0, xml_1.attr)(node, "animBg") === "1" || (0, xml_1.attr)(node, "animBg") === "true";
        const autoUpdate = (0, xml_1.attr)(node, "autoUpdateAnimBg") === "1" || (0, xml_1.attr)(node, "autoUpdateAnimBg") === "true";
        const rev = (0, xml_1.attr)(node, "rev") === "1" || (0, xml_1.attr)(node, "rev") === "true";
        const uiExpand = (0, xml_1.attr)(node, "uiExpand") === "1" || (0, xml_1.attr)(node, "uiExpand") === "true";
        const bldLvlRaw = (0, xml_1.attr)(node, "bldLvl");
        const bldLvl = bldLvlRaw ? Number(bldLvlRaw) : undefined;
        const build = (0, xml_1.attr)(node, "build");
        const shapeId = `sp_${spId}`;
        if (local === "bldP") {
            out.push({
                kind: "para",
                shapeId,
                grpId,
                build: build ?? "p",
                bldLvl,
                animBg,
                autoUpdateAnimBg: autoUpdate,
                rev,
                uiExpand,
            });
        }
        else if (local === "bldDgm") {
            out.push({ kind: "diagram", shapeId, grpId, build: build ?? "allAtOnce" });
        }
        else if (local === "bldChart") {
            out.push({ kind: "chart", shapeId, grpId, build: build ?? "allAtOnce", animBg });
        }
        else if (local === "bldGraphic") {
            out.push({ kind: "graphic", shapeId, grpId, build: build ?? "allAtOnce" });
        }
        else if (local === "bldOleChart") {
            out.push({ kind: "ole", shapeId, grpId, build: build ?? "allAtOnce" });
        }
    }
    return out;
}
