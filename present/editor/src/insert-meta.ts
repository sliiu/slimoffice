import type {
  AudioShape,
  Model3DShape,
  OleObjectShape,
  Presentation,
  Shape,
  Slide,
  SmartArtItem,
  SmartArtLayoutKind,
  VideoShape,
} from "@ppt/core";
import { extractSmartArtItems, mediaTrimBounds, serializeSmartArtItemsText } from "@ppt/core";
import { formatByteSize, isOleEmbedOverLimit, oleEmbedByteSize } from "./ole-cmd";
import { model3DDataUrlByteSize } from "./model3d-load";
import { formatRecordingDuration, RECORDING_LARGE_BYTES } from "./video-export";

export type InsertShapeKind = "ole" | "model3d" | "video" | "audio" | "smartart";

export interface InsertShapeRef {
  kind: InsertShapeKind;
  id: string;
  label: string;
}

export interface InsertShapeDeckRef extends InsertShapeRef {
  slideIndex: number;
}

export interface InsertShapeSizeRef extends InsertShapeRef {
  bytes: number;
}

/** Warn before inserting very large media onto a slide (bytes). */
export { RECORDING_LARGE_BYTES as MEDIA_LARGE_BYTES };

export function isLargeMediaBytes(bytes: number | null, limit = RECORDING_LARGE_BYTES): boolean {
  return bytes != null && bytes > limit;
}

/** Extract MIME type from a `data:...;base64,...` URL. */
export function parseDataUrlMime(dataUrl: string | undefined): string | null {
  if (!dataUrl?.startsWith("data:")) return null;
  const semi = dataUrl.indexOf(";");
  if (semi < 5) return null;
  return dataUrl.slice(5, semi).toLowerCase() || null;
}

const MIME_LABELS: Record<string, string> = {
  "video/webm": "WebM",
  "video/mp4": "MP4",
  "video/quicktime": "QuickTime",
  "audio/webm": "WebM Audio",
  "audio/mpeg": "MP3",
  "audio/mp4": "M4A",
  "audio/wav": "WAV",
  "audio/ogg": "OGG",
  "application/octet-stream": "Binary",
  "model/gltf-binary": "glTF Binary (GLB)",
  "model/gltf+json": "glTF JSON",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/gif": "GIF",
  "image/webp": "WebP",
};

/** Human-readable label for a data-URL MIME type. */
export function mediaMimeLabel(mime: string | null | undefined): string | null {
  if (!mime) return null;
  const key = mime.toLowerCase();
  if (MIME_LABELS[key]) return MIME_LABELS[key]!;
  if (key.startsWith("video/")) return `Video (${key.slice(6)})`;
  if (key.startsWith("audio/")) return `Audio (${key.slice(6)})`;
  if (key.startsWith("image/")) return `Image (${key.slice(6)})`;
  return mime;
}

export function formatMediaTrimSummary(
  trim: { start?: number; end?: number } | undefined,
  duration: number | undefined,
): string | null {
  if (!trim || (trim.start == null && trim.end == null)) return null;
  const { start, end } = mediaTrimBounds(trim, duration);
  if (end <= start) return null;
  return `${formatRecordingDuration(start)} – ${formatRecordingDuration(end)}`;
}

export function summarizeOleShape(shape: OleObjectShape): string[] {
  const lines: string[] = ["Embedded object"];
  if (shape.typeLabel) lines.push(`Type: ${shape.typeLabel}`);
  if (shape.progId) lines.push(`ProgID: ${shape.progId}`);
  if (shape.embedFileName) lines.push(`File: ${shape.embedFileName}`);
  if (shape.showAsIcon !== false) lines.push("Display: icon");
  const bytes = oleEmbedByteSize(shape.embedSrc);
  if (bytes != null) {
    const size = formatByteSize(bytes);
    lines.push(isOleEmbedOverLimit(bytes) ? `Size: ${size} (large)` : `Size: ${size}`);
  }
  const mime = mediaMimeLabel(parseDataUrlMime(shape.embedSrc));
  if (mime) lines.push(`MIME: ${mime}`);
  if (shape.previewSrc) lines.push("Preview: yes");
  return lines;
}

export function summarizeModel3DShape(shape: Model3DShape): string[] {
  const lines: string[] = ["3D model"];
  if (shape.objectName || shape.name) lines.push(`Name: ${shape.objectName ?? shape.name}`);
  const bytes = model3DDataUrlByteSize(shape.glbSrc);
  if (bytes != null) {
    const size = formatByteSize(bytes);
    lines.push(isLargeMediaBytes(bytes) ? `Size: ${size} (large)` : `Size: ${size}`);
  }
  const mime = mediaMimeLabel(parseDataUrlMime(shape.glbSrc));
  if (mime) lines.push(`MIME: ${mime}`);
  return lines;
}

export function summarizeMediaShape(shape: VideoShape | AudioShape): string[] {
  const kind = shape.kind === "video" ? "Video" : "Audio";
  const lines: string[] = [kind];
  if (shape.duration != null && Number.isFinite(shape.duration) && shape.duration > 0) {
    lines.push(`Duration: ${formatRecordingDuration(shape.duration)}`);
  }
  const trim = formatMediaTrimSummary(shape.trim, shape.duration);
  if (trim) lines.push(`Trim: ${trim}`);
  const bytes = oleEmbedByteSize(shape.src);
  if (bytes != null) {
    const size = formatByteSize(bytes);
    lines.push(isLargeMediaBytes(bytes) ? `Size: ${size} (large)` : `Size: ${size}`);
  }
  const mime = mediaMimeLabel(parseDataUrlMime(shape.src));
  if (mime) lines.push(`MIME: ${mime}`);
  if (shape.kind === "video") {
    if (shape.poster) lines.push("Poster: yes");
    if (shape.autoplay) lines.push("Autoplay: yes");
    if (shape.loop) lines.push("Loop: yes");
    if (shape.muted) lines.push("Muted: yes");
  } else {
    if (shape.autoplay) lines.push("Autoplay: yes");
    if (shape.loop) lines.push("Loop: yes");
  }
  return lines;
}

function walkSlideShapes(shapes: Shape[] | undefined, visit: (shape: Shape) => void): void {
  if (!shapes) return;
  for (const shape of shapes) {
    visit(shape);
    if (shape.kind === "group") walkSlideShapes(shape.children, visit);
  }
}

function insertRefForShape(shape: Shape): InsertShapeRef | null {
  if (shape.kind === "ole") {
    return {
      kind: "ole",
      id: shape.id,
      label: shape.embedFileName ?? shape.name ?? shape.id,
    };
  }
  if (shape.kind === "model3d") {
    return {
      kind: "model3d",
      id: shape.id,
      label: shape.objectName ?? shape.name ?? shape.id,
    };
  }
  if (shape.kind === "video" || shape.kind === "audio") {
    return {
      kind: shape.kind,
      id: shape.id,
      label: shape.name ?? shape.kind,
    };
  }
  if (shape.kind === "group" && shape.smartArtMeta) {
    const items = extractSmartArtItems(shape);
    const layout = shape.smartArtMeta.layout;
    return {
      kind: "smartart",
      id: shape.id,
      label: `Diagram (${layout}, ${items.length} items)`,
    };
  }
  return null;
}

export interface InsertShapeDeckSizeRef extends InsertShapeDeckRef {
  bytes: number;
}

/** Byte size for OLE / 3D / video / audio payloads (null when unknown). */
export function insertShapeByteSize(shape: Shape): number | null {
  if (shape.kind === "ole") return oleEmbedByteSize(shape.embedSrc);
  if (shape.kind === "model3d") return model3DDataUrlByteSize(shape.glbSrc);
  if (shape.kind === "video" || shape.kind === "audio") return oleEmbedByteSize(shape.src);
  return null;
}

/** Whether an insert shape exceeds OLE or media size limits. */
export function isLargeInsertShape(shape: Shape): boolean {
  const bytes = insertShapeByteSize(shape);
  if (bytes == null) return false;
  if (shape.kind === "ole") return isOleEmbedOverLimit(bytes);
  if (shape.kind === "model3d" || shape.kind === "video" || shape.kind === "audio") {
    return isLargeMediaBytes(bytes);
  }
  return false;
}

function forEachInsertShapeOnSlide(
  slide: Slide,
  visit: (shape: Shape, ref: InsertShapeRef) => void,
): void {
  for (const layer of slide.layers) {
    walkSlideShapes(layer.shapes, (shape) => {
      const ref = insertRefForShape(shape);
      if (ref) visit(shape, ref);
    });
  }
}

/** OLE / 3D / media / SmartArt shapes on one slide (top-level walk, includes nested groups). */
export function collectInsertShapesOnSlide(slide: Slide): InsertShapeRef[] {
  const out: InsertShapeRef[] = [];
  forEachInsertShapeOnSlide(slide, (_shape, ref) => {
    out.push(ref);
  });
  return out;
}

/** Large OLE / 3D / media shapes on one slide. */
export function collectLargeInsertShapesOnSlide(slide: Slide): InsertShapeSizeRef[] {
  const out: InsertShapeSizeRef[] = [];
  forEachInsertShapeOnSlide(slide, (shape, ref) => {
    const bytes = insertShapeByteSize(shape);
    if (bytes != null && isLargeInsertShape(shape)) {
      out.push({ ...ref, bytes });
    }
  });
  return out;
}

/** Count insert shapes by kind. */
export function summarizeInsertKinds(
  refs: readonly InsertShapeRef[],
): Partial<Record<InsertShapeKind, number>> {
  const out: Partial<Record<InsertShapeKind, number>> = {};
  for (const ref of refs) {
    out[ref.kind] = (out[ref.kind] ?? 0) + 1;
  }
  return out;
}

/** One-line insert inventory stats (e.g. `3 shape(s): ole×1, video×2`). */
export function formatInsertInventoryStatsLine(refs: readonly InsertShapeRef[]): string {
  if (!refs.length) return "No insert shapes";
  const kinds = summarizeInsertKinds(refs);
  const parts = Object.entries(kinds).map(([kind, count]) => `${kind}×${count}`);
  return `${refs.length} shape(s): ${parts.join(", ")}`;
}

/** All insert-type shapes across a deck. */
export function collectInsertShapesInDeck(pres: Presentation): InsertShapeDeckRef[] {
  const out: InsertShapeDeckRef[] = [];
  pres.slides.forEach((slide, slideIndex) => {
    for (const ref of collectInsertShapesOnSlide(slide)) {
      out.push({ ...ref, slideIndex });
    }
  });
  return out;
}

/** Locate an insert shape anywhere in the deck. */
export function findInsertShapeInDeck(
  pres: Presentation,
  shapeId: string,
): InsertShapeDeckRef | null {
  for (const ref of collectInsertShapesInDeck(pres)) {
    if (ref.id === shapeId) return ref;
  }
  return null;
}

/** Slide index with the most insert-type shapes (ties → lowest index). */
export function slideWithMostInsertShapes(pres: Presentation): number | null {
  let bestIdx: number | null = null;
  let bestCount = 0;
  pres.slides.forEach((slide, slideIndex) => {
    const count = collectInsertShapesOnSlide(slide).length;
    if (count > bestCount || (count === bestCount && count > 0 && (bestIdx == null || slideIndex < bestIdx))) {
      bestIdx = slideIndex;
      bestCount = count;
    }
  });
  return bestCount > 0 ? bestIdx : null;
}

/** Large insert shapes across the deck (with slide index). */
export function collectLargeInsertShapesInDeck(pres: Presentation): InsertShapeDeckSizeRef[] {
  const out: InsertShapeDeckSizeRef[] = [];
  pres.slides.forEach((slide, slideIndex) => {
    for (const item of collectLargeInsertShapesOnSlide(slide)) {
      out.push({ ...item, slideIndex });
    }
  });
  return out;
}

export function countLargeInsertShapesInDeck(pres: Presentation): number {
  return collectLargeInsertShapesInDeck(pres).length;
}

/** Sum known payload bytes for OLE / 3D / media shapes in the deck. */
export function totalInsertPayloadBytes(pres: Presentation): number {
  let total = 0;
  pres.slides.forEach((slide) => {
    forEachInsertShapeOnSlide(slide, (shape) => {
      const bytes = insertShapeByteSize(shape);
      if (bytes != null) total += bytes;
    });
  });
  return total;
}

/** Slide index with the most large insert shapes (ties → lowest index). */
export function slideWithMostLargeInsertShapes(pres: Presentation): number | null {
  let bestIdx: number | null = null;
  let bestCount = 0;
  pres.slides.forEach((slide, slideIndex) => {
    const count = collectLargeInsertShapesOnSlide(slide).length;
    if (count > bestCount || (count === bestCount && count > 0 && (bestIdx == null || slideIndex < bestIdx))) {
      bestIdx = slideIndex;
      bestCount = count;
    }
  });
  return bestCount > 0 ? bestIdx : null;
}

export function filterInsertRefsByKind(
  refs: readonly InsertShapeDeckRef[],
  kind: InsertShapeKind | "all",
): InsertShapeDeckRef[] {
  if (kind === "all") return [...refs];
  return refs.filter((ref) => ref.kind === kind);
}

/** Share of insert shapes with a measurable payload (0–100). */
export function insertPayloadCoveragePercent(pres: Presentation): number {
  const refs = collectInsertShapesInDeck(pres);
  if (!refs.length) return 100;
  let measurable = 0;
  pres.slides.forEach((slide) => {
    forEachInsertShapeOnSlide(slide, (shape) => {
      if (insertShapeByteSize(shape) != null) measurable++;
    });
  });
  return Math.round((measurable / refs.length) * 100);
}

/** Sum payload bytes for large insert shapes only. */
export function largeInsertPayloadBytes(pres: Presentation): number {
  return collectLargeInsertShapesInDeck(pres).reduce((sum, item) => sum + item.bytes, 0);
}

/** Slide index with the highest total insert payload (ties → lowest index). */
export function slideWithLargestInsertPayload(pres: Presentation): number | null {
  let bestIdx: number | null = null;
  let bestBytes = 0;
  pres.slides.forEach((slide, slideIndex) => {
    let slideBytes = 0;
    forEachInsertShapeOnSlide(slide, (shape) => {
      const bytes = insertShapeByteSize(shape);
      if (bytes != null) slideBytes += bytes;
    });
    if (
      slideBytes > bestBytes ||
      (slideBytes === bestBytes && slideBytes > 0 && (bestIdx == null || slideIndex < bestIdx))
    ) {
      bestIdx = slideIndex;
      bestBytes = slideBytes;
    }
  });
  return bestBytes > 0 ? bestIdx : null;
}

/** One-line kind breakdown for the whole deck (e.g. `ole×1, video×2`). */
export function formatInsertKindBreakdownLine(pres: Presentation): string {
  const refs = collectInsertShapesInDeck(pres);
  if (!refs.length) return "none";
  const kinds = summarizeInsertKinds(refs);
  return Object.entries(kinds)
    .map(([kind, count]) => `${kind}×${count}`)
    .join(", ");
}

/** One-line insert readiness for status chips. */
export function formatInsertReadinessLine(pres: Presentation): string {
  const refs = collectInsertShapesInDeck(pres);
  if (!refs.length) return "Insert: none";
  const parts = ["Insert ready", formatInsertInventoryStatsLine(refs)];
  const large = countLargeInsertShapesInDeck(pres);
  if (large) parts.push(`${large} large`);
  const bytes = totalInsertPayloadBytes(pres);
  if (bytes > 0) parts.push(formatByteSize(bytes));
  parts.push(`${insertPayloadCoveragePercent(pres)}% sized`);
  return parts.join(" · ");
}

/** Labeled readiness export for copy. */
export function exportInsertReadinessText(pres: Presentation): string {
  return [
    "Insert readiness",
    formatInsertReadinessLine(pres),
    formatInsertDeckStatsLine(pres),
    formatInsertSlideCoverageBreakdownLine(pres),
  ].join("\n");
}

/** Average payload bytes per insert shape with measurable size (0 if none). */
export function averageInsertPayloadBytesPerShape(pres: Presentation): number {
  let measurable = 0;
  let total = 0;
  pres.slides.forEach((slide) => {
    forEachInsertShapeOnSlide(slide, (shape) => {
      const bytes = insertShapeByteSize(shape);
      if (bytes != null) {
        measurable++;
        total += bytes;
      }
    });
  });
  if (!measurable) return 0;
  return Math.round((total / measurable) * 10) / 10;
}

/** Slide indices with no insert-type shapes. */
export function slidesWithoutInsertShapes(pres: Presentation): number[] {
  const out: number[] = [];
  pres.slides.forEach((slide, slideIndex) => {
    if (!collectInsertShapesOnSlide(slide).length) out.push(slideIndex);
  });
  return out;
}

/** Count of slides with at least one insert shape. */
export function countSlidesWithInsertShapes(pres: Presentation): number {
  return pres.slides.length - slidesWithoutInsertShapes(pres).length;
}

/** Count of slides with no insert shapes. */
export function countSlidesWithoutInsertShapes(pres: Presentation): number {
  return slidesWithoutInsertShapes(pres).length;
}

/** First slide index with no insert shapes (lowest index). */
export function slideWithFirstWithoutInsertShapes(pres: Presentation): number | null {
  return slidesWithoutInsertShapes(pres)[0] ?? null;
}

/** Slide index with the fewest insert shapes among non-empty slides (ties → lowest). */
export function slideWithFewestInsertShapes(pres: Presentation): number | null {
  let bestIdx: number | null = null;
  let bestCount = Infinity;
  pres.slides.forEach((slide, slideIndex) => {
    const count = collectInsertShapesOnSlide(slide).length;
    if (count > 0 && (count < bestCount || (count === bestCount && (bestIdx == null || slideIndex < bestIdx)))) {
      bestIdx = slideIndex;
      bestCount = count;
    }
  });
  return bestIdx;
}

/** One-line slide coverage breakdown (occupied / empty / avg bytes). */
export function formatInsertSlideCoverageBreakdownLine(pres: Presentation): string {
  const withShapes = countSlidesWithInsertShapes(pres);
  const empty = countSlidesWithoutInsertShapes(pres);
  const parts = [`${withShapes} slide(s) with inserts`, `${empty} empty`];
  const avg = averageInsertPayloadBytesPerShape(pres);
  if (avg > 0) parts.push(`avg ${formatByteSize(avg)}`);
  return parts.join(" · ");
}

/** Largest single insert shape in the deck (by payload bytes). */
export function insertShapeWithLargestPayload(pres: Presentation): InsertShapeDeckSizeRef | null {
  let best: InsertShapeDeckSizeRef | null = null;
  pres.slides.forEach((slide, slideIndex) => {
    forEachInsertShapeOnSlide(slide, (shape, ref) => {
      const bytes = insertShapeByteSize(shape);
      if (bytes == null) return;
      if (
        !best ||
        bytes > best.bytes ||
        (bytes === best.bytes && slideIndex < best.slideIndex)
      ) {
        best = { ...ref, slideIndex, bytes };
      }
    });
  });
  return best;
}

/** One-line largest insert shape summary. */
export function formatInsertLargestShapeLine(pres: Presentation): string {
  const largest = insertShapeWithLargestPayload(pres);
  if (!largest) return "Largest: none";
  return `Largest: slide ${largest.slideIndex + 1} · ${largest.kind} ${largest.label} · ${formatByteSize(largest.bytes)}`;
}

/** Insert shapes with unknown payload size. */
export function collectUnsizedInsertShapesInDeck(pres: Presentation): InsertShapeDeckRef[] {
  const out: InsertShapeDeckRef[] = [];
  pres.slides.forEach((slide, slideIndex) => {
    forEachInsertShapeOnSlide(slide, (shape, ref) => {
      if (insertShapeByteSize(shape) == null) {
        out.push({ ...ref, slideIndex });
      }
    });
  });
  return out;
}

/** Plain-text report of insert shapes without measurable payload. */
export function exportInsertUnsizedShapesText(pres: Presentation): string {
  const refs = collectUnsizedInsertShapesInDeck(pres);
  const lines = ["Insert unsized shapes", `Count: ${refs.length}`];
  if (!refs.length) {
    lines.push("All insert shapes have measurable payloads.");
    return lines.join("\n");
  }
  lines.push("");
  for (const ref of refs) {
    lines.push(`- Slide ${ref.slideIndex + 1}: ${ref.kind}: ${ref.label} (${ref.id})`);
  }
  return lines.join("\n");
}

/** Labeled slide coverage export for copy. */
export function exportInsertSlideCoverageText(pres: Presentation): string {
  return [
    "Insert slide coverage",
    formatInsertSlideCoverageBreakdownLine(pres),
    `${insertPayloadCoveragePercent(pres)}% sized`,
    formatInsertLargestShapeLine(pres),
  ].join("\n");
}

/** Labeled largest-shape export for copy. */
export function exportInsertLargestShapeText(pres: Presentation): string {
  const largest = insertShapeWithLargestPayload(pres);
  const lines = ["Insert largest shape", formatInsertLargestShapeLine(pres)];
  if (largest) lines.push(`ID: ${largest.id}`);
  return lines.join("\n");
}

/** Plain-text deck inventory filtered by kind. */
export function exportDeckInsertByKindText(
  pres: Presentation,
  kind: InsertShapeKind | "all",
): string {
  if (kind === "all") return exportDeckInsertInventoryText(pres);
  const refs = filterInsertRefsByKind(collectInsertShapesInDeck(pres), kind);
  const lines = [
    `Deck insert inventory (${kind})`,
    `Slides: ${pres.slides.length}`,
    `Count: ${refs.length}`,
  ];
  if (refs.length) lines.push(formatInsertInventoryStatsLine(refs));
  if (!refs.length) {
    lines.push(`No ${kind} insert shapes.`);
    return lines.join("\n");
  }
  lines.push("");
  for (const ref of refs) {
    lines.push(`- Slide ${ref.slideIndex + 1}: ${ref.label} (${ref.id})`);
  }
  return lines.join("\n");
}

/** Compact deck inventory filtered by kind. */
export function exportDeckInsertByKindCompactText(
  pres: Presentation,
  kind: InsertShapeKind | "all",
): string {
  if (kind === "all") return exportDeckInsertCompactText(pres);
  const refs = filterInsertRefsByKind(collectInsertShapesInDeck(pres), kind);
  const largeIds = new Set(collectLargeInsertShapesInDeck(pres).map((item) => item.id));
  const large = refs.filter((ref) => largeIds.has(ref.id)).length;
  const parts = [
    `Deck insert (${kind}, compact)`,
    `${pres.slides.length} slide(s)`,
    formatInsertInventoryStatsLine(refs),
  ];
  if (large) parts.push(`${large} large`);
  const bytes = refs.reduce((sum, ref) => {
    const slide = pres.slides[ref.slideIndex];
    if (!slide) return sum;
    let found: number | null = null;
    forEachInsertShapeOnSlide(slide, (shape, shapeRef) => {
      if (shapeRef.id === ref.id) found = insertShapeByteSize(shape);
    });
    return sum + (found ?? 0);
  }, 0);
  if (bytes > 0) parts.push(formatByteSize(bytes));
  return parts.join(" · ");
}

/** One-line deck insert stats for chips and compact copy. */
export function formatInsertDeckStatsLine(pres: Presentation): string {
  const refs = collectInsertShapesInDeck(pres);
  if (!refs.length) return "No insert shapes";
  const parts: string[] = [formatInsertInventoryStatsLine(refs)];
  const large = countLargeInsertShapesInDeck(pres);
  if (large) parts.push(`${large} large`);
  const bytes = totalInsertPayloadBytes(pres);
  if (bytes > 0) parts.push(formatByteSize(bytes));
  const busiest = slideWithMostInsertShapes(pres);
  if (busiest != null) parts.push(`busiest slide ${busiest + 1}`);
  return parts.join(" · ");
}

/** Plain-text inventory of insert-type shapes on a slide. */
export function exportSlideInsertInventoryText(slide: Slide, slideIndex?: number): string {
  const refs = collectInsertShapesOnSlide(slide);
  const large = collectLargeInsertShapesOnSlide(slide);
  const lines: string[] = ["Slide insert inventory"];
  if (slideIndex != null && slideIndex >= 0) lines.push(`Slide: ${slideIndex + 1}`);
  lines.push(`Count: ${refs.length}`);
  if (refs.length) lines.push(formatInsertInventoryStatsLine(refs));
  if (large.length) lines.push(`Large: ${large.length}`);
  if (!refs.length) {
    lines.push("No embedded / 3D / media / diagram shapes.");
    return lines.join("\n");
  }
  lines.push("");
  for (const ref of refs) {
    const mark = large.some((item) => item.id === ref.id) ? " [large]" : "";
    lines.push(`- ${ref.kind}: ${ref.label} (${ref.id})${mark}`);
  }
  return lines.join("\n");
}

/** Plain-text inventory of insert-type shapes across the whole deck. */
export function exportDeckInsertInventoryText(pres: Presentation): string {
  const refs = collectInsertShapesInDeck(pres);
  const lines: string[] = [
    "Deck insert inventory",
    `Slides: ${pres.slides.length}`,
    `Count: ${refs.length}`,
  ];
  if (refs.length) lines.push(formatInsertInventoryStatsLine(refs));
  const busiest = slideWithMostInsertShapes(pres);
  if (busiest != null) lines.push(`Busiest slide: ${busiest + 1}`);
  if (!refs.length) {
    lines.push("No embedded / 3D / media / diagram shapes.");
    return lines.join("\n");
  }
  lines.push("");
  for (const ref of refs) {
    lines.push(`- Slide ${ref.slideIndex + 1}: ${ref.kind}: ${ref.label} (${ref.id})`);
  }
  return lines.join("\n");
}

/** Plain-text report of large OLE / 3D / media shapes in the deck. */
export function exportLargeInsertReportText(pres: Presentation): string {
  const lines: string[] = ["Large insert shapes report"];
  let total = 0;
  pres.slides.forEach((slide, slideIndex) => {
    for (const item of collectLargeInsertShapesOnSlide(slide)) {
      total += 1;
      lines.push(
        `- Slide ${slideIndex + 1}: ${item.kind} ${item.label} — ${formatByteSize(item.bytes)} (${item.id})`,
      );
    }
  });
  lines.splice(1, 0, `Count: ${total}`);
  if (total === 0) lines.push("No large embedded / 3D / media shapes.");
  return lines.join("\n");
}

/** Compact slide insert summary (one-liners). */
export function exportSlideInsertCompactText(slide: Slide, slideIndex?: number): string {
  const refs = collectInsertShapesOnSlide(slide);
  const parts: string[] = ["Slide insert (compact)"];
  if (slideIndex != null && slideIndex >= 0) parts.push(`slide ${slideIndex + 1}`);
  parts.push(formatInsertInventoryStatsLine(refs));
  const large = collectLargeInsertShapesOnSlide(slide).length;
  if (large) parts.push(`${large} large`);
  return parts.join(" · ");
}

/** Compact deck insert summary (one-liners). */
export function exportDeckInsertCompactText(pres: Presentation): string {
  const refs = collectInsertShapesInDeck(pres);
  const parts: string[] = [
    "Deck insert (compact)",
    `${pres.slides.length} slide(s)`,
    formatInsertInventoryStatsLine(refs),
  ];
  const large = countLargeInsertShapesInDeck(pres);
  if (large) parts.push(`${large} large`);
  const bytes = totalInsertPayloadBytes(pres);
  if (bytes > 0) parts.push(formatByteSize(bytes));
  const busiest = slideWithMostInsertShapes(pres);
  if (busiest != null) parts.push(`busiest slide ${busiest + 1}`);
  return parts.join(" · ");
}

/** Compact large-insert report (comma-separated slide:kind labels). */
export function exportLargeInsertCompactText(pres: Presentation): string {
  const items = collectLargeInsertShapesInDeck(pres);
  if (!items.length) return "Large insert shapes: none";
  const labels = items.map((item) => `S${item.slideIndex + 1}:${item.kind}`);
  return `Large insert shapes (${items.length}): ${labels.join(", ")}`;
}

/** One-line compact summary for a single insert shape. */
export function exportInsertShapeCompactText(shape: Shape): string | null {
  if (shape.kind === "ole") {
    const bytes = oleEmbedByteSize(shape.embedSrc);
    const size = bytes != null ? ` · ${formatByteSize(bytes)}` : "";
    const large = bytes != null && isOleEmbedOverLimit(bytes) ? " · large" : "";
    return `Embedded ${shape.embedFileName ?? shape.id}${size}${large}`;
  }
  if (shape.kind === "model3d") {
    const bytes = model3DDataUrlByteSize(shape.glbSrc);
    const size = bytes != null ? ` · ${formatByteSize(bytes)}` : "";
    const large = bytes != null && isLargeMediaBytes(bytes) ? " · large" : "";
    return `3D ${shape.objectName ?? shape.name ?? shape.id}${size}${large}`;
  }
  if (shape.kind === "video" || shape.kind === "audio") {
    const bytes = oleEmbedByteSize(shape.src);
    const mime = mediaMimeLabel(parseDataUrlMime(shape.src));
    const size = bytes != null ? ` · ${formatByteSize(bytes)}` : "";
    const large = bytes != null && isLargeMediaBytes(bytes) ? " · large" : "";
    const kind = shape.kind === "video" ? "Video" : "Audio";
    return `${kind} ${shape.name ?? shape.id}${mime ? ` · ${mime}` : ""}${size}${large}`;
  }
  if (shape.kind === "group" && shape.smartArtMeta) {
    const items = extractSmartArtItems(shape);
    const pics = smartArtPictureCount(items);
    const picHint = pics ? ` · ${pics} picture(s)` : "";
    return `Diagram ${shape.smartArtMeta.layout} · ${items.length} item(s)${picHint}`;
  }
  return null;
}

export function smartArtPictureCount(items: readonly SmartArtItem[]): number {
  return items.filter((item) => Boolean(item.imageSrc?.trim())).length;
}

export function clearSmartArtItemPictures(items: SmartArtItem[]): SmartArtItem[] {
  return items.map((item) => {
    if (!item.imageSrc) return item;
    const next = { ...item };
    delete next.imageSrc;
    return next;
  });
}

export function summarizeSmartArtGroup(
  group: Shape & { kind: "group"; smartArtMeta?: { layout: SmartArtLayoutKind } },
): string[] {
  const layout = group.smartArtMeta?.layout ?? "list";
  const items = extractSmartArtItems(group);
  const lines = [`Diagram (${layout})`, `${items.length} item(s)`];
  const pictures = smartArtPictureCount(items);
  if (pictures) lines.push(`${pictures} picture(s)`);
  const maxLevel = items.reduce((max, item) => Math.max(max, item.lvl ?? 0), 0);
  if (maxLevel > 0) lines.push(`Max level: ${maxLevel}`);
  return lines;
}

/** Whether UI should confirm before applying a large insert/replace. */
export function shouldConfirmLargeInsertBytes(
  bytes: number | null,
  kind: "ole" | "media" | "model3d",
): boolean {
  if (bytes == null) return false;
  if (kind === "ole") return isOleEmbedOverLimit(bytes);
  return isLargeMediaBytes(bytes);
}

/** Plain-text summary for OLE / 3D / media shapes (copy / export). */
export function exportInsertShapeSummary(shape: Shape): string | null {
  if (shape.kind === "ole") return summarizeOleShape(shape).join("\n");
  if (shape.kind === "model3d") return summarizeModel3DShape(shape).join("\n");
  if (shape.kind === "video" || shape.kind === "audio") return summarizeMediaShape(shape).join("\n");
  if (shape.kind === "group" && shape.smartArtMeta) {
    const lines = summarizeSmartArtGroup(shape);
    const body = serializeSmartArtItemsText(extractSmartArtItems(shape));
    if (body.trim()) lines.push("", body);
    return lines.join("\n");
  }
  return null;
}

/** Filter SmartArt layout kinds by case-insensitive query (kind id or label). */
export function filterSmartArtLayouts(
  query: string,
  layouts: readonly SmartArtLayoutKind[],
  getLabel: (layout: SmartArtLayoutKind) => string,
): SmartArtLayoutKind[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...layouts];
  return layouts.filter((layout) => {
    if (layout.toLowerCase().includes(q)) return true;
    return getLabel(layout).toLowerCase().includes(q);
  });
}

/** Duplicate a SmartArt item at `index`, inserting the copy immediately after. */
export function duplicateSmartArtItemAt(items: SmartArtItem[], index: number): SmartArtItem[] {
  if (index < 0 || index >= items.length) return items;
  const src = items[index]!;
  const copy: SmartArtItem = {
    id: `item_dup_${Date.now()}_${index}`,
    text: src.text ? `${src.text} (copy)` : "Copy",
    lvl: src.lvl,
    imageSrc: src.imageSrc,
  };
  const next = [...items];
  next.splice(index + 1, 0, copy);
  return next;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
