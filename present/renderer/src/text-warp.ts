import type { TextRun, TextShape } from "@ppt/core";
import { FALLBACK_FONT_SIZE } from "./text-shared";

export interface WarpSample {
  x: number;
  y: number;
  angle: number;
  /** Pour 内外路径间距（px）。有值时 glyph 沿法向拉伸填满环带。 */
  radial?: number;
}

export interface WarpGlyph {
  ch: string;
  x: number;
  y: number;
  angle: number;
  scaleY: number;
  run: TextRun;
  fontSize: number;
}

const SKIP = new Set(["textNoShape", "textPlain", ""]);

export function warpActive(s: TextShape): boolean {
  const prst = s.prstTxWarp?.prst;
  return !!prst && !SKIP.has(prst);
}

function adj(av: Record<string, number> | undefined, key: string, fallback: number): number {
  const v = av?.[key];
  if (v == null || !Number.isFinite(v)) return fallback;
  // OOXML adj 多为 0..100000（百分比 × 1000）。已是 0..1 或像素时原样用。
  if (Math.abs(v) <= 1) return v;
  if (Math.abs(v) <= 100) return v / 100;
  return v / 100000;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function samplePolyline(pts: Array<{ x: number; y: number }>, n: number): WarpSample[] {
  if (pts.length < 2) return pts.map((p) => ({ ...p, angle: 0 }));
  const seg: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i]!.x - pts[i - 1]!.x;
    const dy = pts[i]!.y - pts[i - 1]!.y;
    total += Math.hypot(dx, dy);
    seg.push(total);
  }
  if (total <= 0) return pts.map((p) => ({ ...p, angle: 0 }));
  const out: WarpSample[] = [];
  const count = Math.max(2, n);
  for (let i = 0; i < count; i++) {
    const d = (i / (count - 1)) * total;
    let k = 1;
    while (k < seg.length && seg[k]! < d) k++;
    const a = pts[k - 1]!;
    const b = pts[Math.min(k, pts.length - 1)]!;
    const len = seg[k]! - seg[k - 1]!;
    const t = len > 0 ? (d - seg[k - 1]!) / len : 0;
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    out.push({ x, y, angle });
  }
  return out;
}

/** 同心外/内路径按同一参数下标配对（不要各自按弧长重采样，否则角度错位、径向厚度抖动）。 */
function dualPath(
  outer: Array<{ x: number; y: number }>,
  inner: Array<{ x: number; y: number }>,
): WarpSample[] {
  const count = Math.min(outer.length, inner.length);
  if (count < 2) return [];
  const out: WarpSample[] = [];
  for (let k = 0; k < count; k++) {
    const a = outer[k]!;
    const b = inner[k]!;
    const nxt = outer[Math.min(k + 1, count - 1)]!;
    const prv = outer[Math.max(k - 1, 0)]!;
    const angle = (Math.atan2(nxt.y - prv.y, nxt.x - prv.x) * 180) / Math.PI;
    out.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      angle,
      radial: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    });
  }
  return out;
}

function offsetToward(
  pts: Array<{ x: number; y: number }>,
  target: { x: number; y: number },
  dist: number,
): Array<{ x: number; y: number }> {
  const n = pts.length;
  if (n < 2) return pts;
  return pts.map((p, i) => {
    const nxt = pts[Math.min(i + 1, n - 1)]!;
    const prv = pts[Math.max(i - 1, 0)]!;
    const ang = Math.atan2(nxt.y - prv.y, nxt.x - prv.x);
    let nx = -Math.sin(ang);
    let ny = Math.cos(ang);
    if (nx * (target.x - p.x) + ny * (target.y - p.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: p.x + nx * dist, y: p.y + ny * dist };
  });
}

function envelopePath(
  prst: string,
  x: number,
  y: number,
  w: number,
  h: number,
  n: number,
): WarpSample[] {
  const cy = y + h / 2;
  const topFlat = y + h * 0.12;
  const botFlat = y + h * 0.88;
  const minHalf = h * 0.12;
  const maxHalf = h * 0.48;
  const outer: Array<{ x: number; y: number }> = [];
  const inner: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const px = x + t * w;
    const bulge = Math.sin(Math.PI * t);
    const inflate = prst.startsWith("textInflate");
    const half = inflate
      ? minHalf + (maxHalf - minHalf) * bulge
      : maxHalf - (maxHalf - minHalf) * bulge;
    if (prst === "textInflateTop" || prst === "textDeflateTop") {
      outer.push({ x: px, y: cy - half });
      inner.push({ x: px, y: botFlat });
    } else if (prst === "textInflateBottom" || prst === "textDeflateBottom") {
      outer.push({ x: px, y: topFlat });
      inner.push({ x: px, y: cy + half });
    } else {
      outer.push({ x: px, y: cy - half });
      inner.push({ x: px, y: cy + half });
    }
  }
  return dualPath(outer, inner);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function arcPoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 48): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

/** 在文字框内生成 warp 基线采样（沿路径从左到右）。 */
export function sampleWarpPath(
  prst: string,
  box: { x: number; y: number; w: number; h: number },
  avLst?: Record<string, number>,
): WarpSample[] {
  const { x, y, w, h } = box;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const amp = adj(avLst, "adj", 0.25);
  const n = 64;

  const wave = (periods: number, phase = 0): Array<{ x: number; y: number }> => {
    const pts: Array<{ x: number; y: number }> = [];
    const a = Math.max(4, h * amp);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({
        x: x + t * w,
        y: cy + Math.sin((t * periods + phase) * Math.PI * 2) * a,
      });
    }
    return pts;
  };

  switch (prst) {
    case "textArchUp":
      return samplePolyline(arcPoints(cx, y + h * 0.92, w / 2, -h * 0.82, Math.PI, 0), n);
    case "textArchUpPour": {
      const outer = arcPoints(cx, y + h * 0.92, w / 2, -h * 0.82, Math.PI, 0);
      const band = Math.max(6, Math.min(w, h) * clamp(0.38 + amp * 0.25, 0.22, 0.7));
      return dualPath(outer, offsetToward(outer, { x: cx, y: cy }, band));
    }
    case "textArchDown":
      return samplePolyline(arcPoints(cx, y + h * 0.08, w / 2, h * 0.82, Math.PI, 0), n);
    case "textArchDownPour": {
      const outer = arcPoints(cx, y + h * 0.08, w / 2, h * 0.82, Math.PI, 0);
      const band = Math.max(6, Math.min(w, h) * clamp(0.38 + amp * 0.25, 0.22, 0.7));
      return dualPath(outer, offsetToward(outer, { x: cx, y: cy }, band));
    }
    case "textArchLeft":
      return samplePolyline(arcPoints(x + w * 0.92, cy, w * 0.82, h / 2, -Math.PI / 2, -3 * Math.PI / 2), n);
    case "textArchLeftPour": {
      const outer = arcPoints(x + w * 0.92, cy, w * 0.82, h / 2, -Math.PI / 2, -3 * Math.PI / 2);
      const band = Math.max(6, Math.min(w, h) * clamp(0.38 + amp * 0.25, 0.22, 0.7));
      return dualPath(outer, offsetToward(outer, { x: cx, y: cy }, band));
    }
    case "textArchRight":
      return samplePolyline(arcPoints(x + w * 0.08, cy, w * 0.82, h / 2, -Math.PI / 2, Math.PI / 2), n);
    case "textArchRightPour": {
      const outer = arcPoints(x + w * 0.08, cy, w * 0.82, h / 2, -Math.PI / 2, Math.PI / 2);
      const band = Math.max(6, Math.min(w, h) * clamp(0.38 + amp * 0.25, 0.22, 0.7));
      return dualPath(outer, offsetToward(outer, { x: cx, y: cy }, band));
    }
    case "textLeft":
      return samplePolyline(
        [
          { x: x + w * 0.08, y },
          { x: x + w * 0.08, y: y + h },
        ],
        n,
      );
    case "textRight":
      return samplePolyline(
        [
          { x: x + w * 0.92, y },
          { x: x + w * 0.92, y: y + h },
        ],
        n,
      );
    case "textUp":
      return samplePolyline(
        [
          { x: cx, y: y + h },
          { x: cx, y },
        ],
        n,
      );
    case "textDown":
      return samplePolyline(
        [
          { x: cx, y },
          { x: cx, y: y + h },
        ],
        n,
      );
    case "textCircle":
    case "textButton":
    case "textRingOutside":
      return samplePolyline(arcPoints(cx, cy, w / 2 * 0.92, h / 2 * 0.92, Math.PI, Math.PI * 3), n);
    case "textRingInside":
      return samplePolyline(
        arcPoints(cx, cy, w / 2 * (0.42 + amp * 0.2), h / 2 * (0.42 + amp * 0.2), Math.PI, Math.PI * 3),
        n,
      );
    case "textCirclePour":
    case "textButtonPour": {
      const outer = arcPoints(cx, cy, w / 2 * 0.92, h / 2 * 0.92, Math.PI, Math.PI * 3);
      const band = Math.max(6, Math.min(w, h) * clamp(0.36 + amp * 0.25, 0.2, 0.65));
      return dualPath(outer, offsetToward(outer, { x: cx, y: cy }, band));
    }
    case "textWave1":
    case "textDoubleWave1":
      return samplePolyline(wave(1), n);
    case "textWave2":
    case "textWave4":
      return samplePolyline(wave(2), n);
    case "textCurveUp":
    case "textCanUp":
      return samplePolyline(
        [
          { x, y: y + h * 0.72 },
          { x: cx, y: y + h * 0.22 },
          { x: x + w, y: y + h * 0.72 },
        ],
        n,
      );
    case "textCurveDown":
    case "textCanDown":
      return samplePolyline(
        [
          { x, y: y + h * 0.28 },
          { x: cx, y: y + h * 0.78 },
          { x: x + w, y: y + h * 0.28 },
        ],
        n,
      );
    case "textChevron":
    case "textChevronInverted": {
      const up = prst === "textChevron";
      const midY = up ? y + h * 0.28 : y + h * 0.72;
      const sideY = up ? y + h * 0.72 : y + h * 0.28;
      return samplePolyline(
        [
          { x, y: sideY },
          { x: cx, y: midY },
          { x: x + w, y: sideY },
        ],
        n,
      );
    }
    case "textTriangle":
    case "textTriangleInverted": {
      const up = prst === "textTriangle";
      const top = up ? y + h * 0.2 : y + h * 0.8;
      const bot = up ? y + h * 0.8 : y + h * 0.2;
      return samplePolyline(
        [
          { x, y: bot },
          { x: cx, y: top },
          { x: x + w, y: bot },
        ],
        n,
      );
    }
    case "textStop":
      return samplePolyline(
        [
          { x, y: cy },
          { x: x + w * 0.12, y: y + h * 0.28 },
          { x: x + w * 0.88, y: y + h * 0.28 },
          { x: x + w, y: cy },
        ],
        n,
      );
    case "textSlantUp":
      return samplePolyline(
        [
          { x, y: y + h * 0.78 },
          { x: x + w, y: y + h * 0.22 },
        ],
        n,
      );
    case "textSlantDown":
      return samplePolyline(
        [
          { x, y: y + h * 0.22 },
          { x: x + w, y: y + h * 0.78 },
        ],
        n,
      );
    case "textCascadeUp":
      return samplePolyline(
        [
          { x, y: y + h * 0.7 },
          { x: x + w, y: y + h * 0.3 },
        ],
        n,
      );
    case "textCascadeDown":
      return samplePolyline(
        [
          { x, y: y + h * 0.3 },
          { x: x + w, y: y + h * 0.7 },
        ],
        n,
      );
    case "textInflate":
    case "textInflateTop":
    case "textInflateBottom":
    case "textDeflate":
    case "textDeflateTop":
    case "textDeflateBottom":
      return envelopePath(prst, x, y, w, h, n);
    default:
      return samplePolyline(
        [
          { x, y: cy },
          { x: x + w, y: cy },
        ],
        n,
      );
  }
}

function glyphScaleY(prst: string, t: number): number {
  switch (prst) {
    case "textInflate":
    case "textInflateBottom":
    case "textInflateTop":
      return 1 + 0.45 * Math.sin(Math.PI * t);
    case "textDeflate":
    case "textDeflateBottom":
    case "textDeflateTop":
    case "textDeflateInflate":
    case "textDeflateInflateDeflate":
      return Math.max(0.35, 1 - 0.45 * Math.sin(Math.PI * t));
    case "textFadeRight":
      return Math.max(0.25, 1 - 0.75 * t);
    case "textFadeLeft":
      return Math.max(0.25, 0.25 + 0.75 * t);
    case "textFadeUp":
    case "textFadeDown":
      return Math.max(0.25, 0.35 + 0.65 * (prst === "textFadeUp" ? t : 1 - t));
    case "textCascadeUp":
    case "textCascadeDown":
      return 0.55 + 0.7 * t;
    default:
      return 1;
  }
}

export function placeGlyphsOnWarp(
  glyphs: Array<{ ch: string; width: number; run: TextRun; fontSize: number }>,
  samples: WarpSample[],
  prst?: string,
): WarpGlyph[] {
  const total = glyphs.reduce((a, g) => a + g.width, 0);
  if (!samples.length || total <= 0) return [];
  let acc = 0;
  const out: WarpGlyph[] = [];
  for (const g of glyphs) {
    const t = (acc + g.width / 2) / total;
    const idx = Math.min(samples.length - 1, Math.max(0, t * (samples.length - 1)));
    const i0 = Math.floor(idx);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const f = idx - i0;
    const a = samples[i0]!;
    const b = samples[i1]!;
    const radial = a.radial != null && b.radial != null ? lerp(a.radial, b.radial, f) : undefined;
    out.push({
      ch: g.ch,
      x: lerp(a.x, b.x, f),
      y: lerp(a.y, b.y, f),
      angle: lerp(a.angle, b.angle, f),
      scaleY:
        radial != null && g.fontSize > 0
          ? Math.max(0.35, radial / g.fontSize)
          : glyphScaleY(prst ?? "", t),
      run: g.run,
      fontSize: g.fontSize,
    });
    acc += g.width;
  }
  return out;
}

export function flattenWarpGlyphs(
  s: TextShape,
  measure: (run: TextRun, text: string) => number,
): Array<{ ch: string; width: number; run: TextRun; fontSize: number }> {
  const out: Array<{ ch: string; width: number; run: TextRun; fontSize: number }> = [];
  for (const p of s.paragraphs) {
    for (const run of p.runs) {
      const fs = run.fontSize ?? p.defRunStyle?.fontSize ?? FALLBACK_FONT_SIZE;
      for (const ch of Array.from(run.text ?? "")) {
        if (ch === "\n") continue;
        const width = measure(run, ch) + (run.letterSpacing ?? 0);
        out.push({ ch, width, run, fontSize: fs });
      }
    }
    if (p !== s.paragraphs[s.paragraphs.length - 1]) {
      const last = out[out.length - 1];
      if (last) out.push({ ch: " ", width: last.fontSize * 0.3, run: last.run, fontSize: last.fontSize });
    }
  }
  return out;
}
