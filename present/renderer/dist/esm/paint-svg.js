import { arrowPathD, arrowRefX, arrowSize } from "./arrow-geom.js";
import { displayImageSrc } from "./linked-src.js";
import { getImage, rasterizedAdjustHref } from "./paint-canvas.js";
import { previewImageSrc } from "./metafile-preview.js";
const SVG_NS = "http://www.w3.org/2000/svg";
let _gid = 0;
const nextGid = () => `pp-${++_gid}`;
// 平铺(tile)填充需要图片的"自然像素尺寸"作为重复单元（再乘 sx/sy）。SVG <pattern>
// 是同步生成的，拿不到异步加载的图片尺寸，所以这里维护一个尺寸缓存：首次渲染若未知，
// 后台 new Image() 加载，加载完写缓存并回调 onAsset 触发后端重绘，用真实尺寸再画一遍。
const imageSizeCache = new Map();
const imageSizeLoading = new Set();
function getImageSize(src, onAsset) {
    const cached = imageSizeCache.get(src);
    if (cached)
        return cached;
    if (typeof Image !== "undefined" && !imageSizeLoading.has(src)) {
        imageSizeLoading.add(src);
        const img = new Image();
        if (!src.startsWith("data:") && !src.startsWith("blob:"))
            img.crossOrigin = "anonymous";
        img.addEventListener("load", () => {
            imageSizeLoading.delete(src);
            if (img.naturalWidth > 0)
                imageSizeCache.set(src, { w: img.naturalWidth, h: img.naturalHeight });
            onAsset?.();
        }, { once: true });
        img.addEventListener("error", () => imageSizeLoading.delete(src), { once: true });
        img.src = src;
    }
    return undefined;
}
function appendStops(grad, stops) {
    for (const s of stops) {
        const stop = document.createElementNS(SVG_NS, "stop");
        stop.setAttribute("offset", String(s.offset));
        stop.setAttribute("stop-color", s.color);
        if (s.alpha !== undefined)
            stop.setAttribute("stop-opacity", String(s.alpha));
        grad.appendChild(stop);
    }
}
// OOXML flip controls how the gradient repeats outside its primary region.
// SVG spreadMethod="reflect" is the closest analogue for any flip value;
// SVG does not natively distinguish x/y/xy flip directions.
function applyGradientFlip(grad, flip) {
    if (flip && flip !== "none")
        grad.setAttribute("spreadMethod", "reflect");
}
/**
 * shapeHint：承载该填充的形状轮廓类别，仅影响 gradFill path="shape" 的解释
 * （ECMA-376 §20.1.8.30 <a:path path="shape"> = 渐变等值线沿形状轮廓）——
 * 矩形轮廓走精确的"矩形框带"渲染，椭圆等其它轮廓走椭圆 radial 近似。
 */
export function renderPaint(paint, defs, bbox, onAsset, shapeHint) {
    if (!paint || paint.kind === "none")
        return { paint: "none" };
    if (paint.kind === "solid") {
        return { paint: paint.color, opacity: paint.alpha };
    }
    if (paint.kind === "linear") {
        const id = nextGid();
        const grad = document.createElementNS(SVG_NS, "linearGradient");
        grad.setAttribute("id", id);
        grad.setAttribute("gradientUnits", "objectBoundingBox");
        // OOXML angle: 0 = →, 90 = ↓. SVG x1,y1 → x2,y2 along same convention.
        const a = (paint.angle * Math.PI) / 180;
        const x1 = 0.5 - Math.cos(a) / 2;
        const y1 = 0.5 - Math.sin(a) / 2;
        const x2 = 0.5 + Math.cos(a) / 2;
        const y2 = 0.5 + Math.sin(a) / 2;
        grad.setAttribute("x1", String(x1));
        grad.setAttribute("y1", String(y1));
        grad.setAttribute("x2", String(x2));
        grad.setAttribute("y2", String(y2));
        applyGradientFlip(grad, paint.flip);
        appendStops(grad, paint.stops);
        defs.appendChild(grad);
        return { paint: `url(#${id})`, defNode: grad, defId: id };
    }
    if (paint.kind === "radial") {
        // ECMA-376 §20.1.8.30 <a:path path="…">：等值线形状。
        //   circle → 圆形等值线；rect → 矩形框带；shape → 沿形状轮廓。
        // path="rect"，以及 path="shape" 且承载形状是矩形类 → 精确的矩形框带渐变
        // （4 个梯形各自铺线性渐变，等值线即嵌套矩形，接缝处参数一致无缝）。
        const gpath = paint.path ?? "circle";
        const rectLike = gpath === "rect" || (gpath === "shape" && shapeHint === "rect");
        if (rectLike && bbox && bbox.w > 0 && bbox.h > 0) {
            return renderRectFrameGradient(paint, defs, bbox);
        }
        const id = nextGid();
        const grad = document.createElementNS(SVG_NS, "radialGradient");
        grad.setAttribute("id", id);
        // fillToRect = focus rect for path gradient (ECMA-376 §20.1.8.30).
        // OOXML semantics: stop pos=0 is at fillToRect center; pos=100% is at path edge.
        // SVG radialGradient: fx/fy = offset 0 focus; cx/cy/r = offset 100% circle.
        // Centering cx/cy on fx/fy and choosing r as max distance to bbox corners
        // ensures the last stop reaches the shape boundary.
        const { l, t, r, b } = paint.fillToRect;
        const fx = (l + (1 - r)) / 2;
        const fy = (t + (1 - b)) / 2;
        // path="circle" 的等值线是真圆（PowerPoint 在绝对坐标里画圆）。有 bbox 时用
        // userSpaceOnUse 建真圆；objectBoundingBox 会把圆各向异性拉成椭圆（非正方形
        // bbox 下与 PowerPoint 不符）。path="shape" 落到这里的（椭圆/自由形状）则保留
        // objectBoundingBox 椭圆——对椭圆轮廓恰好是精确解。无 bbox 时也退回旧行为。
        const useUser = gpath === "circle" && !!bbox && bbox.w > 0 && bbox.h > 0;
        if (useUser) {
            const ufx = bbox.x + fx * bbox.w;
            const ufy = bbox.y + fy * bbox.h;
            const rad = Math.max(Math.hypot(ufx - bbox.x, ufy - bbox.y), Math.hypot(bbox.x + bbox.w - ufx, ufy - bbox.y), Math.hypot(ufx - bbox.x, bbox.y + bbox.h - ufy), Math.hypot(bbox.x + bbox.w - ufx, bbox.y + bbox.h - ufy));
            grad.setAttribute("gradientUnits", "userSpaceOnUse");
            grad.setAttribute("cx", String(ufx));
            grad.setAttribute("cy", String(ufy));
            grad.setAttribute("fx", String(ufx));
            grad.setAttribute("fy", String(ufy));
            grad.setAttribute("r", String(rad));
        }
        else {
            const rad = Math.max(Math.hypot(fx, fy), Math.hypot(1 - fx, fy), Math.hypot(fx, 1 - fy), Math.hypot(1 - fx, 1 - fy));
            grad.setAttribute("gradientUnits", "objectBoundingBox");
            grad.setAttribute("cx", String(fx));
            grad.setAttribute("cy", String(fy));
            grad.setAttribute("fx", String(fx));
            grad.setAttribute("fy", String(fy));
            grad.setAttribute("r", String(rad));
        }
        applyGradientFlip(grad, paint.flip);
        appendStops(grad, paint.stops);
        defs.appendChild(grad);
        return { paint: `url(#${id})`, defNode: grad, defId: id };
    }
    if (paint.kind === "image") {
        const id = nextGid();
        const pat = document.createElementNS(SVG_NS, "pattern");
        pat.setAttribute("id", id);
        const fit = paint.fit;
        const tileSx = paint.tileSx ?? 1;
        const tileSy = paint.tileSy ?? 1;
        // 有 bbox → 用 userSpaceOnUse，让 image 视口按真实像素宽高比建立，
        // preserveAspectRatio 的 cover(slice)/contain(meet) 才能保持图片比例。
        // 旧实现用 objectBoundingBox（1×1 正方坐标系再各向异性拉到 bbox），
        // 非正方形（16:9 / 4:3）背景下 cover/contain 会把图压变形。
        // 无 bbox 时退回 objectBoundingBox 行为（bx=0,bw=1 → 公式与旧实现等价）。
        const useUser = !!bbox;
        pat.setAttribute("patternUnits", useUser ? "userSpaceOnUse" : "objectBoundingBox");
        pat.setAttribute("patternContentUnits", useUser ? "userSpaceOnUse" : "objectBoundingBox");
        const bx = bbox?.x ?? 0;
        const by = bbox?.y ?? 0;
        const bw = bbox?.w ?? 1;
        const bh = bbox?.h ?? 1;
        const im = document.createElementNS(SVG_NS, "image");
        const probe = getImage(paint.src, onAsset);
        const shown = previewImageSrc(paint.src, probe, onAsset);
        let href = shown ? displayImageSrc(shown, bbox?.w ?? 320, bbox?.h ?? 180) : "";
        let usedRaster = false;
        if (paint.adjust && shown) {
            const raster = rasterizedAdjustHref(shown, paint.adjust, onAsset);
            if (raster) {
                href = raster;
                usedRaster = true;
            }
        }
        im.setAttribute("href", href);
        im.setAttributeNS("http://www.w3.org/1999/xlink", "href", href);
        if (fit === "tile") {
            // 平铺单元 = 图片自然像素 × sx/sy（slide 坐标 1px=1unit），并按 tx/ty 偏移。
            // 用 userSpaceOnUse 才能用绝对像素尺寸；拿不到自然尺寸时先回退到 bbox（≈拉伸一张），
            // 加载完触发重绘再用真实尺寸正确平铺。
            const size = useUser && shown ? getImageSize(shown, onAsset) : undefined;
            const cellW = (size ? size.w : bw) * tileSx;
            const cellH = (size ? size.h : bh) * tileSy;
            const ox = bx + (paint.tileTx ?? 0);
            const oy = by + (paint.tileTy ?? 0);
            pat.setAttribute("x", String(ox));
            pat.setAttribute("y", String(oy));
            pat.setAttribute("width", String(cellW));
            pat.setAttribute("height", String(cellH));
            if (paint.tileFlip)
                pat.setAttribute("data-flip", paint.tileFlip);
            im.setAttribute("preserveAspectRatio", "none");
            im.setAttribute("x", String(ox));
            im.setAttribute("y", String(oy));
            im.setAttribute("width", String(cellW));
            im.setAttribute("height", String(cellH));
        }
        else {
            pat.setAttribute("x", String(bx));
            pat.setAttribute("y", String(by));
            pat.setAttribute("width", String(bw));
            pat.setAttribute("height", String(bh));
            const par = fit === "fill" ? "none" : fit === "cover" ? "xMidYMid slice" : "xMidYMid meet";
            im.setAttribute("preserveAspectRatio", paint.srcRect ? "none" : par);
            if (paint.srcRect) {
                const sr = paint.srcRect;
                const cw = Math.max(1e-6, 1 - sr.l - sr.r);
                const ch = Math.max(1e-6, 1 - sr.t - sr.b);
                const iw = bw / cw;
                const ih = bh / ch;
                im.setAttribute("x", String(bx - sr.l * iw));
                im.setAttribute("y", String(by - sr.t * ih));
                im.setAttribute("width", String(iw));
                im.setAttribute("height", String(ih));
            }
            else {
                im.setAttribute("x", String(bx));
                im.setAttribute("y", String(by));
                im.setAttribute("width", String(bw));
                im.setAttribute("height", String(bh));
            }
        }
        if (paint.adjust && !usedRaster) {
            const filterId = ensureAdjustFilter(defs, paint.adjust);
            if (filterId)
                im.setAttribute("filter", `url(#${filterId})`);
        }
        if (paint.alpha !== undefined)
            im.setAttribute("opacity", String(paint.alpha));
        pat.appendChild(im);
        defs.appendChild(pat);
        return { paint: `url(#${id})`, defNode: pat, defId: id };
    }
    if (paint.kind === "pattern") {
        const id = nextGid();
        const pat = renderPatternFill(paint, id);
        defs.appendChild(pat);
        return { paint: `url(#${id})`, defNode: pat, defId: id };
    }
    if (paint.kind === "groupFill") {
        return { paint: "none" };
    }
    return { paint: "none" };
}
// ECMA-376 §20.1.8.30 gradFill path="rect"（及 path="shape" + 矩形轮廓）——
// 等值线是从 fillToRect（pos=0）到形状外缘（pos=1）的嵌套矩形框。
// SVG 没有"矩形径向渐变"原语，这里用 <pattern>(userSpaceOnUse) 精确合成：
//   中心 = fillToRect 矩形铺 stop0 纯色；四周 = 4 个梯形各铺一条线性渐变
//   （上下两块沿 y、左右两块沿 x）。任取一点，其"框带参数"沿 x 量和沿 y 量
//   在梯形对角接缝上相等 → 四块颜色在接缝处严格一致，视觉无缝。
// 形状自身的几何（圆角、椭圆裁剪）由 fill 所在元素天然裁剪 pattern，无需处理。
function renderRectFrameGradient(paint, defs, bbox) {
    const id = nextGid();
    const { x, y, w, h } = bbox;
    const { l, t, r, b } = paint.fillToRect;
    // focus 矩形（用户空间）。clamp 防御非法 fillToRect（l+r>1 等）翻转。
    const fx1 = x + Math.min(Math.max(l, 0), 1) * w;
    const fy1 = y + Math.min(Math.max(t, 0), 1) * h;
    const fx2 = x + (1 - Math.min(Math.max(r, 0), 1)) * w;
    const fy2 = y + (1 - Math.min(Math.max(b, 0), 1)) * h;
    let cx1 = Math.min(fx1, fx2);
    let cx2 = Math.max(fx1, fx2);
    let cy1 = Math.min(fy1, fy2);
    let cy2 = Math.max(fy1, fy2);
    // fillToRect 缺省解析为 {0,0,0,0}（focus 覆盖整个形状）——按字面渲染会得到
    // stop0 纯色。与旧 radial 分支保持一致：视为中心点 focus。
    if (cx1 <= x && cx2 >= x + w && cy1 <= y && cy2 >= y + h) {
        cx1 = cx2 = x + w / 2;
        cy1 = cy2 = y + h / 2;
    }
    const pat = document.createElementNS(SVG_NS, "pattern");
    pat.setAttribute("id", id);
    pat.setAttribute("patternUnits", "userSpaceOnUse");
    pat.setAttribute("patternContentUnits", "userSpaceOnUse");
    pat.setAttribute("x", String(x));
    pat.setAttribute("y", String(y));
    pat.setAttribute("width", String(w));
    pat.setAttribute("height", String(h));
    const stops = paint.stops;
    const s0 = stops[0];
    // focus 矩形内部整体是 pos=0 的颜色。
    if (s0 && cx2 > cx1 && cy2 > cy1) {
        const core = document.createElementNS(SVG_NS, "rect");
        core.setAttribute("x", String(cx1));
        core.setAttribute("y", String(cy1));
        core.setAttribute("width", String(cx2 - cx1));
        core.setAttribute("height", String(cy2 - cy1));
        core.setAttribute("fill", s0.color);
        if (s0.alpha !== undefined)
            core.setAttribute("fill-opacity", String(s0.alpha));
        pat.appendChild(core);
    }
    // 四个梯形：points + 各自线性渐变轴（从 focus 边 pos=0 到外缘 pos=1）。
    const quads = [
        // top
        { pts: `${x},${y} ${x + w},${y} ${cx2},${cy1} ${cx1},${cy1}`, x1: 0, y1: cy1, x2: 0, y2: y },
        // bottom
        { pts: `${x},${y + h} ${x + w},${y + h} ${cx2},${cy2} ${cx1},${cy2}`, x1: 0, y1: cy2, x2: 0, y2: y + h },
        // left
        { pts: `${x},${y} ${cx1},${cy1} ${cx1},${cy2} ${x},${y + h}`, x1: cx1, y1: 0, x2: x, y2: 0 },
        // right
        { pts: `${x + w},${y} ${cx2},${cy1} ${cx2},${cy2} ${x + w},${y + h}`, x1: cx2, y1: 0, x2: x + w, y2: 0 },
    ];
    quads.forEach((q, i) => {
        // 渐变轴长度为 0（focus 边贴着外缘）→ 该侧没有框带，跳过。
        if (q.x1 === q.x2 && q.y1 === q.y2)
            return;
        const gid = `${id}-q${i}`;
        const grad = document.createElementNS(SVG_NS, "linearGradient");
        grad.setAttribute("id", gid);
        grad.setAttribute("gradientUnits", "userSpaceOnUse");
        grad.setAttribute("x1", String(q.x1));
        grad.setAttribute("y1", String(q.y1));
        grad.setAttribute("x2", String(q.x2));
        grad.setAttribute("y2", String(q.y2));
        applyGradientFlip(grad, paint.flip);
        appendStops(grad, stops);
        pat.appendChild(grad);
        const poly = document.createElementNS(SVG_NS, "polygon");
        poly.setAttribute("points", q.pts);
        poly.setAttribute("fill", `url(#${gid})`);
        pat.appendChild(poly);
    });
    defs.appendChild(pat);
    return { paint: `url(#${id})`, defNode: pat, defId: id };
}
// ECMA-376 §20.1.8.47 + ST_PresetPatternVal — 用 8x8 像素位图把 PowerPoint
// 内置图案翻译为 SVG <pattern>。所有图案都以 fg/bg 两色渲染。
function renderPatternFill(paint, id) {
    const pat = document.createElementNS(SVG_NS, "pattern");
    pat.setAttribute("id", id);
    pat.setAttribute("patternUnits", "userSpaceOnUse");
    pat.setAttribute("width", "8");
    pat.setAttribute("height", "8");
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("width", "8");
    bg.setAttribute("height", "8");
    bg.setAttribute("fill", paint.bg);
    if (paint.bgAlpha !== undefined)
        bg.setAttribute("fill-opacity", String(paint.bgAlpha));
    pat.appendChild(bg);
    const fg = paint.fg;
    const fgOp = paint.fgAlpha !== undefined ? `fill-opacity="${paint.fgAlpha}"` : "";
    pat.insertAdjacentHTML("beforeend", presetPatternSvg(paint.prst, fg, fgOp));
    return pat;
}
function presetPatternSvg(prst, fg, fgOp) {
    const dot = (x, y, s = 1) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${fg}" ${fgOp}/>`;
    const line = (d, w = 1) => `<path d="${d}" stroke="${fg}" stroke-width="${w}" ${fgOp.replace("fill-opacity", "stroke-opacity")} fill="none"/>`;
    switch (prst) {
        case "pct5": return dot(0, 0);
        case "pct10": return dot(0, 0) + dot(4, 4);
        case "pct20": return dot(0, 0) + dot(2, 2) + dot(4, 4) + dot(6, 6);
        case "pct25": return dot(0, 0) + dot(2, 2) + dot(4, 4) + dot(6, 6) + dot(0, 4) + dot(4, 0);
        case "pct30":
        case "pct40":
        case "pct50":
            return dot(0, 0, 1) + dot(2, 2, 1) + dot(4, 4, 1) + dot(6, 6, 1) +
                dot(0, 4, 1) + dot(2, 6, 1) + dot(4, 0, 1) + dot(6, 2, 1);
        case "pct60":
        case "pct70":
        case "pct75":
        case "pct80":
        case "pct90":
            return `<rect width="8" height="8" fill="${fg}" ${fgOp}/>`;
        case "horz":
            return line("M 0 4 L 8 4");
        case "vert":
            return line("M 4 0 L 4 8");
        case "ltHorz":
            return line("M 0 2 L 8 2") + line("M 0 6 L 8 6");
        case "ltVert":
            return line("M 2 0 L 2 8") + line("M 6 0 L 6 8");
        case "dkHorz":
            return line("M 0 4 L 8 4", 2);
        case "dkVert":
            return line("M 4 0 L 4 8", 2);
        case "narHorz":
            return line("M 0 1 L 8 1") + line("M 0 3 L 8 3") + line("M 0 5 L 8 5") + line("M 0 7 L 8 7");
        case "narVert":
            return line("M 1 0 L 1 8") + line("M 3 0 L 3 8") + line("M 5 0 L 5 8") + line("M 7 0 L 7 8");
        case "dashHorz":
            return line("M 0 4 L 4 4") + line("M 5 4 L 8 4");
        case "dashVert":
            return line("M 4 0 L 4 4") + line("M 4 5 L 4 8");
        case "cross":
            return line("M 0 4 L 8 4") + line("M 4 0 L 4 8");
        case "dnDiag":
        case "ltDnDiag":
            return line("M 0 0 L 8 8") + line("M -2 6 L 2 10") + line("M 6 -2 L 10 2");
        case "upDiag":
        case "ltUpDiag":
            return line("M 0 8 L 8 0") + line("M -2 2 L 2 -2") + line("M 6 10 L 10 6");
        case "dkDnDiag":
            return line("M 0 0 L 8 8", 2);
        case "dkUpDiag":
            return line("M 0 8 L 8 0", 2);
        case "wdDnDiag":
            return line("M -2 4 L 4 10") + line("M 4 -2 L 10 4");
        case "wdUpDiag":
            return line("M -2 4 L 4 -2") + line("M 4 10 L 10 4");
        case "diagCross":
            return line("M 0 0 L 8 8") + line("M 0 8 L 8 0");
        case "weave":
        case "trellis":
        case "smGrid":
        case "lgGrid":
            return line("M 0 4 L 8 4") + line("M 4 0 L 4 8");
        case "smCheck":
        case "lgCheck":
            return `<rect width="4" height="4" fill="${fg}" ${fgOp}/><rect x="4" y="4" width="4" height="4" fill="${fg}" ${fgOp}/>`;
        default:
            return dot(0, 0) + dot(2, 2) + dot(4, 4) + dot(6, 6);
    }
}
function ensureAdjustFilter(defs, adj) {
    const key = adjustCacheKey(adj);
    if (!key)
        return null;
    const id = `imgadj-${key}`;
    if (defs.querySelector(`#${CSS.escape(id)}`))
        return id;
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", "1");
    filter.setAttribute("height", "1");
    let lastIn = "SourceGraphic";
    if (adj.grayscale) {
        const fe = document.createElementNS(SVG_NS, "feColorMatrix");
        fe.setAttribute("type", "matrix");
        fe.setAttribute("in", lastIn);
        fe.setAttribute("values", "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0");
        fe.setAttribute("result", "fxGray");
        filter.appendChild(fe);
        lastIn = "fxGray";
    }
    if (adj.lum) {
        const b = adj.lum.bright ?? 0;
        const c = adj.lum.contrast ?? 0;
        const slope = 1 + c;
        const intercept = b - c / 2;
        const fe = document.createElementNS(SVG_NS, "feComponentTransfer");
        fe.setAttribute("in", lastIn);
        fe.setAttribute("result", "fxLum");
        for (const ch of ["feFuncR", "feFuncG", "feFuncB"]) {
            const f = document.createElementNS(SVG_NS, ch);
            f.setAttribute("type", "linear");
            f.setAttribute("slope", String(slope));
            f.setAttribute("intercept", String(intercept));
            fe.appendChild(f);
        }
        filter.appendChild(fe);
        lastIn = "fxLum";
    }
    if (adj.hsl) {
        const hue = adj.hsl.hue ?? 0;
        if (hue) {
            const rot = document.createElementNS(SVG_NS, "feColorMatrix");
            rot.setAttribute("type", "hueRotate");
            rot.setAttribute("in", lastIn);
            rot.setAttribute("values", String(hue));
            rot.setAttribute("result", "fxHue");
            filter.appendChild(rot);
            lastIn = "fxHue";
        }
        const sat = 1 + (adj.hsl.sat ?? 0);
        if (sat !== 1) {
            const s = document.createElementNS(SVG_NS, "feColorMatrix");
            s.setAttribute("type", "saturate");
            s.setAttribute("in", lastIn);
            s.setAttribute("values", String(sat));
            s.setAttribute("result", "fxSat");
            filter.appendChild(s);
            lastIn = "fxSat";
        }
    }
    if (adj.duotone) {
        const [c1, c2] = adj.duotone;
        const gray = document.createElementNS(SVG_NS, "feColorMatrix");
        gray.setAttribute("type", "matrix");
        gray.setAttribute("in", lastIn);
        gray.setAttribute("values", "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0");
        gray.setAttribute("result", "fxDuoG");
        filter.appendChild(gray);
        const rgb1 = parseHex(c1);
        const rgb2 = parseHex(c2);
        const mat = document.createElementNS(SVG_NS, "feColorMatrix");
        mat.setAttribute("type", "matrix");
        mat.setAttribute("in", "fxDuoG");
        const dr = rgb2[0] - rgb1[0];
        const dg = rgb2[1] - rgb1[1];
        const db = rgb2[2] - rgb1[2];
        mat.setAttribute("values", `${dr} 0 0 0 ${rgb1[0]} ${dg} 0 0 0 ${rgb1[1]} ${db} 0 0 0 ${rgb1[2]} 0 0 0 1 0`);
        mat.setAttribute("result", "fxDuo");
        filter.appendChild(mat);
        lastIn = "fxDuo";
    }
    if (adj.biLevel !== undefined) {
        const t = adj.biLevel;
        const gray = document.createElementNS(SVG_NS, "feColorMatrix");
        gray.setAttribute("type", "matrix");
        gray.setAttribute("in", lastIn);
        gray.setAttribute("values", "0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0");
        gray.setAttribute("result", "fxBiG");
        filter.appendChild(gray);
        const fe = document.createElementNS(SVG_NS, "feComponentTransfer");
        fe.setAttribute("in", "fxBiG");
        fe.setAttribute("result", "fxBi");
        for (const ch of ["feFuncR", "feFuncG", "feFuncB"]) {
            const f = document.createElementNS(SVG_NS, ch);
            f.setAttribute("type", "linear");
            f.setAttribute("slope", "1000");
            f.setAttribute("intercept", String(-t * 1000));
            fe.appendChild(f);
        }
        filter.appendChild(fe);
        lastIn = "fxBi";
    }
    if (adj.fillOverlay) {
        const rgb = parseHex(adj.fillOverlay.color);
        const flood = document.createElementNS(SVG_NS, "feFlood");
        flood.setAttribute("flood-color", `rgb(${Math.round(rgb[0] * 255)},${Math.round(rgb[1] * 255)},${Math.round(rgb[2] * 255)})`);
        flood.setAttribute("flood-opacity", adj.fillOverlay.blend === "over" ? "0.45" : "1");
        flood.setAttribute("result", "fxOvFlood");
        filter.appendChild(flood);
        const blend = document.createElementNS(SVG_NS, "feBlend");
        const mode = adj.fillOverlay.blend === "mult"
            ? "multiply"
            : adj.fillOverlay.blend === "screen"
                ? "screen"
                : adj.fillOverlay.blend === "darken"
                    ? "darken"
                    : adj.fillOverlay.blend === "lighten"
                        ? "lighten"
                        : "normal";
        blend.setAttribute("in", "fxOvFlood");
        blend.setAttribute("in2", lastIn);
        blend.setAttribute("mode", mode);
        blend.setAttribute("result", "fxOv");
        filter.appendChild(blend);
        lastIn = "fxOv";
    }
    if (adj.tint) {
        const hue = adj.tint.hue ?? 0;
        const amt = Math.max(0, Math.min(1, adj.tint.amount ?? 0));
        if (hue) {
            const rot = document.createElementNS(SVG_NS, "feColorMatrix");
            rot.setAttribute("type", "hueRotate");
            rot.setAttribute("in", lastIn);
            rot.setAttribute("values", String(hue * amt));
            rot.setAttribute("result", "fxTintH");
            filter.appendChild(rot);
            lastIn = "fxTintH";
        }
        if (amt) {
            const sat = document.createElementNS(SVG_NS, "feColorMatrix");
            sat.setAttribute("type", "saturate");
            sat.setAttribute("in", lastIn);
            sat.setAttribute("values", String(1 + amt));
            sat.setAttribute("result", "fxTintS");
            filter.appendChild(sat);
            lastIn = "fxTintS";
        }
    }
    if (adj.alphaMod !== undefined && adj.alphaMod < 1) {
        const fe = document.createElementNS(SVG_NS, "feColorMatrix");
        fe.setAttribute("type", "matrix");
        fe.setAttribute("in", lastIn);
        fe.setAttribute("values", `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${adj.alphaMod} 0`);
        filter.appendChild(fe);
    }
    defs.appendChild(filter);
    return id;
}
function adjustCacheKey(adj) {
    const parts = [];
    if (adj.grayscale)
        parts.push("g");
    if (adj.lum)
        parts.push(`l${adj.lum.bright ?? 0}_${adj.lum.contrast ?? 0}`);
    if (adj.hsl)
        parts.push(`h${adj.hsl.hue ?? 0}_${adj.hsl.sat ?? 0}_${adj.hsl.lum ?? 0}`);
    if (adj.duotone)
        parts.push(`d${adj.duotone[0]}_${adj.duotone[1]}`);
    if (adj.biLevel !== undefined)
        parts.push(`bi${adj.biLevel}`);
    if (adj.clrChange)
        parts.push(`cc${adj.clrChange.from}_${adj.clrChange.to}`);
    if (adj.fillOverlay)
        parts.push(`fo${adj.fillOverlay.color}_${adj.fillOverlay.blend ?? "over"}`);
    if (adj.tint)
        parts.push(`t${adj.tint.hue ?? 0}_${adj.tint.amount ?? 0}`);
    if (adj.alphaMod !== undefined)
        parts.push(`a${adj.alphaMod}`);
    if (parts.length === 0)
        return null;
    return parts.join("-").replace(/[^a-zA-Z0-9_-]/g, "_");
}
function parseHex(c) {
    const m = /^#?([0-9a-f]{6})$/i.exec(c);
    if (!m)
        return [0, 0, 0];
    const v = m[1];
    return [
        parseInt(v.slice(0, 2), 16) / 255,
        parseInt(v.slice(2, 4), 16) / 255,
        parseInt(v.slice(4, 6), 16) / 255,
    ];
}
// idPrefix 唯一标识"调用方 backend 实例"，用于给 <marker> 这类 *内容派生 id*
// （arr-end-triangle-…，多 backend 间会重名）加前缀。否则 url(#arr-…) 会按文档
// 顺序解析到第一个同名 marker——放映时该 marker 往往落在 display:none 的缩略图
// SVG 里（其 render tree 不构建 → marker 不解析），导致"舞台/缩略图箭头都在，
// 一放映就没了"。gradient 等用全局自增 id（pp-N）天然唯一，不受影响。
export function applyStroke(el, stroke, defs, idPrefix = "") {
    if (!stroke) {
        el.setAttribute("stroke", "none");
        el.removeAttribute("marker-start");
        el.removeAttribute("marker-end");
        return;
    }
    const p = renderPaint(stroke.paint, defs);
    el.setAttribute("stroke", p.paint);
    if (p.opacity !== undefined)
        el.setAttribute("stroke-opacity", String(p.opacity));
    el.setAttribute("stroke-width", String(stroke.width));
    if (stroke.dash)
        el.setAttribute("stroke-dasharray", stroke.dash.join(","));
    if (stroke.cap)
        el.setAttribute("stroke-linecap", stroke.cap);
    if (stroke.join)
        el.setAttribute("stroke-linejoin", stroke.join);
    const tag = el.tagName.toLowerCase();
    const supportsMarker = tag === "line" || tag === "path" || tag === "polyline";
    if (supportsMarker && stroke.headEnd) {
        const id = ensureArrowMarker(defs, markerFill(stroke), stroke.headEnd, "start", idPrefix);
        el.setAttribute("marker-start", `url(#${id})`);
    }
    else {
        el.removeAttribute("marker-start");
    }
    if (supportsMarker && stroke.tailEnd) {
        const id = ensureArrowMarker(defs, markerFill(stroke), stroke.tailEnd, "end", idPrefix);
        el.setAttribute("marker-end", `url(#${id})`);
    }
    else {
        el.removeAttribute("marker-end");
    }
}
function markerFill(stroke) {
    if (stroke.paint.kind === "solid")
        return stroke.paint.color;
    return "context-stroke";
}
function ensureArrowMarker(defs, color, end, side, idPrefix = "") {
    const { w, l } = arrowSize(end);
    const id = `${idPrefix}arr-${side}-${end.kind}-${end.w ?? "med"}-${end.len ?? "med"}-${color.replace(/[^\w]/g, "_")}`;
    if (defs.querySelector(`#${CSS.escape(id)}`))
        return id;
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", id);
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    marker.setAttribute("markerWidth", String(l));
    marker.setAttribute("markerHeight", String(w));
    // oval 的 path 用相对 arc，X 范围实际为 [-l/2, l/2]，需要把 viewBox 向左拓展。
    const vbX = end.kind === "oval" ? -l / 2 : 0;
    marker.setAttribute("viewBox", `${vbX} ${-w / 2} ${l} ${w}`);
    marker.setAttribute("refX", String(arrowRefX(end.kind, side, l)));
    marker.setAttribute("refY", "0");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", arrowPathD(end.kind, w, l, side));
    path.setAttribute("fill", color);
    // marker 内的 fill 不应再继承被指 line 的 stroke；显式置为 none 避免某些浏览器
    // 对 <marker> 透传父级 stroke 把箭头边描成线宽。
    path.setAttribute("stroke", "none");
    marker.appendChild(path);
    defs.appendChild(marker);
    return id;
}
