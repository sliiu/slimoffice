import type { Presentation, Shape, Slide, TextParagraph, TextShape } from "@ppt/core";

export function paragraphPlain(p: TextParagraph): string {
  return p.runs.map((r) => r.text).join("");
}

export function shapePlainText(shape: TextShape): string {
  return shape.paragraphs.map(paragraphPlain).join("\n");
}

export function walkTextShapes(shapes: Shape[], out: Array<{ shapeId: string; text: TextShape }>): void {
  for (const s of shapes) {
    if (s.kind === "text") {
      out.push({ shapeId: s.id, text: s });
      continue;
    }
    if (s.kind !== "group") continue;
    for (const c of s.children) {
      if (c.kind === "text" && !c.cellMeta?.hidden) {
        out.push({ shapeId: c.id, text: c });
      } else if (c.kind === "group") {
        walkTextShapes([c], out);
      }
    }
  }
}

export function slideTextLines(slide: Slide | undefined): string[] {
  if (!slide) return [];
  const hits: Array<{ shapeId: string; text: TextShape }> = [];
  for (const layer of slide.layers) {
    if (!layer.visible) continue;
    walkTextShapes(layer.shapes, hits);
  }
  const lines: string[] = [];
  for (const h of hits) {
    for (const p of h.text.paragraphs) {
      const t = paragraphPlain(p).trim();
      if (t) lines.push(t);
    }
  }
  return lines;
}

export function firstWord(text: string): string {
  const m = text.match(/[\p{L}\p{N}']+/u);
  return m?.[0] ?? text.trim().split(/\s+/)[0] ?? "";
}

export interface ProofingSelection {
  slideIdx: number;
  shapeId: string;
  word: string;
  fullText: string;
}

export function proofingSelectionFromShape(
  slideIdx: number,
  shapeId: string,
  shape: Shape | undefined,
): ProofingSelection | null {
  if (!shape) return null;
  const text =
    shape.kind === "text"
      ? shape
      : shape.kind === "group"
        ? shape.children.find((c): c is TextShape => c.kind === "text" && !c.cellMeta?.hidden)
        : undefined;
  if (!text) return null;
  const fullText = shapePlainText(text);
  const word = firstWord(fullText);
  if (!word) return null;
  return { slideIdx, shapeId, word, fullText };
}

export function replaceFirstWordInParagraphs(
  paragraphs: TextParagraph[],
  fromWord: string,
  toWord: string,
): TextParagraph[] | null {
  if (!fromWord) return null;
  const re = new RegExp(`\\b${escapeRegex(fromWord)}\\b`, "iu");
  let changed = false;
  const next = paragraphs.map((p) => {
    const plain = paragraphPlain(p);
    if (!re.test(plain)) return p;
    changed = true;
    const replaced = plain.replace(re, toWord);
    if (p.runs.length === 1) {
      return { ...p, runs: [{ ...p.runs[0]!, text: replaced }] };
    }
    return { ...p, runs: [{ ...p.runs[0]!, text: replaced }, ...p.runs.slice(1).map((r) => ({ ...r, text: "" }))] };
  });
  return changed ? next : null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


export function listTextShapeIds(slide: Slide): string[] {
  const hits: Array<{ shapeId: string; text: TextShape }> = [];
  for (const layer of slide.layers) {
    if (!layer.visible) continue;
    walkTextShapes(layer.shapes, hits);
  }
  return hits.map((h) => h.shapeId);
}
