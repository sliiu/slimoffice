"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDF_EXPORT_DPI_HIGH = exports.PDF_EXPORT_DPI = exports.SCREEN_DPI = void 0;
exports.snapshotPixelRatio = snapshotPixelRatio;
exports.snapshotSlide = snapshotSlide;
exports.snapshotAll = snapshotAll;
exports.snapshotAllForPdf = snapshotAllForPdf;
const renderer_1 = require("@sliiu/present-renderer");
const three_bake_1 = require("@sliiu/present-three-bake");
const fonts_1 = require("./fonts");
/** Screen / thumbnail baseline (CSS px treated as 96 DPI). */
exports.SCREEN_DPI = 96;
/** Default raster DPI for PDF export — sharper than legacy `scale: 2` (~192 DPI). */
exports.PDF_EXPORT_DPI = 150;
/** High-quality PDF preset (large decks / print). */
exports.PDF_EXPORT_DPI_HIGH = 200;
// 截图 / PDF 走 CanvasBackend（无法挂 live WebGL），所以先离屏把需要 3D 的形状烘成 PNG
// 写进 meta3D 副通道，CanvasBackend 会优先画 bakedSrc。已烘过的 slide
// （在 player/editor 看过）会被 runtime 的签名 dedupe，重复调用无额外开销。
async function prebake3D(slide, scene) {
    const rt = (0, three_bake_1.createBake3DRuntime)();
    rt.kick(slide, (s, result) => {
        const info = (0, three_bake_1.shape3DInfo)(s);
        if (info) {
            info.bakedSrc = result.src;
            info.bakedBBox = result.paddedBBox;
            info.bakedNatural = result.natural;
        }
    }, {
        frontImageSrc: (s) => (0, renderer_1.shapeFrontImageSrc)(scene, s),
    });
    await rt.waitForAll();
}
/** Map slide design px + target DPI → CanvasBackend pixelRatio. */
function snapshotPixelRatio(size, opts = {}) {
    const dpi = opts.dpi ?? (opts.scale != null ? exports.SCREEN_DPI * opts.scale : exports.SCREEN_DPI);
    return dpi / exports.SCREEN_DPI;
}
async function snapshotSlide(slide, size, opts = {}) {
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
        const scene = (0, renderer_1.createScene)(slide, size, { masters: opts.masters });
        // PDF / PNG 与 PowerPoint 导出一致：画设计稿，进入动画目标不按「点击前隐藏」处理。
        // 文字 3D 的正面贴图要在字形可见之后再烘。
        (0, renderer_1.revealDesignedAppearance)(scene, slide);
        await prebake3D(slide, scene);
        const be = new renderer_1.CanvasBackend(scene, host, { pixelRatio });
        be.canvas.style.width = `${size.width}px`;
        be.canvas.style.height = `${size.height}px`;
        // 先同步画一帧把所有 image src 注册进 imageCache 并触发加载，再等全部图片解码完成，
        // 否则 CanvasBackend 会跳过尚未 complete 的图片 → 导出随机丢图（PNG/PDF 不一致）。
        be.flush();
        await (0, renderer_1.waitForImagesLoaded)();
        be.flush();
        await waitFrames(2);
        return await canvasToBlob(be.canvas, opts.mimeType ?? "image/png", opts.quality ?? 0.92);
    }
    finally {
        host.remove();
    }
}
async function snapshotAll(pres, opts = {}) {
    const out = [];
    for (const s of pres.slides) {
        out.push(await snapshotSlide(s, pres.size, { ...opts, masters: opts.masters ?? pres.masters }));
    }
    return out;
}
/** Rasterize all slides for PDF — higher DPI, JPEG tiles, optional embedded-font preload. */
async function snapshotAllForPdf(pres, opts = {}) {
    if (typeof document !== "undefined" && opts.embedFonts !== false) {
        await (0, fonts_1.loadEmbeddedFonts)(document, pres);
    }
    const dpi = opts.dpi ?? exports.PDF_EXPORT_DPI;
    return snapshotAll(pres, {
        ...opts,
        dpi,
        mimeType: opts.mimeType ?? "image/jpeg",
        quality: opts.quality ?? 0.93,
    });
}
function waitFrames(n) {
    return new Promise((res) => {
        let left = n;
        const step = () => {
            if (--left <= 0)
                res();
            else
                requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
}
function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality);
    });
}
