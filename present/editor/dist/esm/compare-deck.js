import { getPresentationProtection } from "@sliiu/present-core";
import { findShape } from "./selection.js";
import { listTextShapeIds, shapePlainText, slideTextLines, walkTextShapes } from "./proofing-text.js";
function protectionSummary(pres) {
    const p = getPresentationProtection(pres);
    if (!p)
        return "none";
    if (p.kind === "final")
        return "final";
    return p.passwordHash ? "restricted (password)" : "restricted";
}
/** Deck-level metadata diff (protection, etc.). */
export function comparePresentationMeta(a, b) {
    const out = [];
    const pa = protectionSummary(a);
    const pb = protectionSummary(b);
    if (pa !== pb)
        out.push({ kind: "protection", before: pa, after: pb });
    return out;
}
export function slideEntryHasTextPatches(e) {
    return (e.textShapes ?? []).some((d) => d.textChanged);
}
export function slideEntryHasStructureDiff(e) {
    return ((e.structure?.length ?? 0) > 0 || (e.textShapes ?? []).some((d) => d.bboxMoved));
}
/** Aggregate diff counts for compare dialog summary / filters. */
export function summarizeCompareEntries(entries) {
    let changed = 0;
    let added = 0;
    let removed = 0;
    let withTextPatches = 0;
    let withStructure = 0;
    for (const e of entries) {
        if (e.status === "changed")
            changed++;
        else if (e.status === "added")
            added++;
        else if (e.status === "removed")
            removed++;
        if (slideEntryHasTextPatches(e))
            withTextPatches++;
        if (slideEntryHasStructureDiff(e))
            withStructure++;
    }
    return { changed, added, removed, withTextPatches, withStructure };
}
const BEHAVIOR_KINDS = new Set([
    "set",
    "anim",
    "animClr",
    "animEffect",
    "animMotion",
    "animRot",
    "animScale",
    "cmd",
    "audio",
    "video",
]);
function paintSummary(paint) {
    if (!paint || paint.kind === "none")
        return "none";
    if (paint.kind === "solid")
        return `solid ${paint.color}`;
    if (paint.kind === "image")
        return "image";
    if (paint.kind === "linear")
        return "linear gradient";
    if (paint.kind === "radial")
        return "radial gradient";
    if (paint.kind === "pattern")
        return "pattern";
    return paint.kind;
}
function layoutSummary(ref) {
    if (!ref)
        return "default";
    return `${ref.masterId}/${ref.layoutId}`;
}
function transitionSummary(tr) {
    if (!tr)
        return "none";
    const dur = Number.isFinite(tr.duration) ? `${tr.duration}s` : "?";
    return `${tr.kind} (${dur})`;
}
function countBehaviorNodes(nodes) {
    let count = 0;
    for (const node of nodes) {
        if (BEHAVIOR_KINDS.has(node.kind))
            count += 1;
        if (node.kind === "par" || node.kind === "seq" || node.kind === "excl") {
            count += countBehaviorNodes(node.ctn.childTnLst ?? []);
        }
    }
    return count;
}
function animationSummary(slide) {
    const timing = slide?.ooxmlTiming;
    if (!timing?.tnLst?.length)
        return "0 effects";
    const effects = countBehaviorNodes(timing.tnLst);
    const builds = timing.bldLst?.length ?? slide?.builds?.length ?? 0;
    return `${effects} effects, ${builds} builds`;
}
function shapeInventory(slide) {
    if (!slide)
        return "0";
    const counts = new Map();
    const walk = (shapes) => {
        for (const s of shapes) {
            counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
            if (s.kind === "group")
                walk(s.children);
        }
    };
    for (const layer of slide.layers) {
        if (!layer.visible)
            continue;
        walk(layer.shapes);
    }
    return [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, n]) => `${k}×${n}`)
        .join(", ");
}
function pushIfChanged(out, kind, before, after) {
    if (before === after)
        return;
    out.push({ kind, before, after });
}
export function compareSlideStructure(a, b) {
    const out = [];
    if (!a || !b)
        return out;
    pushIfChanged(out, "layout", layoutSummary(a.layoutRef), layoutSummary(b.layoutRef));
    pushIfChanged(out, "transition", transitionSummary(a.transition), transitionSummary(b.transition));
    pushIfChanged(out, "animation", animationSummary(a), animationSummary(b));
    pushIfChanged(out, "build", String(a.builds?.length ?? 0), String(b.builds?.length ?? 0));
    pushIfChanged(out, "shapeInventory", shapeInventory(a), shapeInventory(b));
    pushIfChanged(out, "notes", (a.notes ?? "").trim(), (b.notes ?? "").trim());
    pushIfChanged(out, "background", paintSummary(a.background), paintSummary(b.background));
    pushIfChanged(out, "hidden", a.show === false ? "yes" : "no", b.show === false ? "yes" : "no");
    return out;
}
function listTextShapes(slide) {
    const hits = [];
    for (const layer of slide.layers) {
        if (!layer.visible)
            continue;
        walkTextShapes(layer.shapes, hits);
    }
    return hits.map((h) => h.text);
}
const BBOX_MOVE_TOL = 8;
function bboxMoved(a, b) {
    return (Math.abs(a.bbox.x - b.bbox.x) > BBOX_MOVE_TOL ||
        Math.abs(a.bbox.y - b.bbox.y) > BBOX_MOVE_TOL ||
        Math.abs(a.bbox.w - b.bbox.w) > BBOX_MOVE_TOL ||
        Math.abs(a.bbox.h - b.bbox.h) > BBOX_MOVE_TOL);
}
export function compareSlideTextShapes(a, b, targetIds) {
    const aTexts = listTextShapes(a);
    const bTexts = listTextShapes(b);
    const n = Math.max(aTexts.length, bTexts.length);
    const out = [];
    for (let i = 0; i < n; i++) {
        const at = aTexts[i];
        const bt = bTexts[i];
        const before = at ? shapePlainText(at) : "";
        const after = bt ? shapePlainText(bt) : "";
        const textChanged = before !== after;
        const moved = at && bt ? bboxMoved(at, bt) : false;
        if (!textChanged && !moved)
            continue;
        out.push({
            shapeIndex: i + 1,
            shapeId: targetIds[i] ?? at?.id ?? bt?.id ?? `shape_${i}`,
            before,
            after,
            textChanged,
            bboxMoved: moved,
        });
    }
    return out;
}
export function compareDeckStructured(a, b) {
    const n = Math.max(a.slides.length, b.slides.length);
    const out = [];
    for (let i = 0; i < n; i++) {
        const slideA = a.slides[i];
        const slideB = b.slides[i];
        const before = slideTextLines(slideA);
        const after = slideTextLines(slideB);
        const textSame = before.join("\n") === after.join("\n");
        if (!slideA) {
            out.push({
                slideIdx: i,
                status: "added",
                before: [],
                after,
                structure: [],
                textShapes: [],
            });
            continue;
        }
        if (!slideB) {
            out.push({
                slideIdx: i,
                status: "removed",
                before,
                after: [],
                structure: [],
                textShapes: [],
            });
            continue;
        }
        const structure = compareSlideStructure(slideA, slideB);
        const textShapes = compareSlideTextShapes(slideA, slideB, listTextShapeIds(slideA));
        const structureSame = structure.length === 0 && textShapes.every((d) => !d.bboxMoved);
        const status = textSame && structureSame ? "same" : "changed";
        out.push({ slideIdx: i, status, before, after, structure, textShapes });
    }
    return out;
}
/** Back-compat alias used by compare dialog + editor. */
export function compareDeckTexts(a, b) {
    return compareDeckStructured(a, b);
}
/** Paragraph snapshots to apply from `other` slide (text-shape visit order). */
export function comparedSlideParagraphs(targetPres, slideIdx, other) {
    const slide = targetPres.slides[slideIdx];
    const otherSlide = other.slides[slideIdx];
    if (!slide || !otherSlide)
        return [];
    const targetIds = listTextShapeIds(slide);
    const otherHits = [];
    for (const layer of otherSlide.layers)
        walkTextShapes(layer.shapes, otherHits);
    const out = [];
    for (let i = 0; i < targetIds.length; i++) {
        const otherText = otherHits[i]?.text;
        if (!otherText)
            break;
        const shapeId = targetIds[i];
        const s = findShape(slide, shapeId);
        if (!s || s.kind !== "text")
            continue;
        const nextParas = JSON.parse(JSON.stringify(otherText.paragraphs));
        const plainBefore = s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
        const plainAfter = nextParas.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
        if (plainBefore !== plainAfter)
            out.push({ shapeId, paragraphs: nextParas });
    }
    return out;
}
