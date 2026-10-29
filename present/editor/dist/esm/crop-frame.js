import { applyNodeTransform } from "./shape-transform.js";
export const ZERO_CROP = { l: 0, t: 0, r: 0, b: 0 };
const FILL_KINDS = new Set(["rect", "ellipse", "path", "polygon", "text"]);
/** 有外框、外框就是露出窗口的对象。平铺填充、音频、组合没有这个窗口。 */
export function cropHost(shape) {
    if (shape.locked)
        return null;
    if (shape.kind === "image" || shape.kind === "video")
        return "frame";
    if (!FILL_KINDS.has(shape.kind))
        return null;
    const fill = shape.fill;
    if (fill?.kind !== "image" || fill.fit === "tile")
        return null;
    return "fill";
}
export function readCrop(shape) {
    if (shape.kind === "image" || shape.kind === "video")
        return shape.cropRect ? { ...shape.cropRect } : { ...ZERO_CROP };
    if (shape.fill?.kind === "image" && shape.fill.srcRect)
        return { ...shape.fill.srcRect };
    return { ...ZERO_CROP };
}
export function cropPreviewSrc(shape) {
    if (shape.kind === "image")
        return shape.src || undefined;
    if (shape.kind === "video")
        return shape.poster || undefined;
    if (shape.fill?.kind === "image")
        return shape.fill.src || undefined;
    return undefined;
}
export function clearedCrop(crop) {
    return Math.abs(crop.l) < 1e-4 && Math.abs(crop.t) < 1e-4 && Math.abs(crop.r) < 1e-4 && Math.abs(crop.b) < 1e-4;
}
export function sameCrop(a, b) {
    return Math.abs(a.l - b.l) < 1e-4 && Math.abs(a.t - b.t) < 1e-4 && Math.abs(a.r - b.r) < 1e-4 && Math.abs(a.b - b.b) < 1e-4;
}
export function sameRect(a, b) {
    return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}
/** 画面在幻灯片上的整张矩形。窗口变，这块不变，像素大小就不变。 */
export function imageFrame(window, crop) {
    const vw = Math.max(1e-6, 1 - crop.l - crop.r);
    const vh = Math.max(1e-6, 1 - crop.t - crop.b);
    const w = window.w / vw;
    const h = window.h / vh;
    return {
        x: window.x - crop.l * w,
        y: window.y - crop.t * h,
        w,
        h,
    };
}
/**
 * 整张画面比幻灯片内容区还大时，按比例缩小并挪进内容区。四周留 `margin`。
 * 宽高都放得下则不动，哪怕画面贴在幻灯片外边。
 */
export function fitPictureToSlide(image, slideW, slideH, margin = 0.05) {
    if (slideW <= 0 || slideH <= 0 || image.w <= 0 || image.h <= 0)
        return null;
    const insetX = slideW * margin;
    const insetY = slideH * margin;
    const availW = Math.max(1, slideW - insetX * 2);
    const availH = Math.max(1, slideH - insetY * 2);
    if (image.w <= availW && image.h <= availH)
        return null;
    const scale = Math.min(availW / image.w, availH / image.h);
    const w = image.w * scale;
    const h = image.h * scale;
    let x = image.x + (image.w - w) / 2;
    let y = image.y + (image.h - h) / 2;
    const minX = insetX;
    const maxX = insetX + availW - w;
    const minY = insetY;
    const maxY = insetY + availH - h;
    if (x < minX)
        x = minX;
    else if (x > maxX)
        x = maxX;
    if (y < minY)
        y = minY;
    else if (y > maxY)
        y = maxY;
    return { x, y, w, h };
}
/** 进入裁剪时用的窗口。画面放得下则返回 null。裁切比例不变。 */
export function fittedCropWindow(shape, slideW, slideH) {
    const crop = readCrop(shape);
    const local = imageFrame(shape.bbox, crop);
    const world = slideRectOf(shape, local);
    const fitted = fitPictureToSlide(world, slideW, slideH);
    if (!fitted)
        return null;
    const t = shape.transform;
    const plain = !t ||
        ((t.rotation ?? 0) === 0 && (t.scaleX ?? 1) === 1 && (t.scaleY ?? 1) === 1);
    if (plain) {
        return windowFromImage({ x: fitted.x - (t?.tx ?? 0), y: fitted.y - (t?.ty ?? 0), w: fitted.w, h: fitted.h }, crop);
    }
    const scale = fitted.w / Math.max(1e-6, world.w);
    const cx = local.x + local.w / 2;
    const cy = local.y + local.h / 2;
    return windowFromImage({
        x: cx - (local.w * scale) / 2,
        y: cy - (local.h * scale) / 2,
        w: local.w * scale,
        h: local.h * scale,
    }, crop);
}
function slideRectOf(shape, local) {
    const pts = [
        applyNodeTransform(shape, local.x, local.y),
        applyNodeTransform(shape, local.x + local.w, local.y),
        applyNodeTransform(shape, local.x + local.w, local.y + local.h),
        applyNodeTransform(shape, local.x, local.y + local.h),
    ];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}
export function windowFromImage(image, crop) {
    const vw = Math.max(1e-6, 1 - crop.l - crop.r);
    const vh = Math.max(1e-6, 1 - crop.t - crop.b);
    return {
        x: image.x + crop.l * image.w,
        y: image.y + crop.t * image.h,
        w: image.w * vw,
        h: image.h * vh,
    };
}
export function cropFromFrames(image, window) {
    const w = Math.max(1e-6, image.w);
    const h = Math.max(1e-6, image.h);
    return {
        l: (window.x - image.x) / w,
        t: (window.y - image.y) / h,
        r: (image.x + image.w - (window.x + window.w)) / w,
        b: (image.y + image.h - (window.y + window.h)) / h,
    };
}
/** 拖画面一角。对侧角钉住，宽高同一比例。窗口不在这里改。 */
export function scalePictureFromCorner(image, corner, dx, dy) {
    const east = corner.includes("e");
    const south = corner.includes("s");
    const ax = east ? image.x : image.x + image.w;
    const ay = south ? image.y : image.y + image.h;
    const ox = east ? image.x + image.w : image.x;
    const oy = south ? image.y + image.h : image.y;
    const od = Math.hypot(ox - ax, oy - ay);
    const nd = Math.hypot(ox + dx - ax, oy + dy - ay);
    const minSide = 8;
    const minScale = Math.max(minSide / Math.max(image.w, 1e-6), minSide / Math.max(image.h, 1e-6));
    const scale = od < 1e-6 ? 1 : Math.max(minScale, nd / od);
    const w = image.w * scale;
    const h = image.h * scale;
    return {
        x: east ? ax : ax - w,
        y: south ? ay : ay - h,
        w,
        h,
    };
}
/** 拖窗口的一边或一角。对边钉住，边不能互相穿过。 */
export function resizeCropWindow(start, corner, dx, dy) {
    let { x, y, w, h } = start;
    const minW = Math.min(8, Math.max(1, start.w));
    const minH = Math.min(8, Math.max(1, start.h));
    if (corner.includes("w")) {
        x = start.x + dx;
        w = start.w - dx;
    }
    if (corner.includes("e"))
        w = start.w + dx;
    if (corner.includes("n")) {
        y = start.y + dy;
        h = start.h - dy;
    }
    if (corner.includes("s"))
        h = start.h + dy;
    if (w < minW) {
        if (corner.includes("w"))
            x = start.x + start.w - minW;
        w = minW;
    }
    if (h < minH) {
        if (corner.includes("n"))
            y = start.y + start.h - minH;
        h = minH;
    }
    return { x, y, w, h };
}
/** 属性栏改一条边：画面矩形不动，窗口跟着收放。 */
export function setCropEdge(window, crop, edge, value) {
    const image = imageFrame(window, crop);
    const next = { ...crop, [edge]: value };
    const minW = Math.min(8, Math.max(1, image.w));
    const minH = Math.min(8, Math.max(1, image.h));
    const minFracW = minW / Math.max(1e-6, image.w);
    const minFracH = minH / Math.max(1e-6, image.h);
    if (edge === "l" || edge === "r") {
        const other = edge === "l" ? next.r : next.l;
        const limit = 1 - minFracW - other;
        if (next[edge] > limit)
            next[edge] = limit;
    }
    else {
        const other = edge === "t" ? next.b : next.t;
        const limit = 1 - minFracH - other;
        if (next[edge] > limit)
            next[edge] = limit;
    }
    return { window: windowFromImage(image, next), crop: next };
}
export function assignCrop(shape, crop, fit) {
    const clear = clearedCrop(crop);
    if (shape.kind === "image" || shape.kind === "video") {
        if (clear)
            delete shape.cropRect;
        else
            shape.cropRect = { l: crop.l, t: crop.t, r: crop.r, b: crop.b };
        return;
    }
    if (shape.fill?.kind !== "image")
        return;
    const next = { ...shape.fill };
    if (clear)
        delete next.srcRect;
    else
        next.srcRect = { l: crop.l, t: crop.t, r: crop.r, b: crop.b };
    if (fit && next.fit !== "tile")
        next.fit = fit;
    shape.fill = next;
}
export function pointInRect(x, y, r) {
    return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}
