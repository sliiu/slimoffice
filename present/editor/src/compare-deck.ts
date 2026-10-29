import type {
  Paint,
  Presentation,
  Shape,
  Slide,
  SlideLayoutRef,
  SlideTransition,
  TextParagraph,
  TextShape,
} from "@ppt/core";
import { getPresentationProtection } from "@ppt/core";
import type { ooxml } from "@ppt/animation";
import { findShape } from "./selection";
import { listTextShapeIds, shapePlainText, slideTextLines, walkTextShapes } from "./proofing-text";

type OoxmlTiming = ooxml.OoxmlTiming;
type TimeNode = ooxml.TimeNode;

export type StructureDiffKind =
  | "layout"
  | "transition"
  | "animation"
  | "build"
  | "shapeInventory"
  | "notes"
  | "background"
  | "hidden";

export interface StructureDiffItem {
  kind: StructureDiffKind;
  before?: string;
  after?: string;
}

export interface TextShapeDiff {
  shapeIndex: number;
  shapeId: string;
  before: string;
  after: string;
  textChanged: boolean;
  bboxMoved: boolean;
}

export interface SlideCompareEntry {
  slideIdx: number;
  status: "same" | "changed" | "added" | "removed";
  before: string[];
  after: string[];
  structure: StructureDiffItem[];
  textShapes: TextShapeDiff[];
}

export interface DeckMetaDiff {
  kind: "protection";
  before: string;
  after: string;
}

function protectionSummary(pres: Presentation): string {
  const p = getPresentationProtection(pres);
  if (!p) return "none";
  if (p.kind === "final") return "final";
  return p.passwordHash ? "restricted (password)" : "restricted";
}

/** Deck-level metadata diff (protection, etc.). */
export function comparePresentationMeta(a: Presentation, b: Presentation): DeckMetaDiff[] {
  const out: DeckMetaDiff[] = [];
  const pa = protectionSummary(a);
  const pb = protectionSummary(b);
  if (pa !== pb) out.push({ kind: "protection", before: pa, after: pb });
  return out;
}

export interface CompareSummary {
  changed: number;
  added: number;
  removed: number;
  withTextPatches: number;
  withStructure: number;
}

export function slideEntryHasTextPatches(e: SlideCompareEntry): boolean {
  return (e.textShapes ?? []).some((d) => d.textChanged);
}

export function slideEntryHasStructureDiff(e: SlideCompareEntry): boolean {
  return (
    (e.structure?.length ?? 0) > 0 || (e.textShapes ?? []).some((d) => d.bboxMoved)
  );
}

/** Aggregate diff counts for compare dialog summary / filters. */
export function summarizeCompareEntries(entries: SlideCompareEntry[]): CompareSummary {
  let changed = 0;
  let added = 0;
  let removed = 0;
  let withTextPatches = 0;
  let withStructure = 0;
  for (const e of entries) {
    if (e.status === "changed") changed++;
    else if (e.status === "added") added++;
    else if (e.status === "removed") removed++;
    if (slideEntryHasTextPatches(e)) withTextPatches++;
    if (slideEntryHasStructureDiff(e)) withStructure++;
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

function paintSummary(paint?: Paint): string {
  if (!paint || paint.kind === "none") return "none";
  if (paint.kind === "solid") return `solid ${paint.color}`;
  if (paint.kind === "image") return "image";
  if (paint.kind === "linear") return "linear gradient";
  if (paint.kind === "radial") return "radial gradient";
  if (paint.kind === "pattern") return "pattern";
  return paint.kind;
}

function layoutSummary(ref?: SlideLayoutRef): string {
  if (!ref) return "default";
  return `${ref.masterId}/${ref.layoutId}`;
}

function transitionSummary(tr?: SlideTransition): string {
  if (!tr) return "none";
  const dur = Number.isFinite(tr.duration) ? `${tr.duration}s` : "?";
  return `${tr.kind} (${dur})`;
}

function countBehaviorNodes(nodes: readonly TimeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (BEHAVIOR_KINDS.has(node.kind)) count += 1;
    if (node.kind === "par" || node.kind === "seq" || node.kind === "excl") {
      count += countBehaviorNodes(node.ctn.childTnLst ?? []);
    }
  }
  return count;
}

function animationSummary(slide?: Slide): string {
  const timing: OoxmlTiming | undefined = slide?.ooxmlTiming;
  if (!timing?.tnLst?.length) return "0 effects";
  const effects = countBehaviorNodes(timing.tnLst);
  const builds = timing.bldLst?.length ?? slide?.builds?.length ?? 0;
  return `${effects} effects, ${builds} builds`;
}

function shapeInventory(slide?: Slide): string {
  if (!slide) return "0";
  const counts = new Map<string, number>();
  const walk = (shapes: Shape[]): void => {
    for (const s of shapes) {
      counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
      if (s.kind === "group") walk(s.children);
    }
  };
  for (const layer of slide.layers) {
    if (!layer.visible) continue;
    walk(layer.shapes);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}×${n}`)
    .join(", ");
}

function pushIfChanged(
  out: StructureDiffItem[],
  kind: StructureDiffKind,
  before: string,
  after: string,
): void {
  if (before === after) return;
  out.push({ kind, before, after });
}

export function compareSlideStructure(a?: Slide, b?: Slide): StructureDiffItem[] {
  const out: StructureDiffItem[] = [];
  if (!a || !b) return out;
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

function listTextShapes(slide: Slide): TextShape[] {
  const hits: Array<{ shapeId: string; text: TextShape }> = [];
  for (const layer of slide.layers) {
    if (!layer.visible) continue;
    walkTextShapes(layer.shapes, hits);
  }
  return hits.map((h) => h.text);
}

const BBOX_MOVE_TOL = 8;

function bboxMoved(a: TextShape, b: TextShape): boolean {
  return (
    Math.abs(a.bbox.x - b.bbox.x) > BBOX_MOVE_TOL ||
    Math.abs(a.bbox.y - b.bbox.y) > BBOX_MOVE_TOL ||
    Math.abs(a.bbox.w - b.bbox.w) > BBOX_MOVE_TOL ||
    Math.abs(a.bbox.h - b.bbox.h) > BBOX_MOVE_TOL
  );
}

export function compareSlideTextShapes(a: Slide, b: Slide, targetIds: string[]): TextShapeDiff[] {
  const aTexts = listTextShapes(a);
  const bTexts = listTextShapes(b);
  const n = Math.max(aTexts.length, bTexts.length);
  const out: TextShapeDiff[] = [];
  for (let i = 0; i < n; i++) {
    const at = aTexts[i];
    const bt = bTexts[i];
    const before = at ? shapePlainText(at) : "";
    const after = bt ? shapePlainText(bt) : "";
    const textChanged = before !== after;
    const moved = at && bt ? bboxMoved(at, bt) : false;
    if (!textChanged && !moved) continue;
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

export function compareDeckStructured(a: Presentation, b: Presentation): SlideCompareEntry[] {
  const n = Math.max(a.slides.length, b.slides.length);
  const out: SlideCompareEntry[] = [];
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
export function compareDeckTexts(a: Presentation, b: Presentation): SlideCompareEntry[] {
  return compareDeckStructured(a, b);
}

/** Paragraph snapshots to apply from `other` slide (text-shape visit order). */
export function comparedSlideParagraphs(
  targetPres: Presentation,
  slideIdx: number,
  other: Presentation,
): Array<{ shapeId: string; paragraphs: TextParagraph[] }> {
  const slide = targetPres.slides[slideIdx];
  const otherSlide = other.slides[slideIdx];
  if (!slide || !otherSlide) return [];

  const targetIds = listTextShapeIds(slide);
  const otherHits: Array<{ shapeId: string; text: TextShape }> = [];
  for (const layer of otherSlide.layers) walkTextShapes(layer.shapes, otherHits);

  const out: Array<{ shapeId: string; paragraphs: TextParagraph[] }> = [];
  for (let i = 0; i < targetIds.length; i++) {
    const otherText = otherHits[i]?.text;
    if (!otherText) break;
    const shapeId = targetIds[i]!;
    const s = findShape(slide, shapeId);
    if (!s || s.kind !== "text") continue;
    const nextParas = JSON.parse(JSON.stringify(otherText.paragraphs)) as TextParagraph[];
    const plainBefore = s.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
    const plainAfter = nextParas.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
    if (plainBefore !== plainAfter) out.push({ shapeId, paragraphs: nextParas });
  }
  return out;
}
