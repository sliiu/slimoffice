import type { Presentation, Slide } from "@ppt/core";
import { CanvasBackend, createScene, revealDesignedAppearance, shapeFrontImageSrc, waitForImagesLoaded, type Scene } from "@ppt/renderer";
import { createBake3DRuntime, shape3DInfo } from "@ppt/three-bake";
import { loadEmbeddedFonts } from "./fonts";

/** Screen / thumbnail baseline (CSS px treated as 96 DPI). */
export const SCREEN_DPI = 96;
/** Default raster DPI for PDF export — sharper than legacy `scale: 2` (~192 DPI). */
export const PDF_EXPORT_DPI = 150;
/** High-quality PDF preset (large decks / print). */
export const PDF_EXPORT_DPI_HIGH = 200;

// 截图 / PDF 走 CanvasBackend（无法挂 live WebGL），所以先离屏把需要 3D 的形状烘成 PNG
// 写进 meta3D 副通道，CanvasBackend 会优先画 bakedSrc。已烘过的 slide
// （在 player/editor 看过）会被 runtime 的签名 dedupe，重复调用无额外开销。
async function prebake3D(slide: Slide, scene: Scene): Promise<void> {
  const rt = createBake3DRuntime();
  rt.kick(slide, (s, result) => {
    const info = shape3DInfo(s);
    if (info) {
      info.bakedSrc = result.src;
      info.bakedBBox = result.paddedBBox;
      info.bakedNatural = result.natural;
    }
  }, {
    frontImageSrc: (s) => shapeFrontImageSrc(scene, s),
  });
  await rt.waitForAll();
}

export interface SnapshotOptions {
  width?: number;
  /** @deprecated Prefer `dpi` — legacy multiplier on 96 DPI baseline. */
  scale?: number;
  /** Target raster DPI for export (default 96). Overrides `scale` when set. */
  dpi?: number;
  background?: string;
  mimeType?: string;
  quality?: number;
  // 阶段 2.1：master/layout 装饰由 renderer.compose 合成。截图时传入 masters
  // 才能渲出母版装饰；不传则只截 slide 内容（向后兼容）。
  masters?: import("@ppt/core").SlideMaster[];
}

export interface PdfExportOptions extends SnapshotOptions {
  /** Load `pres.fonts` before rasterizing (default true in browser). */
  embedFonts?: boolean;
}

/** Map slide design px + target DPI → CanvasBackend pixelRatio. */
export function snapshotPixelRatio(size: { width: number }, opts: SnapshotOptions = {}): number {
  const dpi = opts.dpi ?? (opts.scale != null ? SCREEN_DPI * opts.scale : SCREEN_DPI);
  return dpi / SCREEN_DPI;
}

export async function snapshotSlide(
  slide: Slide,
  size: { width: number; height: number },
  opts: SnapshotOptions = {},
): Promise<Blob> {
  const w = opts.width ?? size.width;
  const widthScale = w / size.width;
  const pixelRatio = snapshotPixelRatio(size, opts) * widthScale;
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = `${size.width}px`;
  host.style.height = `${size.height}px`;
  document.body.appendChild(host);
  try {
    const scene = createScene(slide, size, { masters: opts.masters });
    // PDF / PNG 与 PowerPoint 导出一致：画设计稿，进入动画目标不按「点击前隐藏」处理。
    // 文字 3D 的正面贴图要在字形可见之后再烘。
    revealDesignedAppearance(scene, slide);
    await prebake3D(slide, scene);
    const be = new CanvasBackend(scene, host, { pixelRatio });
    be.canvas.style.width = `${size.width}px`;
    be.canvas.style.height = `${size.height}px`;
    // 先同步画一帧把所有 image src 注册进 imageCache 并触发加载，再等全部图片解码完成，
    // 否则 CanvasBackend 会跳过尚未 complete 的图片 → 导出随机丢图（PNG/PDF 不一致）。
    be.flush();
    await waitForImagesLoaded();
    be.flush();
    await waitFrames(2);
    return await canvasToBlob(be.canvas, opts.mimeType ?? "image/png", opts.quality ?? 0.92);
  } finally {
    host.remove();
  }
}

export async function snapshotAll(pres: Presentation, opts: SnapshotOptions = {}): Promise<Blob[]> {
  const out: Blob[] = [];
  for (const s of pres.slides) {
    out.push(await snapshotSlide(s, pres.size, { ...opts, masters: opts.masters ?? pres.masters }));
  }
  return out;
}

/** Rasterize all slides for PDF — higher DPI, JPEG tiles, optional embedded-font preload. */
export async function snapshotAllForPdf(pres: Presentation, opts: PdfExportOptions = {}): Promise<Blob[]> {
  if (typeof document !== "undefined" && opts.embedFonts !== false) {
    await loadEmbeddedFonts(document, pres);
  }
  const dpi = opts.dpi ?? PDF_EXPORT_DPI;
  return snapshotAll(pres, {
    ...opts,
    dpi,
    mimeType: opts.mimeType ?? "image/jpeg",
    quality: opts.quality ?? 0.93,
  });
}

function waitFrames(n: number): Promise<void> {
  return new Promise((res) => {
    let left = n;
    const step = (): void => {
      if (--left <= 0) res();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      type,
      quality,
    );
  });
}
