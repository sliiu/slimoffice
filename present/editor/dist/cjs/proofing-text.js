"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paragraphPlain = paragraphPlain;
exports.shapePlainText = shapePlainText;
exports.walkTextShapes = walkTextShapes;
exports.slideTextLines = slideTextLines;
exports.firstWord = firstWord;
exports.proofingSelectionFromShape = proofingSelectionFromShape;
exports.replaceFirstWordInParagraphs = replaceFirstWordInParagraphs;
exports.listTextShapeIds = listTextShapeIds;
function paragraphPlain(p) {
    return p.runs.map((r) => r.text).join("");
}
function shapePlainText(shape) {
    return shape.paragraphs.map(paragraphPlain).join("\n");
}
function walkTextShapes(shapes, out) {
    for (const s of shapes) {
        if (s.kind === "text") {
            out.push({ shapeId: s.id, text: s });
            continue;
        }
        if (s.kind !== "group")
            continue;
        for (const c of s.children) {
            if (c.kind === "text" && !c.cellMeta?.hidden) {
                out.push({ shapeId: c.id, text: c });
            }
            else if (c.kind === "group") {
                walkTextShapes([c], out);
            }
        }
    }
}
function slideTextLines(slide) {
    if (!slide)
        return [];
    const hits = [];
    for (const layer of slide.layers) {
        if (!layer.visible)
            continue;
        walkTextShapes(layer.shapes, hits);
    }
    const lines = [];
    for (const h of hits) {
        for (const p of h.text.paragraphs) {
            const t = paragraphPlain(p).trim();
            if (t)
                lines.push(t);
        }
    }
    return lines;
}
function firstWord(text) {
    const m = text.match(/[\p{L}\p{N}']+/u);
    return m?.[0] ?? text.trim().split(/\s+/)[0] ?? "";
}
function proofingSelectionFromShape(slideIdx, shapeId, shape) {
    if (!shape)
        return null;
    const text = shape.kind === "text"
        ? shape
        : shape.kind === "group"
            ? shape.children.find((c) => c.kind === "text" && !c.cellMeta?.hidden)
            : undefined;
    if (!text)
        return null;
    const fullText = shapePlainText(text);
    const word = firstWord(fullText);
    if (!word)
        return null;
    return { slideIdx, shapeId, word, fullText };
}
function replaceFirstWordInParagraphs(paragraphs, fromWord, toWord) {
    if (!fromWord)
        return null;
    const re = new RegExp(`\\b${escapeRegex(fromWord)}\\b`, "iu");
    let changed = false;
    const next = paragraphs.map((p) => {
        const plain = paragraphPlain(p);
        if (!re.test(plain))
            return p;
        changed = true;
        const replaced = plain.replace(re, toWord);
        if (p.runs.length === 1) {
            return { ...p, runs: [{ ...p.runs[0], text: replaced }] };
        }
        return { ...p, runs: [{ ...p.runs[0], text: replaced }, ...p.runs.slice(1).map((r) => ({ ...r, text: "" }))] };
    });
    return changed ? next : null;
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function listTextShapeIds(slide) {
    const hits = [];
    for (const layer of slide.layers) {
        if (!layer.visible)
            continue;
        walkTextShapes(layer.shapes, hits);
    }
    return hits.map((h) => h.shapeId);
}
