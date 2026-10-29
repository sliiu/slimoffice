"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSmartArt = parseSmartArt;
exports.parseSmartArtDetailed = parseSmartArtDetailed;
const core_1 = require("@sliiu/present-core");
const parts_1 = require("./parts");
const xml_1 = require("./xml");
const shapes_1 = require("./shapes");
const text_1 = require("./text");
function parseSmartArt(archive, dataPath, ctx, hostBBox) {
    return parseSmartArtDetailed(archive, dataPath, ctx, hostBBox).shapes;
}
function parseSmartArtDetailed(archive, dataPath, ctx, hostBBox, layoutPath) {
    const xml = (0, parts_1.loadXmlPart)(archive, dataPath);
    if (!xml)
        return { shapes: [] };
    const dataRels = (0, parts_1.loadRels)(archive, dataPath);
    const layoutMeta = loadLayoutMetaFromPath(archive, layoutPath) ?? loadLayoutMeta(archive, dataRels);
    const layout = layoutKindFromMeta(layoutMeta);
    const hostFrame = hostBBox
        ? { offX: hostBBox.x, offY: hostBBox.y, scaleX: 1, scaleY: 1 }
        : undefined;
    const drawing = findDrawing(xml);
    if (drawing) {
        const localCtx = { ...ctx, rels: dataRels };
        return { shapes: (0, shapes_1.parseShapeTree)(drawing, localCtx, hostFrame), layout };
    }
    const drawingPath = followFirst(dataRels, "diagramDrawing") ?? followFirst(dataRels, "/diagrams/drawing");
    if (drawingPath) {
        const dxml = (0, parts_1.loadXmlPart)(archive, drawingPath);
        if (dxml) {
            const root = (0, xml_1.findByLocalName)(dxml, "drawing");
            const spTree = (0, xml_1.findByLocalName)(root, "spTree");
            if (spTree) {
                const drawingRels = (0, parts_1.loadRels)(archive, drawingPath);
                const localCtx = { ...ctx, rels: drawingRels };
                return { shapes: (0, shapes_1.parseShapeTree)(spTree, localCtx, hostFrame), layout };
            }
        }
    }
    return buildFallback(xml, ctx, hostBBox, layoutMeta);
}
function layoutKindFromMeta(meta) {
    const fromId = (0, core_1.smartArtLayoutFromUniqueId)(meta?.uniqueId);
    if (fromId)
        return fromId;
    if (meta?.cat)
        return (0, core_1.smartArtLayoutFromCat)(meta.cat);
    return undefined;
}
function loadLayoutMetaFromPath(archive, layoutPath) {
    if (!layoutPath)
        return undefined;
    const xml = (0, parts_1.loadXmlPart)(archive, layoutPath);
    if (!xml)
        return undefined;
    return readLayoutDef(xml);
}
function loadLayoutMeta(archive, dataRels) {
    const layoutPath = followFirst(dataRels, "diagramLayout") ?? followFirst(dataRels, "/diagrams/layout");
    if (!layoutPath)
        return undefined;
    const xml = (0, parts_1.loadXmlPart)(archive, layoutPath);
    if (!xml)
        return undefined;
    return readLayoutDef(xml);
}
function readLayoutDef(xml) {
    const root = (0, xml_1.findByLocalName)(xml, "layoutDef");
    const title = (0, xml_1.attr)((0, xml_1.findByLocalName)(root, "title"), "val");
    const uniqueId = (0, xml_1.attr)(root, "uniqueId");
    const catLst = (0, xml_1.findByLocalName)(root, "catLst");
    let cat;
    let bestPri = Infinity;
    for (const c of (0, xml_1.findAllByLocalName)(catLst, "cat")) {
        const pri = Number((0, xml_1.attr)(c, "pri") ?? "9999");
        if (pri < bestPri) {
            bestPri = pri;
            cat = (0, xml_1.attr)(c, "type");
        }
    }
    return { cat, title, uniqueId };
}
function findDrawing(xml) {
    const dm = (0, xml_1.findByLocalName)(xml, "dataModel");
    const ext = (0, xml_1.findByLocalName)(dm, "extLst") ?? (0, xml_1.findByLocalName)(xml, "extLst");
    for (const e of (0, xml_1.findAllByLocalName)(ext, "ext")) {
        const drawing = (0, xml_1.findByLocalName)(e, "drawing");
        const spTree = (0, xml_1.findByLocalName)(drawing, "spTree");
        if (spTree)
            return spTree;
    }
    return undefined;
}
function followFirst(rels, contains) {
    for (const r of rels.list) {
        if (r.type.includes(contains))
            return rels.resolve(r.id);
    }
    return undefined;
}
function buildFallback(xml, ctx, hostBBox, layout) {
    const dm = (0, xml_1.findByLocalName)(xml, "dataModel");
    if (!dm)
        return { shapes: [], layout: "list" };
    const ptLst = (0, xml_1.findByLocalName)(dm, "ptLst");
    const pts = (0, xml_1.findAllByLocalName)(ptLst, "pt");
    const items = [];
    for (const pt of pts) {
        const type = (0, xml_1.attr)(pt, "type");
        if (type === "doc" || type === "pres" || type === "asst")
            continue;
        const id = (0, xml_1.attr)(pt, "modelId") ?? `pt_${items.length}`;
        const prSet = (0, xml_1.findByLocalName)(pt, "prSet");
        const phldrT = (0, xml_1.attr)(prSet, "phldrT");
        const lvlStr = (0, xml_1.attr)(prSet, "lvl");
        const lvl = lvlStr ? Number(lvlStr) || 0 : 0;
        if (phldrT && phldrT.trim()) {
            items.push({ id, text: phldrT.trim(), lvl });
            continue;
        }
        const txBody = (0, xml_1.findByLocalName)(pt, "t");
        if (!txBody)
            continue;
        const paragraphs = (0, text_1.parseTxBody)(txBody, ctx);
        const text = paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n").trim();
        if (!text)
            continue;
        items.push({ id, text, lvl });
    }
    if (items.length === 0)
        return { shapes: [], layout: "list" };
    const bbox = hostBBox ?? { x: 0, y: 0, w: 600, h: 400 };
    const layoutKind = layoutKindFromMeta(layout) ?? (0, core_1.smartArtLayoutFromCat)(layout?.cat);
    return { shapes: (0, core_1.buildSmartArtShapes)(layoutKind, items, bbox), layout: layoutKind };
}
