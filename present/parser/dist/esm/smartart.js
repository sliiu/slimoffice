import { buildSmartArtShapes, smartArtLayoutFromCat, smartArtLayoutFromUniqueId, } from "@sliiu/present-core";
import { loadXmlPart, loadRels } from "./parts.js";
import { attr, findByLocalName, findAllByLocalName } from "./xml.js";
import { parseShapeTree } from "./shapes.js";
import { parseTxBody } from "./text.js";
export function parseSmartArt(archive, dataPath, ctx, hostBBox) {
    return parseSmartArtDetailed(archive, dataPath, ctx, hostBBox).shapes;
}
export function parseSmartArtDetailed(archive, dataPath, ctx, hostBBox, layoutPath) {
    const xml = loadXmlPart(archive, dataPath);
    if (!xml)
        return { shapes: [] };
    const dataRels = loadRels(archive, dataPath);
    const layoutMeta = loadLayoutMetaFromPath(archive, layoutPath) ?? loadLayoutMeta(archive, dataRels);
    const layout = layoutKindFromMeta(layoutMeta);
    const hostFrame = hostBBox
        ? { offX: hostBBox.x, offY: hostBBox.y, scaleX: 1, scaleY: 1 }
        : undefined;
    const drawing = findDrawing(xml);
    if (drawing) {
        const localCtx = { ...ctx, rels: dataRels };
        return { shapes: parseShapeTree(drawing, localCtx, hostFrame), layout };
    }
    const drawingPath = followFirst(dataRels, "diagramDrawing") ?? followFirst(dataRels, "/diagrams/drawing");
    if (drawingPath) {
        const dxml = loadXmlPart(archive, drawingPath);
        if (dxml) {
            const root = findByLocalName(dxml, "drawing");
            const spTree = findByLocalName(root, "spTree");
            if (spTree) {
                const drawingRels = loadRels(archive, drawingPath);
                const localCtx = { ...ctx, rels: drawingRels };
                return { shapes: parseShapeTree(spTree, localCtx, hostFrame), layout };
            }
        }
    }
    return buildFallback(xml, ctx, hostBBox, layoutMeta);
}
function layoutKindFromMeta(meta) {
    const fromId = smartArtLayoutFromUniqueId(meta?.uniqueId);
    if (fromId)
        return fromId;
    if (meta?.cat)
        return smartArtLayoutFromCat(meta.cat);
    return undefined;
}
function loadLayoutMetaFromPath(archive, layoutPath) {
    if (!layoutPath)
        return undefined;
    const xml = loadXmlPart(archive, layoutPath);
    if (!xml)
        return undefined;
    return readLayoutDef(xml);
}
function loadLayoutMeta(archive, dataRels) {
    const layoutPath = followFirst(dataRels, "diagramLayout") ?? followFirst(dataRels, "/diagrams/layout");
    if (!layoutPath)
        return undefined;
    const xml = loadXmlPart(archive, layoutPath);
    if (!xml)
        return undefined;
    return readLayoutDef(xml);
}
function readLayoutDef(xml) {
    const root = findByLocalName(xml, "layoutDef");
    const title = attr(findByLocalName(root, "title"), "val");
    const uniqueId = attr(root, "uniqueId");
    const catLst = findByLocalName(root, "catLst");
    let cat;
    let bestPri = Infinity;
    for (const c of findAllByLocalName(catLst, "cat")) {
        const pri = Number(attr(c, "pri") ?? "9999");
        if (pri < bestPri) {
            bestPri = pri;
            cat = attr(c, "type");
        }
    }
    return { cat, title, uniqueId };
}
function findDrawing(xml) {
    const dm = findByLocalName(xml, "dataModel");
    const ext = findByLocalName(dm, "extLst") ?? findByLocalName(xml, "extLst");
    for (const e of findAllByLocalName(ext, "ext")) {
        const drawing = findByLocalName(e, "drawing");
        const spTree = findByLocalName(drawing, "spTree");
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
    const dm = findByLocalName(xml, "dataModel");
    if (!dm)
        return { shapes: [], layout: "list" };
    const ptLst = findByLocalName(dm, "ptLst");
    const pts = findAllByLocalName(ptLst, "pt");
    const items = [];
    for (const pt of pts) {
        const type = attr(pt, "type");
        if (type === "doc" || type === "pres" || type === "asst")
            continue;
        const id = attr(pt, "modelId") ?? `pt_${items.length}`;
        const prSet = findByLocalName(pt, "prSet");
        const phldrT = attr(prSet, "phldrT");
        const lvlStr = attr(prSet, "lvl");
        const lvl = lvlStr ? Number(lvlStr) || 0 : 0;
        if (phldrT && phldrT.trim()) {
            items.push({ id, text: phldrT.trim(), lvl });
            continue;
        }
        const txBody = findByLocalName(pt, "t");
        if (!txBody)
            continue;
        const paragraphs = parseTxBody(txBody, ctx);
        const text = paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n").trim();
        if (!text)
            continue;
        items.push({ id, text, lvl });
    }
    if (items.length === 0)
        return { shapes: [], layout: "list" };
    const bbox = hostBBox ?? { x: 0, y: 0, w: 600, h: 400 };
    const layoutKind = layoutKindFromMeta(layout) ?? smartArtLayoutFromCat(layout?.cat);
    return { shapes: buildSmartArtShapes(layoutKind, items, bbox), layout: layoutKind };
}
