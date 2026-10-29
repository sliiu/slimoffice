import type { GradientStop, Paint, PatternPaint, RadialGradientPaint, Rect, Stroke } from "@ppt/core";
import { displayImageSrc } from "./linked-src";
import { previewImageSrc, waitForMetafilePreviews } from "./metafile-preview";
import { waitForVideoFrames } from "./video-frame";
import { waitForModel3DFrames } from "./model3d-frame";

const imageCache = new Map<string, HTMLImageElement>();

function safeStops(stops: GradientStop[]): GradientStop[] {
  const out: GradientStop[] = [];
  for (const s of stops) {
    const o = s.offset;
    if (!Number.isFinite(o)) continue;
    out.push({ ...s, offset: o < 0 ? 0 : o > 1 ? 1 : o });
  }
  return out;
}

export function getImage(src: string, onLoad?: () => void): HTMLImageElement {
  src = displayImageSrc(src);
  let img = imageCache.get(src);
  if (img) {
    if (onLoad && !(img.complete && img.naturalWidth > 0)) {
      img.addEventListener("load", onLoad, { once: true });
    }
    return img;
  }
  img = new Image();
  if (!src.startsWith("data:") && !src.startsWith("blob:")) img.crossOrigin = "anonymous";
  if (onLoad) img.addEventListener("load", onLoad, { once: true });
  img.src = src;
  imageCache.set(src, img);
  return img;
}

/**
 * 等待 imageCache 里所有尚未落定的图片 load/error 完成。
 *
 * 截图 / PDF 导出前必须调用：CanvasBackend（以及 image-paint 填充）只在
 * `img.complete && naturalWidth > 0` 时才 drawImage，否则静默跳过。导出时若不等待图片
 * 解码完成，就会随机丢图——同一份 deck 先后导出 PNG / PDF 结果不一致正是这个原因。
 *
 * 调用前应先让 backend 跑过一次绘制（flush），把所有 src 注册进 imageCache 并开始加载。
 * 每张图带超时兜底，避免坏链 / 慢图把导出永久卡死。
 */
export function waitForImagesLoaded(timeoutMs = 10000): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const img of imageCache.values()) {
    if (img.complete) continue;
    pending.push(
      new Promise<void>((resolve) => {
        let settled = false;
        const done = (): void => {
          if (settled) return;
          settled = true;
          img.removeEventListener("load", done);
          img.removeEventListener("error", done);
          resolve();
        };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, timeoutMs);
      }),
    );
  }
  return Promise.all(pending).then(async () => {
    await waitForMetafilePreviews();
    await waitForVideoFrames(timeoutMs);
    await waitForModel3DFrames(timeoutMs);
  });
}

/**
 * shapeHint：承载填充的形状轮廓类别，仅影响 gradFill path="shape"（等值线沿轮廓）
 * 的解释——矩形轮廓走精确的"矩形框带"pattern，其它轮廓退回径向近似。
 */
export function paintToCanvasStyle(
  ctx: CanvasRenderingContext2D,
  paint: Paint | undefined,
  bbox: Rect,
  onAsset?: () => void,
  shapeHint?: "rect" | "ellipse" | "other",
): string | CanvasGradient | CanvasPattern {
  if (!paint || paint.kind === "none") return "transparent";
  if (paint.kind === "solid") return withAlpha(paint.color, paint.alpha ?? 1);
  if (paint.kind === "linear") {
    // OOXML angle: 0 = →, 90 = ↓ (clockwise).
    const a = (paint.angle * Math.PI) / 180;
    const x1 = bbox.x + bbox.w * (0.5 - Math.cos(a) / 2);
    const y1 = bbox.y + bbox.h * (0.5 - Math.sin(a) / 2);
    const x2 = bbox.x + bbox.w * (0.5 + Math.cos(a) / 2);
    const y2 = bbox.y + bbox.h * (0.5 + Math.sin(a) / 2);
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    for (const s of safeStops(paint.stops)) g.addColorStop(s.offset, withAlpha(s.color, s.alpha ?? 1));
    return g;
  }
  if (paint.kind === "radial") {
    // ECMA-376 §20.1.8.30 <a:path path="…">：rect（及 shape+矩形轮廓）的等值线是
    // 嵌套矩形框，Canvas 没有对应渐变原语 → 离屏 canvas 合成框带 pattern。
    const gpath = paint.path ?? "circle";
    const rectLike = gpath === "rect" || (gpath === "shape" && shapeHint === "rect");
    if (rectLike && bbox.w > 0 && bbox.h > 0) {
      const pat = rectFramePattern(ctx, paint, bbox);
      if (pat) return pat;
    }
    // fillToRect = focus rect (ECMA-376 §20.1.8.30). stop 0 sits at its center,
    // stop 1 reaches the shape edge. We use a concentric inner/outer pair where
    // r1 = max distance from focus to any bbox corner.
    const { l, t, r, b } = paint.fillToRect;
    const fxN = (l + (1 - r)) / 2;
    const fyN = (t + (1 - b)) / 2;
    const fx = bbox.x + bbox.w * fxN;
    const fy = bbox.y + bbox.h * fyN;
    const rad = Math.max(
      Math.hypot(bbox.w * fxN, bbox.h * fyN),
      Math.hypot(bbox.w * (1 - fxN), bbox.h * fyN),
      Math.hypot(bbox.w * fxN, bbox.h * (1 - fyN)),
      Math.hypot(bbox.w * (1 - fxN), bbox.h * (1 - fyN)),
    );
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, rad || 1);
    for (const s of safeStops(paint.stops)) g.addColorStop(s.offset, withAlpha(s.color, s.alpha ?? 1));
    return g;
  }
  if (paint.kind === "pattern") {
    const tile = renderPatternTile(paint);
    const pat = ctx.createPattern(tile, "repeat");
    if (pat) {
      const m = new DOMMatrix();
      m.translateSelf(bbox.x, bbox.y);
      pat.setTransform(m);
      return pat;
    }
    return paint.bg ?? "transparent";
  }
  if (paint.kind === "groupFill") {
    return "transparent";
  }
  if (paint.kind === "image") {
    const probe = getImage(paint.src, onAsset);
    const shown = previewImageSrc(paint.src, probe, onAsset);
    const img = !shown ? probe : shown === paint.src ? probe : getImage(shown, onAsset);
    if (shown && img.complete && img.naturalWidth > 0) {
      const adjusted = paint.adjust ? adjustImage(img, paint.adjust) : (img as CanvasImageSource);
      const naturalW = paint.adjust ? (adjusted as HTMLCanvasElement).width : img.naturalWidth;
      const naturalH = paint.adjust ? (adjusted as HTMLCanvasElement).height : img.naturalHeight;
      const repeat = paint.fit === "tile" ? "repeat" : "no-repeat";
      const pat = ctx.createPattern(adjusted, repeat);
      if (pat) {
        const m = new DOMMatrix();
        m.translateSelf(bbox.x, bbox.y);
        if (paint.fit === "tile") {
          const sx = paint.tileSx ?? 1;
          const sy = paint.tileSy ?? 1;
          m.scaleSelf(sx, sy);
        } else if (paint.srcRect) {
          const sr = paint.srcRect;
          const cropW = Math.max(0.0001, 1 - sr.l - sr.r);
          const cropH = Math.max(0.0001, 1 - sr.t - sr.b);
          m.translateSelf(-bbox.w * sr.l / cropW, -bbox.h * sr.t / cropH);
          m.scaleSelf(bbox.w / (naturalW * cropW), bbox.h / (naturalH * cropH));
        } else if (paint.fit === "cover" || paint.fit === "contain") {
          // 等比缩放：cover 取较大比例（铺满并裁切），contain 取较小比例（完整留白），
          // 再居中。与 SVG 后端 preserveAspectRatio slice/meet 对齐。
          const scale =
            paint.fit === "cover"
              ? Math.max(bbox.w / naturalW, bbox.h / naturalH)
              : Math.min(bbox.w / naturalW, bbox.h / naturalH);
          m.translateSelf((bbox.w - naturalW * scale) / 2, (bbox.h - naturalH * scale) / 2);
          m.scaleSelf(scale, scale);
        } else {
          // fill = 拉伸铺满（OOXML stretch）。
          m.scaleSelf(bbox.w / naturalW, bbox.h / naturalH);
        }
        pat.setTransform(m);
        return pat;
      }
    }
    return "transparent";
  }
  return "transparent";
}

const adjustCache = new Map<string, HTMLCanvasElement>();
const adjustDataUrlCache = new WeakMap<HTMLCanvasElement, string>();

export function adjustImage(img: HTMLImageElement, adj: import("@ppt/core").ImageColorAdjust): HTMLCanvasElement {
  const key = `${img.src}|${JSON.stringify(adj)}`;
  const cached = adjustCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext("2d", { willReadFrequently: true });
  if (!cx) return c;
  cx.drawImage(img, 0, 0);
  try {
    const data = cx.getImageData(0, 0, c.width, c.height);
    applyAdjust(data.data, adj);
    if (adj.blur && adj.blur.radius > 0.2) {
      boxBlur(data.data, c.width, c.height, adj.blur.radius);
    }
    cx.putImageData(data, 0, 0);
  } catch {
    // Cross-origin tainted canvas; bail with un-adjusted image.
  }
  adjustCache.set(key, c);
  return c;
}

/** 图片已加载时返回调色后的 data URL，供 SVG `<image href>` 使用。 */
export function rasterizedAdjustHref(
  src: string,
  adj: import("@ppt/core").ImageColorAdjust,
  onLoad?: () => void,
): string | undefined {
  const img = getImage(src, onLoad);
  if (!img.complete || img.naturalWidth <= 0) return undefined;
  try {
    const c = adjustImage(img, adj);
    let url = adjustDataUrlCache.get(c);
    if (!url) {
      url = c.toDataURL();
      adjustDataUrlCache.set(c, url);
    }
    return url;
  } catch {
    return undefined;
  }
}

function boxBlur(buf: Uint8ClampedArray, w: number, h: number, radius: number): void {
  const r = Math.max(1, Math.min(24, Math.round(radius)));
  const tmp = new Uint8ClampedArray(buf.length);
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horiz: boolean): void => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rs = 0;
        let gs = 0;
        let bs = 0;
        let as = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x;
          const yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k));
          const i = (yy * w + xx) * 4;
          rs += src[i]!;
          gs += src[i + 1]!;
          bs += src[i + 2]!;
          as += src[i + 3]!;
          n++;
        }
        const i = (y * w + x) * 4;
        dst[i] = Math.round(rs / n);
        dst[i + 1] = Math.round(gs / n);
        dst[i + 2] = Math.round(bs / n);
        dst[i + 3] = Math.round(as / n);
      }
    }
  };
  pass(buf, tmp, true);
  pass(tmp, buf, false);
}

function applyAdjust(buf: Uint8ClampedArray, adj: import("@ppt/core").ImageColorAdjust): void {
  const { grayscale, lum, hsl, duotone, alphaMod, biLevel, clrChange, fillOverlay } = adj;
  const duoFrom = duotone ? parseHexRGB(duotone[0]) : null;
  const duoTo = duotone ? parseHexRGB(duotone[1]) : null;
  const changeFrom = clrChange ? parseHexRGB(clrChange.from) : null;
  const changeTo = clrChange ? parseHexRGB(clrChange.to) : null;
  const overlay = fillOverlay ? parseHexRGB(fillOverlay.color) : null;
  for (let i = 0; i < buf.length; i += 4) {
    let r = buf[i]! / 255;
    let g = buf[i + 1]! / 255;
    let b = buf[i + 2]! / 255;
    let a = buf[i + 3]! / 255;
    if (grayscale || duotone) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = g = b = y;
    }
    if (lum) {
      const c = lum.contrast ?? 0;
      const br = lum.bright ?? 0;
      const slope = 1 + c;
      const intercept = br - c / 2;
      r = slope * r + intercept;
      g = slope * g + intercept;
      b = slope * b + intercept;
    }
    if (hsl) {
      const [h, s, l] = rgbToHslLocal(r, g, b);
      const nh = (h + ((hsl.hue ?? 0) / 360) + 1) % 1;
      const ns = clamp01Local(s + (hsl.sat ?? 0));
      const nl = clamp01Local(l + (hsl.lum ?? 0));
      [r, g, b] = hslToRgbLocal(nh, ns, nl);
    }
    if (duoFrom && duoTo) {
      const y = r;
      r = duoFrom[0] + (duoTo[0] - duoFrom[0]) * y;
      g = duoFrom[1] + (duoTo[1] - duoFrom[1]) * y;
      b = duoFrom[2] + (duoTo[2] - duoFrom[2]) * y;
    }
    if (biLevel !== undefined) {
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const v = y >= biLevel ? 1 : 0;
      r = g = b = v;
    }
    if (changeFrom && changeTo) {
      const dist =
        Math.abs(r - changeFrom[0]) + Math.abs(g - changeFrom[1]) + Math.abs(b - changeFrom[2]);
      const alphaOk = !clrChange?.useA || a > 0.02;
      if (alphaOk && dist < 0.36) {
        r = changeTo[0];
        g = changeTo[1];
        b = changeTo[2];
      }
    }
    if (overlay) {
      const blend = fillOverlay?.blend ?? "over";
      if (blend === "mult") {
        r *= overlay[0];
        g *= overlay[1];
        b *= overlay[2];
      } else if (blend === "screen") {
        r = 1 - (1 - r) * (1 - overlay[0]);
        g = 1 - (1 - g) * (1 - overlay[1]);
        b = 1 - (1 - b) * (1 - overlay[2]);
      } else if (blend === "darken") {
        r = Math.min(r, overlay[0]);
        g = Math.min(g, overlay[1]);
        b = Math.min(b, overlay[2]);
      } else if (blend === "lighten") {
        r = Math.max(r, overlay[0]);
        g = Math.max(g, overlay[1]);
        b = Math.max(b, overlay[2]);
      } else {
        const oa = 0.45;
        r = overlay[0] * oa + r * (1 - oa);
        g = overlay[1] * oa + g * (1 - oa);
        b = overlay[2] * oa + b * (1 - oa);
      }
    }
    if (alphaMod !== undefined) a = a * alphaMod;
    if (adj.clrRepl) {
      const repl = parseHexRGB(adj.clrRepl);
      r = repl[0];
      g = repl[1];
      b = repl[2];
    }
    if (adj.tint) {
      const [h, s, l] = rgbToHslLocal(r, g, b);
      const hueDeg = adj.tint.hue ?? h * 360;
      const amt = clamp01Local(adj.tint.amount ?? 0);
      const th = ((hueDeg / 360) % 1 + 1) % 1;
      let dh = th - h;
      if (dh > 0.5) dh -= 1;
      if (dh < -0.5) dh += 1;
      const nh = (h + dh * amt + 1) % 1;
      const ns = s * (1 - amt) + amt;
      [r, g, b] = hslToRgbLocal(nh, ns, l);
    }
    if (adj.alphaReplace !== undefined) a = adj.alphaReplace;
    if (adj.alphaBiLevel !== undefined) a = a >= adj.alphaBiLevel ? 1 : 0;
    if (adj.alphaCeiling) a = a > 0 ? 1 : 0;
    if (adj.alphaFloor) a = a < 1 ? 0 : a;
    buf[i] = Math.round(clamp01Local(r) * 255);
    buf[i + 1] = Math.round(clamp01Local(g) * 255);
    buf[i + 2] = Math.round(clamp01Local(b) * 255);
    buf[i + 3] = Math.round(clamp01Local(a) * 255);
  }
}

function clamp01Local(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function parseHexRGB(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return [0, 0, 0];
  const v = m[1]!;
  return [
    parseInt(v.slice(0, 2), 16) / 255,
    parseInt(v.slice(2, 4), 16) / 255,
    parseInt(v.slice(4, 6), 16) / 255,
  ];
}

function rgbToHslLocal(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgbLocal(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

export function applyStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke | undefined,
  bbox: Rect,
  onAsset?: () => void,
): boolean {
  if (!stroke) return false;
  const style = paintToCanvasStyle(ctx, stroke.paint, bbox, onAsset);
  ctx.strokeStyle = style;
  ctx.lineWidth = stroke.width;
  if (stroke.dash) ctx.setLineDash(stroke.dash);
  else ctx.setLineDash([]);
  if (stroke.cap) ctx.lineCap = stroke.cap;
  if (stroke.join) ctx.lineJoin = stroke.join;
  return true;
}

// ECMA-376 §20.1.8.47 pattFill — 用 8x8 离屏画布渲染 PowerPoint 预设图案。
// gradFill path="rect"：离屏合成"矩形框带"渐变——中心 fillToRect 铺 stop0 纯色，
// 四周 4 个梯形各铺一条线性渐变（上下沿 y、左右沿 x）。任一点的框带参数沿 x 量
// 与沿 y 量在梯形对角接缝上相等 → 四块在接缝处颜色严格一致，视觉无缝。
// 返回 no-repeat pattern 并 setTransform 对齐 bbox；离屏不可用时返回 null，
// 调用方退回径向近似。
function rectFramePattern(
  ctx: CanvasRenderingContext2D,
  paint: RadialGradientPaint,
  bbox: Rect,
): CanvasPattern | null {
  if (typeof document === "undefined") return null;
  const w = Math.max(1, Math.round(bbox.w));
  const h = Math.max(1, Math.round(bbox.h));
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d");
  if (!octx) return null;
  const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);
  const { l, t, r, b } = paint.fillToRect;
  const fx1 = clamp01(l) * w;
  const fy1 = clamp01(t) * h;
  const fx2 = (1 - clamp01(r)) * w;
  const fy2 = (1 - clamp01(b)) * h;
  let cx1 = Math.min(fx1, fx2);
  let cx2 = Math.max(fx1, fx2);
  let cy1 = Math.min(fy1, fy2);
  let cy2 = Math.max(fy1, fy2);
  // fillToRect 缺省 {0,0,0,0}（focus = 整个形状）→ 与旧 radial 分支一致按中心点处理。
  if (cx1 <= 0 && cx2 >= w && cy1 <= 0 && cy2 >= h) {
    cx1 = cx2 = w / 2;
    cy1 = cy2 = h / 2;
  }
  const stops = safeStops(paint.stops);
  const s0 = stops[0];
  if (s0 && cx2 > cx1 && cy2 > cy1) {
    octx.fillStyle = withAlpha(s0.color, s0.alpha ?? 1);
    octx.fillRect(cx1, cy1, cx2 - cx1, cy2 - cy1);
  }
  const quads: Array<{ pts: Array<[number, number]>; x1: number; y1: number; x2: number; y2: number }> = [
    { pts: [[0, 0], [w, 0], [cx2, cy1], [cx1, cy1]], x1: 0, y1: cy1, x2: 0, y2: 0 },
    { pts: [[0, h], [w, h], [cx2, cy2], [cx1, cy2]], x1: 0, y1: cy2, x2: 0, y2: h },
    { pts: [[0, 0], [cx1, cy1], [cx1, cy2], [0, h]], x1: cx1, y1: 0, x2: 0, y2: 0 },
    { pts: [[w, 0], [cx2, cy1], [cx2, cy2], [w, h]], x1: cx2, y1: 0, x2: w, y2: 0 },
  ];
  for (const q of quads) {
    // 渐变轴长度为 0（focus 边贴外缘）→ 该侧无框带，跳过。
    if (q.x1 === q.x2 && q.y1 === q.y2) continue;
    const g = octx.createLinearGradient(q.x1, q.y1, q.x2, q.y2);
    for (const s of stops) g.addColorStop(s.offset, withAlpha(s.color, s.alpha ?? 1));
    octx.beginPath();
    q.pts.forEach(([px, py], i) => (i === 0 ? octx.moveTo(px, py) : octx.lineTo(px, py)));
    octx.closePath();
    octx.fillStyle = g;
    octx.fill();
  }
  const pat = ctx.createPattern(off, "no-repeat");
  if (!pat) return null;
  const m = new DOMMatrix();
  m.translateSelf(bbox.x, bbox.y);
  m.scaleSelf(bbox.w / w, bbox.h / h);
  pat.setTransform(m);
  return pat;
}

// 缓存按 (prst, fg, bg, alpha) 维度去重，避免每次重绘都创建。
const patternTileCache = new Map<string, HTMLCanvasElement>();
function renderPatternTile(paint: PatternPaint): HTMLCanvasElement {
  const key = `${paint.prst}|${paint.fg}|${paint.bg}|${paint.fgAlpha ?? 1}|${paint.bgAlpha ?? 1}`;
  const cached = patternTileCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const cx = c.getContext("2d");
  if (!cx) return c;
  cx.fillStyle = withAlpha(paint.bg, paint.bgAlpha ?? 1);
  cx.fillRect(0, 0, 8, 8);
  cx.fillStyle = withAlpha(paint.fg, paint.fgAlpha ?? 1);
  cx.strokeStyle = withAlpha(paint.fg, paint.fgAlpha ?? 1);
  cx.lineWidth = 1;
  paintPresetPattern(cx, paint.prst);
  patternTileCache.set(key, c);
  return c;
}

function paintPresetPattern(cx: CanvasRenderingContext2D, prst: string): void {
  const dot = (x: number, y: number, s = 1): void => cx.fillRect(x, y, s, s);
  const ln = (x1: number, y1: number, x2: number, y2: number, w = 1): void => {
    const old = cx.lineWidth;
    cx.lineWidth = w;
    cx.beginPath();
    cx.moveTo(x1, y1);
    cx.lineTo(x2, y2);
    cx.stroke();
    cx.lineWidth = old;
  };
  switch (prst) {
    case "pct5": dot(0, 0); break;
    case "pct10": dot(0, 0); dot(4, 4); break;
    case "pct20": dot(0, 0); dot(2, 2); dot(4, 4); dot(6, 6); break;
    case "pct25": dot(0, 0); dot(2, 2); dot(4, 4); dot(6, 6); dot(0, 4); dot(4, 0); break;
    case "pct30":
    case "pct40":
    case "pct50":
      dot(0, 0); dot(2, 2); dot(4, 4); dot(6, 6); dot(0, 4); dot(2, 6); dot(4, 0); dot(6, 2); break;
    case "pct60":
    case "pct70":
    case "pct75":
    case "pct80":
    case "pct90":
      cx.fillRect(0, 0, 8, 8); break;
    case "horz": ln(0, 4, 8, 4); break;
    case "vert": ln(4, 0, 4, 8); break;
    case "ltHorz": ln(0, 2, 8, 2); ln(0, 6, 8, 6); break;
    case "ltVert": ln(2, 0, 2, 8); ln(6, 0, 6, 8); break;
    case "dkHorz": ln(0, 4, 8, 4, 2); break;
    case "dkVert": ln(4, 0, 4, 8, 2); break;
    case "narHorz":
      ln(0, 1, 8, 1); ln(0, 3, 8, 3); ln(0, 5, 8, 5); ln(0, 7, 8, 7); break;
    case "narVert":
      ln(1, 0, 1, 8); ln(3, 0, 3, 8); ln(5, 0, 5, 8); ln(7, 0, 7, 8); break;
    case "dashHorz": ln(0, 4, 4, 4); ln(5, 4, 8, 4); break;
    case "dashVert": ln(4, 0, 4, 4); ln(4, 5, 4, 8); break;
    case "cross": ln(0, 4, 8, 4); ln(4, 0, 4, 8); break;
    case "dnDiag":
    case "ltDnDiag":
      ln(0, 0, 8, 8); ln(-2, 6, 2, 10); ln(6, -2, 10, 2); break;
    case "upDiag":
    case "ltUpDiag":
      ln(0, 8, 8, 0); ln(-2, 2, 2, -2); ln(6, 10, 10, 6); break;
    case "dkDnDiag": ln(0, 0, 8, 8, 2); break;
    case "dkUpDiag": ln(0, 8, 8, 0, 2); break;
    case "wdDnDiag": ln(-2, 4, 4, 10); ln(4, -2, 10, 4); break;
    case "wdUpDiag": ln(-2, 4, 4, -2); ln(4, 10, 10, 4); break;
    case "diagCross": ln(0, 0, 8, 8); ln(0, 8, 8, 0); break;
    case "weave":
    case "trellis":
    case "smGrid":
    case "lgGrid":
      ln(0, 4, 8, 4); ln(4, 0, 4, 8); break;
    case "smCheck":
    case "lgCheck":
      cx.fillRect(0, 0, 4, 4); cx.fillRect(4, 4, 4, 4); break;
    default:
      dot(0, 0); dot(2, 2); dot(4, 4); dot(6, 6); break;
  }
}

function withAlpha(color: string, a: number): string {
  if (a >= 1) return color;
  if (color.startsWith("#")) {
    const h = color.slice(1);
    let r = 0,
      g = 0,
      b = 0;
    if (h.length === 3) {
      r = parseInt(h[0]! + h[0]!, 16);
      g = parseInt(h[1]! + h[1]!, 16);
      b = parseInt(h[2]! + h[2]!, 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}
