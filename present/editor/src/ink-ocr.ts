import type { PathShape, Rect } from "@ppt/core";
import { samplePath } from "@ppt/core";
import type { InkPoint } from "./ink-tool";
import { pointsToSvgPath } from "./ink-tool";

const OCR_PAD = 16;
const OCR_SCALE = 3;
const MIN_CANVAS_DIM = 64;
const TARGET_LONG_SIDE = 640;
const TARGET_SHORT_SIDE = 160;
const MAX_CANVAS_SIDE = 2048;

/** Tesseract `tessedit_pageseg_mode` — tuned for ink snippets. */
export const OCR_PSM = {
  SINGLE_BLOCK: "6",
  SINGLE_LINE: "7",
  SINGLE_WORD: "8",
  RAW_LINE: "13",
} as const;

export type OcrPsm = (typeof OCR_PSM)[keyof typeof OCR_PSM];

export type InkOcrEngine = "tesseract" | "vision" | "paddle";
export type InkOcrScope = "selected" | "all";

export interface InkOcrResult {
  text: string;
  /** 0–100. Tesseract / Paddle report this; vision uses a high placeholder. */
  confidence: number;
  lang: string;
  strokeCount: number;
  previewDataUrl: string;
  engine: InkOcrEngine;
  scope: InkOcrScope;
}

export function unionInkBbox(shapes: readonly { bbox: Rect }[]): Rect {
  if (!shapes.length) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sh of shapes) {
    const b = sh.bbox;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(4, maxX - minX),
    h: Math.max(4, maxY - minY),
  };
}

export function inflateRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
}

/** Tight crop with padding. Do not force a square — that buries thin ink in white. */
export function normalizeOcrCrop(crop: Rect): Rect {
  const pad = 12;
  return {
    x: crop.x - pad,
    y: crop.y - pad,
    w: Math.max(24, crop.w + pad * 2),
    h: Math.max(24, crop.h + pad * 2),
  };
}

const PATH_CMD_RE = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
const PATH_NUM_RE = /-?\d*\.?\d+(?:[eE][+-]?\d+)?/g;

/** Parse ink path `d` into points (M/L/H/V, commas, implicit lineto, relative). */
export function parseSimplePathD(d: string): InkPoint[] {
  const pts: InkPoint[] = [];
  let cx = 0;
  let cy = 0;
  PATH_CMD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_CMD_RE.exec(d)) !== null) {
    const op = m[1]!;
    const nums = (m[2]!.match(PATH_NUM_RE) ?? []).map(Number);
    const rel = op === op.toLowerCase();
    const up = op.toUpperCase();
    let i = 0;
    const takePair = (): { x: number; y: number } | null => {
      if (i + 1 >= nums.length) return null;
      const x = rel ? cx + nums[i]! : nums[i]!;
      const y = rel ? cy + nums[i + 1]! : nums[i + 1]!;
      i += 2;
      return { x, y };
    };
    if (up === "M" || up === "L") {
      let first = true;
      while (i + 1 < nums.length) {
        const p = takePair();
        if (!p) break;
        cx = p.x;
        cy = p.y;
        if (up === "L" || !first || pts.length === 0 || pts[pts.length - 1]!.x !== cx || pts[pts.length - 1]!.y !== cy) {
          pts.push({ x: cx, y: cy });
        }
        first = false;
      }
    } else if (up === "H") {
      while (i < nums.length) {
        cx = rel ? cx + nums[i]! : nums[i]!;
        i += 1;
        pts.push({ x: cx, y: cy });
      }
    } else if (up === "V") {
      while (i < nums.length) {
        cy = rel ? cy + nums[i]! : nums[i]!;
        i += 1;
        pts.push({ x: cx, y: cy });
      }
    } else if (up === "C" || up === "S" || up === "Q" || up === "T" || up === "A") {
      const step = up === "C" ? 6 : up === "S" || up === "Q" ? 4 : up === "A" ? 7 : 2;
      while (i + step - 1 < nums.length) {
        const x = rel ? cx + nums[i + step - 2]! : nums[i + step - 2]!;
        const y = rel ? cy + nums[i + step - 1]! : nums[i + step - 1]!;
        i += step;
        cx = x;
        cy = y;
        pts.push({ x: cx, y: cy });
      }
    }
  }
  return pts;
}

function rectsOverlap(a: Rect, b: Rect, slack = 8): boolean {
  return !(a.x + a.w < b.x - slack || a.y + a.h < b.y - slack || a.x > b.x + b.w + slack || a.y > b.y + b.h + slack);
}

/** True when `d` is bbox-local (0,0 origin) rather than slide-absolute. */
export function inkPathIsLocalToBbox(sh: PathShape): boolean {
  if (!sh.d?.trim()) return false;
  const sampled = samplePath(sh.d, 24);
  const xs = sampled.map((p) => p.x);
  const ys = sampled.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(span) || span < 0.75) return false;
  const pb: Rect = { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  if (rectsOverlap(pb, sh.bbox)) return false;
  return minX >= -12 && minY >= -12 && maxX <= sh.bbox.w + 16 && maxY <= sh.bbox.h + 16;
}

function colorLuminance(color: string): number {
  const raw = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!m) return 0;
  let h = m[1]!;
  if (h.length === 3) h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Left-to-right reading order with coarse line grouping (for multi-stroke words). */
export function sortInkPathsByReadingOrder(shapes: readonly PathShape[]): PathShape[] {
  const lineTol = Math.max(12, unionInkBbox(shapes).h * 0.35);
  const keyed = shapes.map((sh) => {
    const b = sh.bbox;
    return { sh, cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
  });
  keyed.sort((a, b) => {
    const lineA = Math.round(a.cy / lineTol);
    const lineB = Math.round(b.cy / lineTol);
    if (lineA !== lineB) return lineA - lineB;
    return a.cx - b.cx;
  });
  return keyed.map((k) => k.sh);
}

export function inferOcrPsm(crop: Rect, strokeCount: number): OcrPsm {
  const aspect = crop.w / Math.max(1, crop.h);
  if (strokeCount === 1 && crop.w < 180 && crop.h < 72) return OCR_PSM.SINGLE_WORD;
  if (aspect >= 2.8 && crop.h < 96) return OCR_PSM.SINGLE_LINE;
  if (aspect >= 1.6 && crop.h < 120) return OCR_PSM.RAW_LINE;
  return OCR_PSM.SINGLE_BLOCK;
}

function effectiveStrokeWidth(sh: PathShape): number {
  // Honor the user's actual pen width. The old `minDim * 0.08` scaled stroke
  // width by the ink block size (a 600×300 paragraph → 26px strokes for a 3px
  // pen), which filled the gaps between CJK strokes and broke detection + rec.
  // No compensation is needed: ocrRasterScale already upsamples ≥3×, so thin
  // strokes survive; the small floor only guards against sub-pixel lines.
  return Math.max(sh.stroke?.width ?? 3, 1.5);
}

function ocrStrokeColor(sh: PathShape): string {
  const paint = sh.stroke?.paint;
  const color = paint?.kind === "solid" ? paint.color : "#111827";
  const alpha = paint?.kind === "solid" ? (paint.alpha ?? 1) : 1;
  // Highlighter yellow / light ink composites to near-white on a white canvas.
  if (alpha < 0.85 || colorLuminance(color) > 0.45) return "#111827";
  return color;
}

function strokePathOnCanvas(ctx: CanvasRenderingContext2D, sh: PathShape): void {
  if (!sh.d?.trim()) return;
  const width = effectiveStrokeWidth(sh);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = ocrStrokeColor(sh);
  ctx.lineWidth = width;
  ctx.lineCap = sh.stroke?.cap ?? "round";
  ctx.lineJoin = sh.stroke?.join ?? "round";
  if (inkPathIsLocalToBbox(sh)) {
    ctx.translate(sh.bbox.x, sh.bbox.y);
  }
  try {
    ctx.stroke(new Path2D(sh.d));
  } catch {
    const pts = parseSimplePathD(sh.d);
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Binarize for Tesseract only. Threshold is high so yellow/gray ink is kept. */
export function preprocessInkCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const ink = lum < 250 ? 0 : 255;
    d[i] = ink;
    d[i + 1] = ink;
    d[i + 2] = ink;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function ocrRasterScale(norm: Rect): number {
  const long = Math.max(norm.w, norm.h, 1);
  const short = Math.min(norm.w, norm.h, long);
  const scale = Math.max(OCR_SCALE, TARGET_LONG_SIDE / long, TARGET_SHORT_SIDE / short);
  const rawLong = (long + OCR_PAD * 2) * scale;
  return Math.min(8, scale * Math.min(1, MAX_CANVAS_SIDE / Math.max(rawLong, 1)));
}

export function rasterizeInkPaths(shapes: readonly PathShape[], crop: Rect): HTMLCanvasElement {
  const doc = globalThis.document;
  if (!doc) throw new Error("Ink OCR requires a browser DOM");
  const norm = normalizeOcrCrop(crop);
  const scale = ocrRasterScale(norm);
  const canvas = doc.createElement("canvas");
  const w = Math.max(MIN_CANVAS_DIM, Math.ceil((norm.w + OCR_PAD * 2) * scale));
  const h = Math.max(MIN_CANVAS_DIM, Math.ceil((norm.h + OCR_PAD * 2) * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(OCR_PAD - norm.x, OCR_PAD - norm.y);
  const ordered = sortInkPathsByReadingOrder([...shapes]);
  for (const sh of ordered) strokePathOnCanvas(ctx, sh);
  ctx.restore();
  return canvas;
}

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = src.ownerDocument.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")?.drawImage(src, 0, 0);
  return c;
}

const LANG_MAP: ReadonlyArray<[prefix: string, pack: string]> = [
  ["zh-hant", "chi_tra+eng"],
  ["zh-tw", "chi_tra+eng"],
  ["zh-hk", "chi_tra+eng"],
  ["zh-mo", "chi_tra+eng"],
  ["zh", "chi_sim+eng"],
  ["ja", "jpn+eng"],
  ["ko", "kor+eng"],
  ["fr", "fra+eng"],
  ["de", "deu+eng"],
  ["es", "spa+eng"],
  ["pt", "por+eng"],
  ["it", "ita+eng"],
  ["ru", "rus+eng"],
  ["ar", "ara+eng"],
  ["hi", "hin+eng"],
  ["th", "tha+eng"],
  ["vi", "vie+eng"],
  ["nl", "nld+eng"],
  ["pl", "pol+eng"],
  ["tr", "tur+eng"],
  ["sv", "swe+eng"],
];

export function tesseractLangFromProofing(langTag: string): string {
  const tag = langTag.trim().toLowerCase().replace(/_/g, "-");
  for (const [prefix, pack] of LANG_MAP) {
    if (tag === prefix || tag.startsWith(`${prefix}-`)) return pack;
  }
  return "eng";
}

export function isInkOcrSupported(): boolean {
  return typeof globalThis.document !== "undefined";
}

export function inkOcrConfidenceLevel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 75) return "high";
  if (confidence >= 45) return "medium";
  return "low";
}

let workerCache: { lang: string; worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> } | null =
  null;

async function getInkOcrWorker(lang: string) {
  const { createWorker } = await import("tesseract.js");
  if (workerCache?.lang === lang) return workerCache.worker;
  if (workerCache) {
    await workerCache.worker.terminate();
    workerCache = null;
  }
  const worker = await createWorker(lang);
  workerCache = { lang, worker };
  return worker;
}

/** Release cached Tesseract worker (e.g. on editor dispose). */
export async function disposeInkOcrWorker(): Promise<void> {
  if (!workerCache) return;
  await workerCache.worker.terminate();
  workerCache = null;
}

export async function recognizeInkCanvas(
  canvas: HTMLCanvasElement,
  lang: string,
  meta: { strokeCount: number; previewDataUrl: string; scope: InkOcrScope; crop: Rect },
): Promise<InkOcrResult> {
  const empty = (): InkOcrResult => ({
    text: "",
    confidence: 0,
    lang,
    strokeCount: meta.strokeCount,
    previewDataUrl: meta.previewDataUrl,
    engine: "tesseract",
    scope: meta.scope,
  });
  const psm = inferOcrPsm(meta.crop, meta.strokeCount);
  const worker = await getInkOcrWorker(lang);
  const { PSM } = await import("tesseract.js");
  const psmMode = psm as (typeof PSM)[keyof typeof PSM];
  await worker.setParameters({
    tessedit_pageseg_mode: psmMode,
    preserve_interword_spaces: "1",
  });
  try {
    const work = cloneCanvas(canvas);
    preprocessInkCanvas(work);
    const { data } = await worker.recognize(work);
    const text = data.text.replace(/\s+/g, " ").trim();
    const confidence = Number.isFinite(data.confidence) ? data.confidence : 0;
    return { ...empty(), text, confidence };
  } catch {
    return empty();
  }
}

export async function recognizeInkPaths(
  shapes: readonly PathShape[],
  lang: string,
  scope: InkOcrScope = "selected",
): Promise<InkOcrResult> {
  if (!shapes.length) {
    return {
      text: "",
      confidence: 0,
      lang,
      strokeCount: 0,
      previewDataUrl: "",
      engine: "tesseract",
      scope,
    };
  }
  const crop = unionInkBbox(shapes);
  const canvas = rasterizeInkPaths(shapes, crop);
  return recognizeInkCanvas(canvas, lang, {
    strokeCount: shapes.length,
    previewDataUrl: canvas.toDataURL("image/png"),
    scope,
    crop,
  });
}

/** For tests: rebuild path `d` from points (round-trip sanity). */
export function pathDFromPoints(points: readonly InkPoint[]): string {
  return pointsToSvgPath(points);
}
