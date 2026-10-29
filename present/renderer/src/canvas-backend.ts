import type { ChartShape, ClipState, Model3DShape, OleObjectShape, Shape, Stroke, TextParagraph, TextRun, TextShape } from "@ppt/core";
import { withFontFallback } from "./font-stack";
import { runDisplayText } from "@ppt/core";
import { mergeParaOverrides, netFlipParity, shapeRenderFill, shapeRenderFillBBox, type ParaOverride, type Scene, type SceneNode } from "./scene-node";
import { applyStroke, getImage, paintToCanvasStyle, adjustImage } from "./paint-canvas";
import { previewImageSrc } from "./metafile-preview";
import { cellBorderSegments, cellHasPerSideBorders } from "./cell-borders";
import { getVideoPosterFrame } from "./video-frame";
import { isFileLinkedSrc, drawLinkedImagePlaceholder, displayImageSrc } from "./linked-src";
import { arrowPathD, arrowRefX, arrowSize } from "./arrow-geom";
import { drawChartCanvas } from "./chart-canvas";
import { effectClipPathD, effectClipUsesEvenOdd } from "./effect-clip";
import {
  isEastAsianChar as isEastAsianCharShared,
  mapVisualAlignWithAnchorCtr,
  wrapParagraphIntoLines,
  type VisualLine,
} from "./text-layout";
import {
  buildStackedGlyphs,
  wrapGlyphsIntoColumns,
  type StackedGlyph,
} from "./text-stacked";
import { collectShapeEffects, cssFilterForEffects } from "./shape-effects";
import { autofitTextShape } from "./text-autofit";
import { wordArtFitTransform, type WordArtFit } from "./text-wordart";
import { flattenWarpGlyphs, placeGlyphsOnWarp, sampleWarpPath, warpActive } from "./text-warp";
import { drawOleCanvas } from "./ole-render";
import { drawModel3DCanvas } from "./model3d-render";
import { shape3DInfo } from "@ppt/three-bake";
// vert 旋转角 / 竖排判定 / bullet 编号 / 缺省 insets 全部来自 ./text-shared，
// 与 svg-backend 和编辑器的行内文本编辑器共用同一套规则。
import {
  DEFAULT_TEXT_INSETS,
  FALLBACK_FONT_SIZE,
  lineHeightFactor,
  paragraphFallbackFontSize,
  advanceBulletLabel,
  bulletFontSize,
  formatBulletNumber,
  isVerticalStack,
  pickRunEffectsCssFilter,
  stackedColumnsLtr,
  newBulletNumState,
  vertRotateDeg,
  type BulletNumState,
  type VertMode,
} from "./text-shared";

const isEastAsianChar = isEastAsianCharShared;

function drawCroppedImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  natW: number,
  natH: number,
  crop: { l: number; t: number; r: number; b: number } | undefined,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  if (!crop || natW <= 0 || natH <= 0) {
    ctx.drawImage(img, dx, dy, dw, dh);
    return;
  }
  const cw = 1 - crop.l - crop.r;
  const ch = 1 - crop.t - crop.b;
  if (cw <= 1e-6 || ch <= 1e-6) return;
  let sx = natW * crop.l;
  let sy = natH * crop.t;
  let sw = natW * cw;
  let sh = natH * ch;
  let x = dx;
  let y = dy;
  let w = dw;
  let h = dh;
  if (sx < 0) {
    const cut = -sx / sw;
    x += w * cut;
    w *= 1 - cut;
    sw += sx;
    sx = 0;
  }
  if (sy < 0) {
    const cut = -sy / sh;
    y += h * cut;
    h *= 1 - cut;
    sh += sy;
    sy = 0;
  }
  if (sx + sw > natW) {
    const cut = (sx + sw - natW) / sw;
    w *= 1 - cut;
    sw = natW - sx;
  }
  if (sy + sh > natH) {
    const cut = (sy + sh - natH) / sh;
    h *= 1 - cut;
    sh = natH - sy;
  }
  if (sw <= 0 || sh <= 0 || w <= 0 || h <= 0) return;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export interface CanvasBackendOptions {
  shapeFilter?: (s: Shape) => boolean;
  transparent?: boolean;
  /** Offscreen export: override `devicePixelRatio` (e.g. PDF at 150 DPI → 150/96). */
  pixelRatio?: number;
}

export class CanvasBackend {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scene: Scene;
  private dpr = window.devicePixelRatio || 1;
  private rafId = 0;
  private dispose: Array<() => void> = [];
  private shapeFilter: (s: Shape) => boolean;
  private transparent: boolean;
  /** 给文字 3D 正面贴图用：画字形，不把已经烘好的 PNG 再画一遍。 */
  private drawingFront = false;
  // 离屏 SVGPathElement，仅用于 getPointAtLength 量取 line/path 两端的端点与切线方向，
  // 给箭头（headEnd/tailEnd）定位定向。不挂进 DOM。
  private arrowProbe?: SVGPathElement;

  constructor(scene: Scene, container: HTMLElement, opts: CanvasBackendOptions = {}) {
    this.scene = scene;
    this.shapeFilter = opts.shapeFilter ?? (() => true);
    this.transparent = !!opts.transparent;
    this.dpr = opts.pixelRatio ?? (window.devicePixelRatio || 1);
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    // 与根 SVG 相同：行内画布的基线空隙会把适应窗口的舞台撑出滚动条。
    this.canvas.style.display = "block";
    if (!this.transparent) this.canvas.style.background = "#fff";
    this.resize(scene.width, scene.height);
    container.appendChild(this.canvas);
    const c2d = this.canvas.getContext("2d");
    if (!c2d) throw new Error("2d context unavailable");
    this.ctx = c2d;
    scene.root.walk((n) => {
      const off = n.on(() => this.scheduleRedraw());
      this.dispose.push(off);
    });
    this.scheduleRedraw();
  }

  resize(w: number, h: number): void {
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
  }

  private scheduleRedraw(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.redraw();
    });
  }

  /** 同步刷新到 canvas，并取消 pending rAF。详见 SvgBackend.flush。 */
  flush(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.redraw();
  }

  private redraw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.transparent) {
      ctx.clearRect(0, 0, this.scene.width, this.scene.height);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, this.scene.width, this.scene.height);
    }
    for (const c of this.scene.root.children) this.drawNode(c);
  }

  private drawNode(node: SceneNode): void {
    const s = node.shape;
    const visible = (node.visibleOverride ?? s.visible) !== false;
    if (!visible) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= node.opacity;
    // §19.5.8 animEffect filter="fade" 把 progress 编码到 opacity 通道，runtime 已经
    // 在 progress 内表达了 in/out 方向（in:0→1, out:1→0），这里直接相乘即可。
    const fadeClip = node.clip;
    if (fadeClip && fadeClip.kind === "effect" && fadeClip.filter === "fade") {
      const tr = fadeClip.transition ?? "none";
      const p = tr === "none" ? 1 : Math.max(0, Math.min(1, fadeClip.progress ?? 0));
      ctx.globalAlpha *= p;
    }
    const cx = s.bbox.x + s.bbox.w / 2;
    const cy = s.bbox.y + s.bbox.h / 2;
    const flipX = s.transform?.scaleX ?? 1;
    const flipY = s.transform?.scaleY ?? 1;
    const sx = node.scale * node.scaleX * node.widthScale * (flipX < 0 ? -1 : 1);
    const sy = node.scale * node.scaleY * node.heightScale * (flipY < 0 ? -1 : 1);
    ctx.translate(node.tx, node.ty);
    ctx.translate(cx, cy);
    if (node.rotation) ctx.rotate((node.rotation * Math.PI) / 180);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-cx, -cy);
    // filter="fade" 走 opacity，不应作几何 clip（参考 svg-backend.applyClip 注释）。
    if (node.clip && !(node.clip.kind === "effect" && node.clip.filter === "fade")) {
      this.applyClip(s.bbox, node.clip);
    }
    if (this.shapeFilter(s)) this.drawShape(s, node);
    if (s.kind === "group") {
      for (const c of node.children) this.drawNode(c);
    }
    ctx.restore();
  }

  private applyClip(b: { x: number; y: number; w: number; h: number }, c: ClipState): void {
    const ctx = this.ctx;
    if (c.kind === "wheel") {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const R = Math.hypot(b.w, b.h);
      const n = Math.max(1, Math.floor(c.spokes));
      const p = Math.max(0, Math.min(1, c.progress));
      const span = (2 * Math.PI) / n;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a0 = i * span - Math.PI / 2;
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a0 + span * p, false);
        ctx.closePath();
      }
      ctx.clip();
      return;
    }
    if (c.kind === "effect") {
      // §19.5.21 entrance 完成态（progress>=1）= 完全可见：effectClipPathD 此时只是
      // fullRect(bbox)，几何上不裁内部像素，但会切掉超出 bbox 的 line 箭头 marker /
      // stroke overshoot（"播放完箭头消失"）。完成态直接不施加任何 clip。
      if ((c.progress ?? 0) >= 1) return;
      const geom = { filter: c.filter, prLst: c.prLst, progress: c.progress, transition: c.transition, bbox: b };
      const d = effectClipPathD(geom);
      if (!d) {
        ctx.beginPath();
        ctx.rect(0, 0, 0, 0);
        ctx.clip();
        return;
      }
      const path = new Path2D(d);
      ctx.clip(path, effectClipUsesEvenOdd(geom) ? "evenodd" : "nonzero");
      return;
    }
    const p = Math.max(0, Math.min(1, c.progress));
    let x = b.x;
    let y = b.y;
    let w = b.w;
    let h = b.h;
    switch (c.direction) {
      case "left":
        w = b.w * p;
        break;
      case "right":
        x = b.x + b.w * (1 - p);
        w = b.w * p;
        break;
      case "top":
        h = b.h * p;
        break;
      case "bottom":
        y = b.y + b.h * (1 - p);
        h = b.h * p;
        break;
    }
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }

  private drawShape(s: Shape, node: SceneNode): void {
    const ctx = this.ctx;
    if (s.kind === "group") return;
    // shape 级 outerShdw / glow → ctx.filter（drawNode 的 save/restore 会自动还原）。
    // innerShdw / softEdge / reflection 无 Canvas 2D 等价原语，hybrid 模式下由 SVG
    // 层渲染这些形状；纯 Canvas 后端为已知近似（只画 outer+glow）。
    const fxFilter = cssFilterForEffects(collectShapeEffects(s));
    if (fxFilter) ctx.filter = ctx.filter && ctx.filter !== "none" ? `${ctx.filter} ${fxFilter}` : fxFilter;
    // 离屏光栅：three-bake 把 3D 烘进 meta3D.bakedSrc 后，image 和自选形状都画这张 PNG。
    // 还没烘出来时继续走下面的 2D。live 舞台上的 3D 形状不进这个 backend。
    const info3d = this.drawingFront ? undefined : shape3DInfo(s);
    const baked3d = info3d?.bakedSrc;
    if (baked3d) {
      const bimg = getImage(baked3d, () => this.scheduleRedraw());
      if (bimg.complete && bimg.naturalWidth > 0) {
        const bb = info3d?.bakedBBox ?? s.bbox;
        ctx.drawImage(bimg, bb.x, bb.y, bb.w, bb.h);
      }
      return;
    }
    // gradFill path="shape" 需要轮廓类别：矩形 → 框带 pattern，其它 → 径向近似。
    // text 的 fill 画在矩形背景上（下方 case "text"）→ 同样按 rect 解释。
    const paintHint =
      s.kind === "rect" || s.kind === "text" ? "rect" : s.kind === "ellipse" ? "ellipse" : "other";
    const fill = shapeRenderFill(s, this.scene, node);
    const fillBBox = shapeRenderFillBBox(s, this.scene, node);
    const fillStyle = node.fillOverride
      ? node.fillOverride
      : paintToCanvasStyle(ctx, fill, fillBBox, () => this.scheduleRedraw(), paintHint);
    ctx.fillStyle = fillStyle;
    let hasStroke = false;
    if (node.strokeOverride) {
      ctx.strokeStyle = node.strokeOverride;
      ctx.lineWidth = node.strokeWidthOverride ?? s.stroke?.width ?? 1;
      hasStroke = true;
    } else {
      hasStroke = applyStroke(ctx, s.stroke, s.bbox, () => this.scheduleRedraw());
      if (hasStroke && node.strokeWidthOverride !== null) {
        ctx.lineWidth = node.strokeWidthOverride;
      }
    }
    switch (s.kind) {
      case "rect": {
        if (s.rx || s.ry) {
          this.roundRect(s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h, s.rx ?? s.ry ?? 0);
        } else {
          ctx.beginPath();
          ctx.rect(s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
        }
        if (fill && fill.kind !== "none") ctx.fill();
        if (hasStroke) ctx.stroke();
        break;
      }
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(
          s.bbox.x + s.bbox.w / 2,
          s.bbox.y + s.bbox.h / 2,
          s.bbox.w / 2,
          s.bbox.h / 2,
          0,
          0,
          Math.PI * 2,
        );
        if (fill && fill.kind !== "none") ctx.fill();
        if (hasStroke) ctx.stroke();
        break;
      case "path": {
        const p = new Path2D(s.d);
        if (fill && fill.kind !== "none") ctx.fill(p, s.fillRule ?? "nonzero");
        if (hasStroke) ctx.stroke(p);
        if (hasStroke) this.drawArrowheads(s.stroke, s.d);
        break;
      }
      case "line":
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        if (hasStroke) ctx.stroke();
        if (hasStroke) this.drawArrowheads(s.stroke, `M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`);
        break;
      case "polygon":
        ctx.beginPath();
        s.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        });
        ctx.closePath();
        if (fill && fill.kind !== "none") ctx.fill();
        if (hasStroke) ctx.stroke();
        break;
      case "text": {
        // 与 svg-backend 对齐：textShape 的 fill / stroke 是合法的（用作文字框
        // 背景与轮廓，如表格 a:tc / placeholder）。在文本之前先画一个矩形背景，
        // 复用上面已经 setup 好的 fillStyle / strokeStyle。
        if (fill && fill.kind !== "none") {
          ctx.beginPath();
          ctx.rect(s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
          ctx.fill();
        }
        if (cellHasPerSideBorders(s) && s.cellMeta?.borders) {
          for (const seg of cellBorderSegments(s.bbox, s.cellMeta.borders)) {
            if (!applyStroke(ctx, seg.stroke, s.bbox, () => this.scheduleRedraw())) continue;
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.stroke();
          }
        } else if (hasStroke) {
          ctx.beginPath();
          ctx.rect(s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
          ctx.stroke();
        }
        this.drawText(s, node);
        break;
      }
      case "image": {
        if (isFileLinkedSrc(s.src)) {
          const display = displayImageSrc(s.src, s.bbox.w, s.bbox.h);
          if (display.startsWith("data:image/svg+xml")) {
            drawLinkedImagePlaceholder(ctx, s.bbox, s.src);
            break;
          }
        }
        const redraw = () => this.scheduleRedraw();
        const probe = getImage(s.src, redraw);
        const shown = previewImageSrc(s.src, probe, redraw);
        if (!shown) break;
        const img = shown === s.src ? probe : getImage(shown, redraw);
        const drawn =
          s.adjust && img.complete && img.naturalWidth > 0 ? adjustImage(img, s.adjust) : img;
        const natW = drawn instanceof HTMLCanvasElement ? drawn.width : img.naturalWidth;
        const natH = drawn instanceof HTMLCanvasElement ? drawn.height : img.naturalHeight;
        // shape 级效果已在 drawShape 顶部统一写入 ctx.filter（outer+glow）。
        // 已烘焙的 3D 在 drawShape 开头画掉并返回。这里只剩没有 bakedSrc 的平面图。
        const prevFilter = ctx.filter;
        if (natW > 0) {
          const cr = s.cropRect;
          const geom = s.clipD ? new Path2D(s.clipD) : null;
          if (geom) {
            ctx.save();
            ctx.clip(geom, (s.clipD!.match(/[Mm]/g)?.length ?? 0) > 1 ? "evenodd" : "nonzero");
          }
          if (cr) {
            drawCroppedImage(ctx, drawn, natW, natH, cr, s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
          } else {
            ctx.drawImage(drawn, s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
          }
          if (geom) ctx.restore();
        }
        if (hasStroke) {
          if (s.clipD) ctx.stroke(new Path2D(s.clipD));
          else {
            ctx.beginPath();
            ctx.rect(s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
            ctx.stroke();
          }
        }
        ctx.filter = prevFilter;
        break;
      }
      case "chart":
        drawChartCanvas(ctx, s as ChartShape);
        break;
      case "video": {
        if (s.poster) {
          const img = getImage(s.poster, () => this.scheduleRedraw());
          if (img.complete && img.naturalWidth > 0) {
            drawCroppedImage(ctx, img, img.naturalWidth, img.naturalHeight, s.cropRect, s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
          } else {
            this.drawMediaPlaceholder(s.bbox, "video");
          }
        } else {
          const frame = getVideoPosterFrame(s.src, () => this.scheduleRedraw(), s.trim?.start ?? 0.08);
          if (frame && frame.complete && frame.naturalWidth > 0) {
            drawCroppedImage(ctx, frame, frame.naturalWidth, frame.naturalHeight, s.cropRect, s.bbox.x, s.bbox.y, s.bbox.w, s.bbox.h);
          } else {
            this.drawMediaPlaceholder(s.bbox, "video");
          }
        }
        break;
      }
      case "audio":
        this.drawMediaPlaceholder(s.bbox, "audio");
        break;
      case "webEmbed":
        this.drawMediaPlaceholder(s.bbox, "video");
        break;
      case "ole":
        drawOleCanvas(ctx, s as OleObjectShape);
        break;
      case "model3d":
        drawModel3DCanvas(ctx, s as Model3DShape, () => this.scheduleRedraw());
        break;
    }
  }

  /** Canvas 导出 / 缩略图：audio 无 DOM；video 无 poster 且第一帧未就绪时画占位图标。 */
  private drawMediaPlaceholder(bbox: { x: number; y: number; w: number; h: number }, kind: "audio" | "video"): void {
    const ctx = this.ctx;
    const { x, y, w, h } = bbox;
    ctx.save();
    ctx.fillStyle = "#f3f4f6";
    ctx.strokeStyle = "#9ca3af";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const rr = Math.min(w, h) * 0.12;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, rr);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.setLineDash([]);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.min(w, h) * 0.22;
    ctx.fillStyle = "#9ca3af";
    if (kind === "audio") {
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r * 0.45);
      ctx.lineTo(cx - r * 0.25, cy - r * 0.45);
      ctx.lineTo(cx + r * 0.35, cy - r);
      ctx.lineTo(cx + r * 0.35, cy + r);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.45);
      ctx.lineTo(cx - r, cy + r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.setLineDash([]);
      for (let i = 1; i <= 2; i++) {
        const rArc = r * (0.5 + i * 0.3);
        const ax = cx + r * 0.5;
        ctx.beginPath();
        ctx.arc(ax, cy, rArc, -Math.PI * 0.35, Math.PI * 0.35);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f3f4f6";
      const t = r * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx - t * 0.35, cy - t);
      ctx.lineTo(cx + t, cy);
      ctx.lineTo(cx - t * 0.35, cy + t);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // 线端箭头（headEnd / tailEnd）。SVG backend 用 <marker> 渲染，Canvas 此前完全没画，
  // 导致带箭头的 line / 弧线 / 连接符在 PNG / PDF 导出里丢箭头。这里用离屏 SVGPathElement
  // 量取两端端点与切线方向，复用 arrow-geom 的几何（与 SVG 完全一致）在 canvas 上补画。
  private drawArrowheads(stroke: Stroke | undefined, d: string): void {
    if (!stroke) return;
    const head = stroke.headEnd;
    const tail = stroke.tailEnd;
    const hasHead = !!head && head.kind !== "none";
    const hasTail = !!tail && tail.kind !== "none";
    if (!hasHead && !hasTail) return;
    const ends = this.measurePathEnds(d);
    if (!ends) return;
    const ctx = this.ctx;
    const sw = ctx.lineWidth || stroke.width || 1;
    ctx.save();
    // 箭头填充跟随线的描边色（solid 为颜色，gradient/pattern 则复用 strokeStyle，
    // 与 SVG 的 context-stroke 语义对齐）。
    ctx.fillStyle = ctx.strokeStyle;
    if (hasHead) this.drawOneArrow(ends.sx, ends.sy, ends.sAngle, head!, "start", sw);
    if (hasTail) this.drawOneArrow(ends.ex, ends.ey, ends.eAngle, tail!, "end", sw);
    ctx.restore();
  }

  private drawOneArrow(
    x: number,
    y: number,
    angle: number,
    end: import("@ppt/core").ArrowEnd,
    side: "start" | "end",
    sw: number,
  ): void {
    const { w, l } = arrowSize(end);
    const refX = arrowRefX(end.kind, side, l);
    const p = new Path2D(arrowPathD(end.kind, w, l, side));
    const ctx = this.ctx;
    ctx.save();
    // markerUnits="strokeWidth"：箭头尺寸按线宽缩放；orient="auto"：+X 对齐线方向；
    // refX/refY 这个锚点落在端点上。
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(sw, sw);
    ctx.translate(-refX, 0);
    ctx.fill(p);
    ctx.restore();
  }

  private measurePathEnds(
    d: string,
  ): { sx: number; sy: number; sAngle: number; ex: number; ey: number; eAngle: number } | undefined {
    try {
      if (!this.arrowProbe) {
        this.arrowProbe = document.createElementNS("http://www.w3.org/2000/svg", "path");
      }
      const el = this.arrowProbe;
      el.setAttribute("d", d);
      const total = el.getTotalLength();
      if (!Number.isFinite(total) || total <= 0) return undefined;
      const eps = Math.max(0.01, Math.min(1, total * 0.01));
      const p0 = el.getPointAtLength(0);
      const pe = el.getPointAtLength(total);
      const pa = el.getPointAtLength(Math.min(total, eps));
      const pb = el.getPointAtLength(Math.max(0, total - eps));
      // start 侧：箭头朝向"离开起点的切线"反向（尖端向外），path 已镜像，这里给离开方向即可。
      const sAngle = Math.atan2(pa.y - p0.y, pa.x - p0.x);
      // end 侧：箭头沿"行进方向"（指向终点之外）。
      const eAngle = Math.atan2(pe.y - pb.y, pe.x - pb.x);
      return { sx: p0.x, sy: p0.y, sAngle, ex: pe.x, ey: pe.y, eAngle };
    } catch {
      return undefined;
    }
  }

  private drawText(s: TextShape, node: SceneNode, pass: "main" | "reflect" = "main"): void {
    const ctx = this.ctx;
    if (pass === "main") {
      const runs = s.paragraphs.flatMap((p) => p.runs);
      const refl = runs.flatMap((r) => r.effects ?? []).find((e) => e.kind === "reflection");
      if (refl && refl.kind === "reflection") {
        ctx.save();
        const bottom = s.bbox.y + s.bbox.h;
        const dist = refl.dist ?? 2;
        ctx.translate(0, bottom + dist);
        ctx.scale(1, -1);
        ctx.translate(0, -bottom);
        ctx.globalAlpha *= refl.startAlpha ?? 0.4;
        this.drawText(s, node, "reflect");
        ctx.restore();
      }
      const filter = pickRunEffectsCssFilter(runs);
      if (filter) {
        ctx.save();
        ctx.filter = ctx.filter && ctx.filter !== "none" ? `${ctx.filter} ${filter}` : filter;
      } else {
        ctx.save();
      }
    } else {
      ctx.save();
    }
    ctx.textBaseline = "alphabetic";

    // §20.1.7.6 flipH/flipV：翻转只镜像几何与子元素位置，文字字形保持可读。drawNode
    // 已把自身/祖先的 flip 当 scale(-1) 加到 ctx；这里按累计翻转奇偶性绕文本框中心
    // 反向翻转抵消，字形恢复可读（位置仍随父级镜像）。
    const parity = netFlipParity(node);
    const counterFlip = parity.x < 0 || parity.y < 0;
    if (counterFlip) {
      ctx.save();
      const fcx = s.bbox.x + s.bbox.w / 2;
      const fcy = s.bbox.y + s.bbox.h / 2;
      ctx.translate(fcx, fcy);
      ctx.scale(parity.x, parity.y);
      ctx.translate(-fcx, -fcy);
    }

    const bodyRot = s.bodyRot ?? 0;
    const vertRot = vertRotateDeg(s.vert);
    const vertStack = isVerticalStack(s.vert);
    const uprightCorr = s.upright ? -(node.rotation ?? 0) : 0;
    const totalRot = bodyRot + vertRot + uprightCorr;

    const ins = s.insets ?? DEFAULT_TEXT_INSETS;
    const swap = vertRot !== 0;
    const baseW = Math.max(0, s.bbox.w - ins.l - ins.r);
    const baseH = Math.max(0, s.bbox.h - ins.t - ins.b);
    const innerW = swap ? baseH : baseW;
    const innerH = swap ? baseW : baseH;
    const innerX = swap ? s.bbox.x + s.bbox.w / 2 - innerW / 2 : s.bbox.x + ins.l;
    const innerY = swap ? s.bbox.y + s.bbox.h / 2 - innerH / 2 : s.bbox.y + ins.t;

    if (totalRot !== 0) {
      ctx.save();
      const cx = s.bbox.x + s.bbox.w / 2;
      const cy = s.bbox.y + s.bbox.h / 2;
      ctx.translate(cx, cy);
      ctx.rotate((totalRot * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    const wordArt = !vertStack && !warpActive(s) && s.fromWordArt ? this.measureCanvasWordArt(s) : null;
    if (wordArt) {
      ctx.save();
      ctx.transform(wordArt.sx, 0, 0, wordArt.sy, wordArt.tx, wordArt.ty);
    }
    if (vertStack) {
      this.drawTextStacked(s, node, innerX, innerY, baseW, baseH);
    } else if (warpActive(s)) {
      this.drawTextWarped(s, innerX, innerY, innerW, innerH);
    } else {
      this.drawTextHorizontal(s, node, innerX, innerY, innerW, innerH);
    }
    if (wordArt) ctx.restore();
    if (totalRot !== 0) ctx.restore();
    if (counterFlip) ctx.restore();
    ctx.restore();
  }

  /**
   * 单行艺术字的墨迹框。多段、项目符号、竖排不在这里估，那些仍走 SVG 的 getBBox。
   * 估算必须和 drawTextHorizontal 的顶对齐 / 居中公式一致，否则拉伸会把字拽偏。
   */
  private measureCanvasWordArt(s: TextShape): WordArtFit | null {
    if (s.paragraphs.length !== 1) return null;
    const p = s.paragraphs[0]!;
    if (p.bullet && p.bullet.kind !== "none") return null;
    const text = p.runs.map((r) => r.text ?? "").join("");
    if (!text) return null;
    const run = p.runs[0];
    if (!run) return null;
    const fs = run.fontSize ?? FALLBACK_FONT_SIZE;
    const italic = run.italic ? "italic " : "";
    const weight = run.fontWeight ?? "normal";
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${italic}${weight} ${fs}px ${withFontFallback(run.fontFamily)}`;
    const m = ctx.measureText(text);
    ctx.restore();
    const left = m.actualBoundingBoxLeft || 0;
    const right = m.actualBoundingBoxRight || m.width;
    const ascent = m.actualBoundingBoxAscent || fs * 0.8;
    const descent = m.actualBoundingBoxDescent || fs * 0.2;
    const ins = s.insets ?? DEFAULT_TEXT_INSETS;
    const innerX = s.bbox.x + ins.l;
    const innerY = s.bbox.y + ins.t;
    const innerW = Math.max(0, s.bbox.w - ins.l - ins.r);
    const innerH = Math.max(0, s.bbox.h - ins.t - ins.b);
    const lineH = p.lineHeightPx ?? fs * lineHeightFactor(p);
    const lineAscent = lineH - fs * 0.25;
    let yCursor = innerY;
    if (s.vAlign === "middle") yCursor = innerY + Math.max(0, (innerH - lineH) / 2);
    else if (s.vAlign === "bottom") yCursor = innerY + (innerH - lineH);
    const baseline = yCursor + lineAscent;
    const align = mapVisualAlignWithAnchorCtr(s, p);
    let x = innerX;
    if (align === "middle") x = innerX + (innerW - m.width) / 2;
    else if (align === "end") x = innerX + innerW - m.width;
    return wordArtFitTransform(
      { x: x - left, y: baseline - ascent, w: left + right, h: ascent + descent },
      s.bbox,
    );
  }

  private drawTextWarped(
    s: TextShape,
    innerX: number,
    innerY: number,
    innerW: number,
    innerH: number,
  ): void {
    const ctx = this.ctx;
    const prst = s.prstTxWarp?.prst ?? "textArchUp";
    const glyphs = flattenWarpGlyphs(s, (run, ch) => {
      const fs = run.fontSize ?? FALLBACK_FONT_SIZE;
      const it = run.italic ? "italic " : "";
      ctx.font = `${it}${run.fontWeight ?? "normal"} ${fs}px ${withFontFallback(run.fontFamily)}`;
      return ctx.measureText(ch).width;
    });
    const samples = sampleWarpPath(prst, { x: innerX, y: innerY, w: innerW, h: innerH }, s.prstTxWarp?.avLst);
    const placed = placeGlyphsOnWarp(glyphs, samples, prst);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const g of placed) {
      if (g.ch === " ") continue;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate((g.angle * Math.PI) / 180);
      if (g.scaleY !== 1) ctx.scale(1, g.scaleY);
      const it = g.run.italic ? "italic " : "";
      ctx.font = `${it}${g.run.fontWeight ?? "normal"} ${g.fontSize}px ${withFontFallback(g.run.fontFamily)}`;
      ctx.fillStyle = this.runFillStyle(g.run, undefined, {
        x: -g.fontSize / 2,
        y: -g.fontSize / 2,
        w: g.fontSize,
        h: g.fontSize,
      });
      this.fillTextWithOutline(g.ch, 0, 0, g.run.textOutline);
      ctx.restore();
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  private drawTextHorizontal(
    s: TextShape,
    node: SceneNode,
    innerX: number,
    innerY: number,
    innerW: number,
    innerH: number,
  ): void {
    const ctx = this.ctx;
    const numCol = Math.max(1, Math.floor(s.numCol ?? 1));
    const spcCol = Math.max(0, s.spcCol ?? 0);
    const colW = numCol > 1 ? Math.max(0, (innerW - spcCol * (numCol - 1)) / numCol) : innerW;

    // §21.1.2.1.1 normAutofit — 溢出时运行时重算缩放（与 svg-backend 同步；多栏跳过）。
    if (numCol === 1) {
      s = autofitTextShape(s, innerH, (sh) =>
        sh.paragraphs.reduce((acc, p) => {
          const l = layoutParagraphHorizCanvas(sh, p, colW, ctx, this.scene.slide.index);
          return acc + l.before + l.totalH + l.after;
        }, 0),
      );
    }
    const paraLayouts = s.paragraphs.map((p) => layoutParagraphHorizCanvas(s, p, colW, ctx, this.scene.slide.index));
    const colsLayout = numCol > 1
      ? distributeParagraphsAcrossColumnsByLayout(paraLayouts, innerH, numCol)
      : [paraLayouts.map((_, i) => i)];
    const totalCols = colsLayout.length;
    const numState: BulletNumState = newBulletNumState();

    // §21.1.2.1.1 vertOverflow / horzOverflow — 当 clip 或 ellipsis 时把整体绘制
    // 限制在 inner box 内（坐标系是已经 bodyRot/vert 旋转之后）。
    const vertOverflow = s.vertOverflow ?? "overflow";
    const horzOverflow = s.horzOverflow ?? "overflow";
    let pushedClip = false;
    if (vertOverflow !== "overflow" || horzOverflow !== "overflow") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(innerX, innerY, innerW, innerH);
      ctx.clip();
      pushedClip = true;
    }

    // 与 svg-backend 同步（详见 svg 注释）：
    //   - vAlign="middle"：永远钳到非负（PowerPoint 实际表现是 middle 溢出退化为 top-anchor）；
    //   - vAlign="bottom"：仅 vertOverflow="overflow" 时允许负偏移（top 上溢）；clip/ellipsis 钳到 0。
    const clampMiddle = (space: number): number => Math.max(0, space);
    const clampBottom = (space: number): number =>
      vertOverflow === "overflow" ? space : Math.max(0, space);
    // §21.1.2.1.1 spcFirstLastPara：见 svg-backend 同名注释。仅 explicit false 抑制。
    const respectFirstLast = s.spcFirstLastPara !== false;
    for (let cIdx = 0; cIdx < totalCols; cIdx++) {
      const visualCol = s.rtlCol ? totalCols - 1 - cIdx : cIdx;
      const colX = innerX + visualCol * (colW + spcCol);
      const idxs = colsLayout[cIdx]!;
      const colLayouts = idxs.map((i) => paraLayouts[i]!);
      const lastIdx = colLayouts.length - 1;
      const effBefore = (k: number): number =>
        !respectFirstLast && k === 0 ? 0 : colLayouts[k]!.before;
      const effAfter = (k: number): number =>
        !respectFirstLast && k === lastIdx ? 0 : colLayouts[k]!.after;
      const totalH = colLayouts.reduce(
        (acc, l, k) => acc + effBefore(k) + l.totalH + effAfter(k),
        0,
      );
      let yCursor = innerY;
      if (s.vAlign === "middle") yCursor = innerY + clampMiddle((innerH - totalH) / 2);
      else if (s.vAlign === "bottom") yCursor = innerY + clampBottom(innerH - totalH);
      const colBottom = innerY + innerH;
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k]!;
        const p = s.paragraphs[i]!;
        const pl = colLayouts[k]!;
        const ellipsis = vertOverflow === "ellipsis";
        this.drawWrappedParagraphCanvas(p, pl, node, i, {
          innerX: colX,
          innerY,
          innerW: colW,
          innerH,
          yCursor,
          colBottom,
          ellipsis,
          numState,
          spaceBefore: effBefore(k),
          spaceAfter: effAfter(k),
        });
        yCursor += effBefore(k) + pl.totalH + effAfter(k);
      }
    }

    if (pushedClip) ctx.restore();
  }

  private drawWrappedParagraphCanvas(
    p: TextParagraph,
    pl: ParaLayoutHorizCanvas,
    node: SceneNode,
    i: number,
    layout: {
      innerX: number;
      innerY: number;
      innerW: number;
      innerH: number;
      yCursor: number;
      colBottom: number;
      ellipsis: boolean;
      numState: BulletNumState;
      spaceBefore: number;
      spaceAfter: number;
    },
  ): void {
    const ctx = this.ctx;
    const { innerX, innerW, colBottom, ellipsis, numState } = layout;
    const { rtl, align, marL, indent, hasBullet, lines } = pl;
    // 段前间距由调用方按 spcFirstLastPara 取舍（首段时可能为 0），不再走 pl.before。
    const yStart = layout.yCursor + layout.spaceBefore;
    const textLeft = rtl ? innerX : innerX + marL;
    const textRight = rtl ? innerX + innerW - marL : innerX + innerW;

    const para = node.paraOverrides.get(i);
    const visible = para?.visible ?? true;
    if (!visible) return;

    const charOv = node.charOverrides.get(i);
    const bulletAbs = hasBullet
      ? rtl
        ? innerX + innerW - marL - indent
        : innerX + marL + indent
      : textLeft;

    // 决定"最后一行"——可能是真正末行，或 ellipsis 模式下"还能放下"的最后一行。
    let lastVisibleLineIdx = lines.length - 1;
    if (ellipsis) {
      let acc = yStart;
      for (let li = 0; li < lines.length; li++) {
        const lh = lines[li]!.height;
        if (acc + lh > colBottom && li > 0) {
          lastVisibleLineIdx = li - 1;
          break;
        }
        acc += lh;
      }
    }

    ctx.save();
    if (para?.clip && para.clip.kind === "effect") {
      const geom = {
        filter: para.clip.filter,
        prLst: para.clip.prLst,
        progress: para.clip.progress,
        transition: para.clip.transition,
        bbox: { x: textLeft, y: yStart, w: Math.max(1, textRight - textLeft), h: pl.totalH },
      };
      const d = effectClipPathD(geom);
      if (d) {
        const path = new Path2D(d);
        ctx.clip(path, effectClipUsesEvenOdd(geom) ? "evenodd" : "nonzero");
      }
    }
    if (para) {
      ctx.globalAlpha *= para.opacity ?? 1;
      if (para.tx || para.ty) ctx.translate(para.tx ?? 0, para.ty ?? 0);
      const sCombo = para.scale ?? 1;
      const sX = (para.scaleX ?? 1) * sCombo;
      const sY = (para.scaleY ?? 1) * sCombo;
      const rot = para.rotation ?? 0;
      if (sX !== 1 || sY !== 1 || rot !== 0) {
        const cx = (textLeft + textRight) / 2;
        const cy = yStart + pl.totalH / 2;
        ctx.translate(cx, cy);
        if (rot) ctx.rotate((rot * Math.PI) / 180);
        if (sX !== 1 || sY !== 1) ctx.scale(sX, sY);
        ctx.translate(-cx, -cy);
      }
    }

    let yLine = yStart;
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]!;
      const baseline = yLine + line.ascent;
      let lineLeft = textLeft;
      let lineRight = textRight;
      if (li === 0 && pl.firstLineIndent > 0) {
        if (rtl) lineRight = textRight - pl.firstLineIndent;
        else lineLeft = textLeft + pl.firstLineIndent;
      }
      const lineAreaW = Math.max(0, lineRight - lineLeft);
      // line.width 由 text-layout 用 measureText 计算，包含末尾空白；这里 center / end 对齐时
      // 要扣掉行末空白宽度，否则中心 / 右沿被尾空白挤偏（与 CSS text-align 对非 pre 内容的
      // 处理一致）。仅当最后一个 segment 文本含 trailing ASCII / 全角空白 / \t 时才扣。
      let lineW = Math.max(0, line.width - line.hang);
      if ((align === "middle" || align === "end") && line.segments.length > 0) {
        const last = line.segments[line.segments.length - 1]!;
        const tail = last.text.match(/[ \t\u3000]+$/);
        if (tail) {
          const lastRfs = (para?.fontSize ?? last.run.fontSize) ?? line.maxFs;
          const lastReduced = last.run.baseline
            ? lastRfs * (1 - Math.min(0.5, Math.abs(last.run.baseline)))
            : lastRfs;
          const lastItalic = (para?.fontStyle ?? last.run.italic) ? "italic " : "";
          const lastFw = (para?.fontWeight ?? last.run.fontWeight) ?? "normal";
          const lastFa = withFontFallback(para?.fontFamily ?? last.run.fontFamily);
          ctx.save();
          ctx.font = `${lastItalic}${lastFw} ${lastReduced}px ${lastFa}`;
          lineW = Math.max(0, lineW - ctx.measureText(tail[0]).width);
          ctx.restore();
        }
      }
      let x = lineLeft;
      if (align === "middle") x = lineLeft + (lineAreaW - lineW) / 2;
      else if (align === "end") x = lineRight - lineW;

      // bullet 仅在第一行渲染。
      if (li === 0) this.drawBullet(p, bulletAbs, baseline, numState);

      const appendEllipsis = ellipsis && li === lastVisibleLineIdx && li < lines.length - 1;

      if (charOv && charOv.size > 0 && lines.length === 1) {
        this.drawRunsWithCharOverrides(p, line.maxFs, x, baseline, charOv, para);
      } else {
        for (let si = 0; si < line.segments.length; si++) {
          const seg = line.segments[si]!;
          const run = seg.run;
          const rfs = (para?.fontSize ?? run.fontSize) ?? line.maxFs;
          const reduced = run.baseline ? rfs * (1 - Math.min(0.5, Math.abs(run.baseline))) : rfs;
          const italicSrc = para?.fontStyle ?? run.italic;
          const it = italicSrc ? "italic " : "";
          const fw = (para?.fontWeight ?? run.fontWeight) ?? "normal";
          const fa = withFontFallback(para?.fontFamily ?? run.fontFamily);
          ctx.font = `${it}${fw} ${reduced}px ${fa}`;
          ctx.fillStyle = this.runFillStyle(run, para, { x, y: baseline - rfs, w: seg.width, h: rfs });
          const yShift = run.baseline ? -run.baseline * rfs : 0;
          const drawText = seg.text + (appendEllipsis && si === line.segments.length - 1 ? "…" : "");
          this.fillTextWithOutline(drawText, x, baseline + yShift, run.textOutline);
          x += seg.width + (appendEllipsis && si === line.segments.length - 1 ? ctx.measureText("…").width : 0);
        }
      }
      yLine += line.height;
      if (ellipsis && li === lastVisibleLineIdx) break;
    }
    ctx.restore();
  }

  // 逐字符竖排（wordArtVert / eaVert / mongolianVert）。
  // 段内字符流按 innerH 拆 1+ 列；列宽 = 该列字符最大 fontSize；列从右往左（mongolianVert / rtlCol 反向）。
  // 与 svg-backend 的 renderTextStacked 行为一致——共享 buildStackedGlyphs / wrapGlyphsIntoColumns。
  private drawTextStacked(
    s: TextShape,
    node: SceneNode,
    innerX: number,
    innerY: number,
    innerW: number,
    innerH: number,
  ): void {
    void innerW;
    const ctx = this.ctx;
    const vert = s.vert as "wordArtVert" | "wordArtVertRtl" | "eaVert" | "mongolianVert";
    const ltrColumns = stackedColumnsLtr(vert, s.rtlCol);
    const spcCol = Math.max(0, s.spcCol ?? 0);
    const numState: BulletNumState = newBulletNumState();
    // 与 svg-backend renderStackedColumn 同步：middle/start 永远钳到非负；end/bottom 仅
    // vertOverflow="overflow" 时允许负偏移（顶端上溢）。
    const allowVertOverflow = (s.vertOverflow ?? "overflow") === "overflow";
    const clampMiddle = (sp: number): number => Math.max(0, sp);
    const clampEnd = (sp: number): number => (allowVertOverflow ? sp : Math.max(0, sp));

    type ParaColumn = {
      paraIdx: number;
      paragraph: import("@ppt/core").TextParagraph;
      glyphs: StackedGlyph[];
      width: number;
      isFirstColOfPara: boolean;
    };
    const paraColumns: ParaColumn[] = [];
    for (let pi = 0; pi < s.paragraphs.length; pi++) {
      const p = s.paragraphs[pi]!;
      const para = node.paraOverrides.get(pi);
      const glyphs = buildStackedGlyphs(p, para, vert, { slideIndex: this.scene.slide.index });
      if (glyphs.length === 0) {
        const fs = p.runs.find((r) => r.fontSize)?.fontSize ?? FALLBACK_FONT_SIZE;
        paraColumns.push({ paraIdx: pi, paragraph: p, glyphs: [], width: fs, isFirstColOfPara: true });
        continue;
      }
      const wrapped = wrapGlyphsIntoColumns(glyphs, innerH);
      for (let wi = 0; wi < wrapped.length; wi++) {
        const colGlyphs = wrapped[wi]!;
        const colW = colGlyphs.reduce((m, g) => Math.max(m, g.fontSize), 0);
        paraColumns.push({
          paraIdx: pi,
          paragraph: p,
          glyphs: colGlyphs,
          width: colW,
          isFirstColOfPara: wi === 0,
        });
      }
    }

    let cursorX = ltrColumns ? innerX : innerX + innerW;
    for (const col of paraColumns) {
      if (!ltrColumns) cursorX -= col.width;
      const p = col.paragraph;
      const para = node.paraOverrides.get(col.paraIdx);
      const cx = cursorX + col.width / 2;
      const glyphs = col.glyphs;

      const totalH = glyphs.reduce((acc, g) => acc + g.stepY, 0);
      const space = innerH - totalH;
      let yCursor = innerY;
      let extraStep = 0;
      const pAlign = p.align;
      if (pAlign === "middle") yCursor = innerY + clampMiddle(space / 2);
      else if (pAlign === "end") yCursor = innerY + clampEnd(space);
      else if (pAlign === "justify" && glyphs.length > 1 && space > 0) {
        extraStep = space / (glyphs.length - 1);
      } else {
        if (s.vAlign === "middle") yCursor = innerY + clampMiddle(space / 2);
        else if (s.vAlign === "bottom") yCursor = innerY + clampEnd(space);
      }

      const visible = para?.visible ?? true;
      if (!visible) {
        if (ltrColumns) cursorX += col.width + spcCol;
        else cursorX -= spcCol;
        continue;
      }
      ctx.save();
      if (para) ctx.globalAlpha *= para.opacity ?? 1;

      // bullet 仅出现在该段的首列。advanceBulletLabel 会更新 numState（编号递增），
      // 非首列必须跳过调用，否则编号会多走一次。
      const bulletText = col.isFirstColOfPara && glyphs.length > 0 ? advanceBulletLabel(p, numState) : null;
      if (bulletText) {
        const fs = glyphs[0]!.fontSize;
        const sizePts = p.bullet && "sizePts" in p.bullet ? p.bullet.sizePts : undefined;
        const sizePct = p.bullet && "sizePct" in p.bullet ? p.bullet.sizePct : undefined;
        const bfs = sizePts !== undefined ? sizePts * (96 / 72) : sizePct ? fs * sizePct : fs;
        ctx.textAlign = "center";
        ctx.font = `${bfs}px ${withFontFallback((p.bullet && "font" in p.bullet && p.bullet.font) || p.runs[0]?.fontFamily)}`;
        ctx.fillStyle = (p.bullet && "color" in p.bullet && p.bullet.color) || p.runs[0]?.color || "#000";
        ctx.fillText(bulletText, cx, yCursor + fs);
        yCursor += glyphs[0]!.stepY;
      }
      for (let gi = 0; gi < glyphs.length; gi++) {
        const g = glyphs[gi]!;
        const baseline = yCursor + g.fontSize;
        const italicSrc = para?.fontStyle ?? g.run.italic;
        const it = italicSrc ? "italic " : "";
        const fw = (para?.fontWeight ?? g.run.fontWeight) ?? "normal";
        const fa = withFontFallback(para?.fontFamily ?? g.run.fontFamily);
        ctx.font = `${it}${fw} ${g.fontSize}px ${fa}`;
        ctx.textAlign = "center";
        ctx.fillStyle = this.runFillStyle(g.run, para, {
          x: cx - g.fontSize / 2,
          y: baseline - g.fontSize,
          w: g.fontSize,
          h: g.fontSize,
        });
        if (!g.upright) {
          ctx.save();
          ctx.translate(cx, baseline - g.fontSize / 2);
          ctx.rotate(Math.PI / 2);
          this.fillTextWithOutline(g.ch, 0, g.fontSize / 2, g.run.textOutline);
          ctx.restore();
        } else {
          this.fillTextWithOutline(g.ch, cx, baseline, g.run.textOutline);
        }
        yCursor += g.stepY;
        if (gi < glyphs.length - 1) yCursor += extraStep;
      }
      ctx.restore();

      if (ltrColumns) cursorX += col.width + spcCol;
      else cursorX -= spcCol;
    }
  }

  // ECMA-376 §21.1.2.3.9 rPr/ln — 文字描边：先 stroke 再 fill。
  private runFillStyle(
    run: { color?: string; fill?: import("@ppt/core").Paint },
    para: { fontColor?: string; fillColor?: string } | undefined,
    bbox: { x: number; y: number; w: number; h: number },
  ): string | CanvasGradient | CanvasPattern {
    const paint = run.fill;
    if (paint && paint.kind !== "none" && paint.kind !== "solid") {
      return paintToCanvasStyle(this.ctx, paint, bbox, () => this.scheduleRedraw());
    }
    if (paint?.kind === "solid") return paint.color;
    return (para?.fontColor ?? para?.fillColor ?? run.color) ?? "#000";
  }

  private fillTextWithOutline(text: string, x: number, y: number, outline: Stroke | undefined): void {
    const ctx = this.ctx;
    if (outline) {
      ctx.save();
      const ok = applyStroke(ctx, outline, { x, y, w: 0, h: 0 }, () => this.scheduleRedraw());
      if (ok) ctx.strokeText(text, x, y);
      ctx.restore();
    }
    ctx.fillText(text, x, y);
  }

  private drawBullet(
    p: import("@ppt/core").TextParagraph,
    bulletX: number,
    baseline: number,
    state: BulletNumState,
  ): void {
    const bullet = p.bullet;
    const lvl = p.level ?? 0;
    if (!bullet || bullet.kind === "none") {
      if (state.lastType === "number") {
        state.lastType = "";
        state.count = 0;
      }
      state.lastLevel = lvl;
      return;
    }
    const hasText = p.runs.some((r) => r.text && r.text !== "");
    if (!hasText && bullet.kind !== "picture") return;
    const firstRun = p.runs[0];
    const runFs = firstRun?.fontSize ?? FALLBACK_FONT_SIZE;
    const bulletFs = bulletFontSize(bullet, runFs);
    const ctx = this.ctx;
    if (bullet.kind === "picture") {
      const img = getImage(bullet.src, () => this.scheduleRedraw());
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, bulletX, baseline - bulletFs, bulletFs, bulletFs);
      }
      if (state.lastType === "number") {
        state.lastType = "";
        state.count = 0;
      }
      state.lastLevel = lvl;
      return;
    }
    let text = "";
    if (bullet.kind === "char") {
      text = bullet.char;
      if (state.lastType === "number") {
        state.lastType = "";
        state.count = 0;
      }
    } else if (bullet.kind === "number") {
      if (state.lastType !== "number" || state.lastLevel !== lvl) {
        state.count = (bullet.startAt ?? 1) - 1;
        state.lastType = "number";
      }
      state.count += 1;
      text = formatBulletNumber(state.count, bullet.numType);
    }
    state.lastLevel = lvl;
    const family = withFontFallback(bullet.font ?? firstRun?.fontFamily);
    ctx.save();
    ctx.font = `${bulletFs}px ${family}`;
    ctx.fillStyle = bullet.color ?? firstRun?.color ?? "#000";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, bulletX, baseline);
    ctx.restore();
  }

  private drawRunsWithCharOverrides(
    p: import("@ppt/core").TextParagraph,
    fallbackFs: number,
    startX: number,
    baseline: number,
    overrides: Map<string, import("./scene-node").CharRangeOverride>,
    paraOv?: ParaOverride,
  ): void {
    const ctx = this.ctx;
    type Entry = {
      ch: string;
      run: import("@ppt/core").TextRun;
      width: number;
      ov: import("./scene-node").CharRangeOverride | undefined;
    };
    const entries: Entry[] = [];
    let absIdx = 0;
    for (const run of p.runs) {
      const runText = runDisplayText(run, { slideIndex: this.scene.slide.index });
      const rfs = run.fontSize ?? fallbackFs;
      const it = run.italic ? "italic " : "";
      const fw = run.fontWeight ?? "normal";
      const fa = withFontFallback(run.fontFamily);
      ctx.font = `${it}${fw} ${rfs}px ${fa}`;
      for (const ch of Array.from(runText)) {
        const w = ctx.measureText(ch).width;
        const ov = findCharOverrideCanvas(overrides, absIdx);
        entries.push({ ch, run, width: w, ov });
        absIdx += ch.length;
      }
    }
    type Segment = {
      ov: import("./scene-node").CharRangeOverride | undefined;
      entries: Entry[];
      offsetX: number;
      width: number;
    };
    const segs: Segment[] = [];
    let cur: Segment | null = null;
    let cursor = 0;
    for (const e of entries) {
      if (!cur || cur.ov !== e.ov) {
        cur = { ov: e.ov, entries: [], offsetX: cursor, width: 0 };
        segs.push(cur);
      }
      cur.entries.push(e);
      cur.width += e.width;
      cursor += e.width;
    }
    for (const seg of segs) {
      const segX = startX + seg.offsetX;
      const ov = seg.ov;
      const merged = mergeParaOverrides(paraOv, ov);
      const drawChars = (): void => {
        let x = segX;
        for (const e of seg.entries) {
          const rfs = (merged?.fontSize ?? e.run.fontSize) ?? fallbackFs;
          const italicSrc = merged?.fontStyle ?? e.run.italic;
          const it = italicSrc ? "italic " : "";
          const fw = (merged?.fontWeight ?? e.run.fontWeight) ?? "normal";
          const fa = withFontFallback(merged?.fontFamily ?? e.run.fontFamily);
          ctx.font = `${it}${fw} ${rfs}px ${fa}`;
          ctx.fillStyle = this.runFillStyle(e.run, merged, { x, y: baseline - rfs, w: e.width, h: rfs });
          // textOutline 在 char-range 路径下也保持 paint-order（先 stroke 再 fill）。
          this.fillTextWithOutline(e.ch, x, baseline, e.run.textOutline);
          x += e.width;
        }
      };
      if (!ov) {
        drawChars();
        continue;
      }
      const op = ov.opacity ?? 1;
      if (ov.visible === false || op <= 0) continue;
      ctx.save();
      ctx.globalAlpha *= op;
      const dx = ov.tx ?? 0;
      const dy = ov.ty ?? 0;
      const sCombo = ov.scale ?? 1;
      const sX = (ov.scaleX ?? 1) * sCombo;
      const sY = (ov.scaleY ?? 1) * sCombo;
      const rot = ov.rotation ?? 0;
      if (dx || dy) ctx.translate(dx, dy);
      if (sX !== 1 || sY !== 1 || rot !== 0) {
        const cx = segX + seg.width / 2;
        const cy = baseline - (seg.entries[0]?.run.fontSize ?? fallbackFs) * 0.35;
        ctx.translate(cx, cy);
        if (rot) ctx.rotate((rot * Math.PI) / 180);
        if (sX !== 1 || sY !== 1) ctx.scale(sX, sY);
        ctx.translate(-cx, -cy);
      }
      drawChars();
      ctx.restore();
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** 按未旋转的 bbox 把这个 shape 画到一张独立画布，左上角对齐 bbox 原点。 */
  renderShapeFront(shapeId: string): HTMLCanvasElement | null {
    const node = this.scene.root.findById(shapeId);
    if (!node || node.shape.kind === "group") return null;
    const s = node.shape;
    const c = document.createElement("canvas");
    const dpr = this.dpr;
    c.width = Math.max(1, Math.ceil(Math.max(s.bbox.w, 1) * dpr));
    c.height = Math.max(1, Math.ceil(Math.max(s.bbox.h, 1) * dpr));
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const prev = this.ctx;
    this.ctx = ctx;
    this.drawingFront = true;
    try {
      ctx.setTransform(dpr, 0, 0, dpr, -s.bbox.x * dpr, -s.bbox.y * dpr);
      this.drawShape(s, node);
    } finally {
      this.drawingFront = false;
      this.ctx = prev;
    }
    return c;
  }

  destroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    for (const d of this.dispose) d();
    this.dispose = [];
    this.canvas.remove();
  }
}

/** 离屏把一个 shape 的正面画成画布。调用方负责不再使用返回的 canvas 之后的生命周期。 */
export function rasterizeShapeFront(scene: Scene, shapeId: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const host = document.createElement("div");
  const be = new CanvasBackend(scene, host, { transparent: true, pixelRatio: 1 });
  try {
    return be.renderShapeFront(shapeId);
  } finally {
    be.destroy();
  }
}

function findCharOverrideCanvas(
  overrides: Map<string, import("./scene-node").CharRangeOverride>,
  charIdx: number,
): import("./scene-node").CharRangeOverride | undefined {
  for (const ov of overrides.values()) {
    if (charIdx >= ov.start && charIdx < ov.end) return ov;
  }
  return undefined;
}

// 段落级 wrap + 行高 + RTL/对齐计算（canvas 版本）。
interface ParaLayoutHorizCanvas {
  lines: VisualLine[];
  totalH: number;
  before: number;
  after: number;
  rtl: boolean;
  align: "start" | "middle" | "end" | "justify";
  marL: number;
  indent: number;
  hasBullet: boolean;
  firstLineIndent: number;
}

function layoutParagraphHorizCanvas(
  s: TextShape,
  p: TextParagraph,
  maxWidth: number,
  ctx: CanvasRenderingContext2D,
  slideIndex: number,
): ParaLayoutHorizCanvas {
  const fallbackFs = paragraphFallbackFontSize(p);
  const before = p.spaceBeforePx ?? 0;
  const after = p.spaceAfterPx ?? 0;
  const noWrap = s.wrap === false;
  const rtl = !!p.rtl;
  const align = mapVisualAlignWithAnchorCtr(s, p);
  const marL = (rtl ? p.marginRight : p.marginLeft) ?? 0;
  const indent = p.indent ?? 0;
  const hasBullet = !!p.bullet && p.bullet.kind !== "none";
  const firstLineIndent = hasBullet ? 0 : Math.max(0, indent);
  const textAreaW = Math.max(0, maxWidth - marL);
  const firstLineW = Math.max(0, textAreaW - firstLineIndent);
  const lines = wrapParagraphIntoLines(p, textAreaW, fallbackFs, ctx, firstLineW, noWrap, { slideIndex }, s.compatLnSpc);
  const totalH = lines.reduce((acc, l) => acc + l.height, 0);
  return {
    lines,
    totalH,
    before,
    after,
    rtl,
    align,
    marL,
    indent,
    hasBullet,
    firstLineIndent,
  };
}

function distributeParagraphsAcrossColumnsByLayout(
  layouts: ParaLayoutHorizCanvas[],
  innerH: number,
  numCol: number,
): number[][] {
  const cols: number[][] = Array.from({ length: numCol }, () => []);
  const heights = new Array(numCol).fill(0);
  let curCol = 0;
  for (let i = 0; i < layouts.length; i++) {
    const l = layouts[i]!;
    const h = l.before + l.totalH + l.after;
    if (curCol < numCol - 1 && heights[curCol] > 0 && heights[curCol] + h > innerH) {
      curCol += 1;
    }
    cols[curCol]!.push(i);
    heights[curCol] += h;
  }
  return cols;
}

function hexWithAlpha(color: string, alpha: number): string {
  if (alpha >= 1) return color;
  if (/^#([0-9a-f]{6})$/i.test(color)) {
    const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
    return color + a;
  }
  return color;
}

