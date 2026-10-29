"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeEquationDescr = encodeEquationDescr;
exports.decodeEquationDescr = decodeEquationDescr;
exports.renderEquationToDataUrl = renderEquationToDataUrl;
exports.rasterizeEquationShapesInPlace = rasterizeEquationShapesInPlace;
exports.openEquationDialog = openEquationDialog;
/// <reference path="./css.d.ts" />
const katex_1 = __importDefault(require("katex"));
require("katex/dist/katex.min.css");
const core_1 = require("@sliiu/present-core");
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const EQ_DESCR_PREFIX = "ppt-equation:";
function encodeEquationDescr(latex, displayMode) {
    return `${EQ_DESCR_PREFIX}${displayMode ? "block:" : "inline:"}${encodeURIComponent(latex)}`;
}
function decodeEquationDescr(descr) {
    if (!descr?.startsWith(EQ_DESCR_PREFIX))
        return null;
    const rest = descr.slice(EQ_DESCR_PREFIX.length);
    const modeSep = rest.indexOf(":");
    if (modeSep < 0)
        return null;
    const mode = rest.slice(0, modeSep);
    const latex = decodeURIComponent(rest.slice(modeSep + 1));
    return { latex, displayMode: mode === "block" };
}
/** 将 LaTeX 渲染为 PNG data URL（插入 image shape）。Office 不渲染 foreignObject SVG。 */
async function renderEquationToDataUrl(doc, latex, opts = {}) {
    const displayMode = opts.displayMode ?? false;
    const color = opts.color ?? "#111827";
    const fontSize = opts.fontSize ?? (displayMode ? 28 : 22);
    const host = doc.createElement("div");
    host.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `font-size:${fontSize}px`,
        `color:${color}`,
        "padding:0",
        "margin:0",
        "background:transparent",
        "line-height:1",
        "display:inline-block",
        "white-space:nowrap",
    ].join(";");
    doc.body.appendChild(host);
    try {
        host.innerHTML = katex_1.default.renderToString(latex, {
            throwOnError: false,
            displayMode,
            output: "html",
        });
    }
    catch {
        host.textContent = latex;
    }
    host.querySelectorAll(".katex-mathml, annotation").forEach((n) => n.remove());
    host.querySelectorAll(".katex-display").forEach((n) => {
        n.style.margin = "0";
    });
    await waitForLayout(doc, host);
    const target = (host.querySelector(".katex") ?? host);
    const painted = paintLiveKatex(target);
    const src = painted ?? latexFallbackPng(doc, latex, 160, 48, color, fontSize);
    host.remove();
    return src;
}
/**
 * 打开 / 保存时按 LaTeX 重渲公式图，并去掉旧插入路径多出来的 padding 拉伸。
 */
async function rasterizeEquationShapesInPlace(pres, doc) {
    const visit = async (shapes) => {
        for (const s of shapes) {
            if (s.kind === "group") {
                await visit(s.children);
                continue;
            }
            if (s.kind !== "image")
                continue;
            const eq = decodeEquationDescr(s.descr);
            if (!eq)
                continue;
            const { src, natural } = await renderEquationToDataUrl(doc, eq.latex, {
                displayMode: eq.displayMode,
            });
            if (s.src !== src) {
                s.src = src;
                (0, core_1.markDirty)(s, "src");
            }
            s.natural = natural;
            s.lockAspect = true;
            const cx = s.bbox.x + s.bbox.w / 2;
            const cy = s.bbox.y + s.bbox.h / 2;
            const sx = s.bbox.w / natural.w;
            const sy = s.bbox.h / natural.h;
            const aspectOff = Number.isFinite(sx) && Number.isFinite(sy) && Math.abs(sx - sy) > 0.01;
            const nearNative = Math.abs(s.bbox.w - natural.w) <= 24 && Math.abs(s.bbox.h - natural.h) <= 24;
            if (nearNative || aspectOff) {
                const k = nearNative ? 1 : (Math.min(sx, sy) || 1);
                const w = natural.w * k;
                const h = natural.h * k;
                if (Math.abs(s.bbox.w - w) > 0.5 || Math.abs(s.bbox.h - h) > 0.5) {
                    s.bbox = { x: cx - w / 2, y: cy - h / 2, w, h };
                    (0, core_1.markDirty)(s, "bbox");
                }
            }
        }
    };
    for (const slide of pres.slides) {
        for (const layer of slide.layers)
            await visit(layer.shapes);
    }
}
async function waitForLayout(doc, host) {
    const fonts = doc.fonts;
    if (fonts?.load) {
        const faces = new Set();
        for (const el of [host, ...Array.from(host.querySelectorAll("*"))]) {
            const cs = doc.defaultView?.getComputedStyle(el);
            if (!cs)
                continue;
            faces.add(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
        }
        await Promise.all([...faces].map((f) => fonts.load(f).catch(() => undefined)));
    }
    try {
        await fonts?.ready;
    }
    catch {
        /* fonts.ready 在部分环境会拒 */
    }
    await new Promise((resolve) => {
        const raf = doc.defaultView?.requestAnimationFrame ?? requestAnimationFrame;
        raf.call(doc.defaultView ?? window, () => {
            raf.call(doc.defaultView ?? window, () => resolve());
        });
    });
}
function paintLiveKatex(target) {
    const doc = target.ownerDocument;
    const view = doc.defaultView;
    if (!view)
        return null;
    const box = inkBox(target);
    const scale = Math.max(2, Math.round(view.devicePixelRatio || 2));
    // 整数 CSS 尺寸，保证 PNG 像素比和 bbox 完全一致；不要 ctx.scale()+fillText，
    // 否则部分浏览器会把字形拉变形。多留一圈再按像素裁切，避免 strut / 基线误差
    // 把公式挤到框的上半或下半。
    const cssW = Math.max(1, Math.ceil(box.w));
    const cssH = Math.max(1, Math.ceil(box.h));
    const canvas = doc.createElement("canvas");
    canvas.width = cssW * scale;
    canvas.height = cssH * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const origin = { left: box.x, top: box.y };
    const baselines = new Map();
    paintElement(ctx, target, origin, baselines, scale);
    if (canvasIsBlank(ctx, canvas))
        return null;
    return cropToInk(canvas, ctx, scale, 2) ?? {
        src: canvas.toDataURL("image/png"),
        natural: { w: cssW, h: cssH },
    };
}
function inkBox(el) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (r) => {
        if (r.width <= 0 && r.height <= 0)
            return;
        minX = Math.min(minX, r.left);
        minY = Math.min(minY, r.top);
        maxX = Math.max(maxX, r.right);
        maxY = Math.max(maxY, r.bottom);
    };
    const range = el.ownerDocument.createRange();
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (!node.textContent)
            continue;
        range.selectNodeContents(node);
        add(range.getBoundingClientRect());
    }
    el.querySelectorAll("*").forEach((child) => {
        if (hasVisiblePaint(child))
            add(child.getBoundingClientRect());
    });
    if (!Number.isFinite(minX)) {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: Math.max(1, r.width), h: Math.max(1, r.height) };
    }
    // 比 CSS 墨水再放大一圈：canvas fillText 基线可能和 DOM 差几像素，避免裁切。
    const pad = 8;
    return { x: minX - pad, y: minY - pad, w: Math.max(1, maxX - minX + pad * 2), h: Math.max(1, maxY - minY + pad * 2) };
}
function hasVisiblePaint(el) {
    const tag = el.tagName;
    if (tag === "SVG" || tag === "IMG" || tag === "CANVAS" || tag === "PATH")
        return true;
    const view = el.ownerDocument.defaultView;
    const cs = view?.getComputedStyle(el);
    if (!cs)
        return false;
    const bg = cs.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)" && !bg.endsWith(", 0)"))
        return true;
    const sides = ["Top", "Right", "Bottom", "Left"];
    for (const side of sides) {
        const width = parseFloat(cs[`border${side}Width`]) || 0;
        const style = cs[`border${side}Style`];
        if (width > 0 && style !== "none")
            return true;
    }
    return false;
}
function cropToInk(canvas, ctx, scale, padCss) {
    const { width, height } = canvas;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    try {
        const { data } = ctx.getImageData(0, 0, width, height);
        for (let y = 0; y < height; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
                if ((data[(row + x) * 4 + 3] ?? 0) > 8) {
                    if (x < minX)
                        minX = x;
                    if (y < minY)
                        minY = y;
                    if (x > maxX)
                        maxX = x;
                    if (y > maxY)
                        maxY = y;
                }
            }
        }
    }
    catch {
        return null;
    }
    if (maxX < 0)
        return null;
    const pad = Math.max(0, Math.round(padCss * scale));
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const cssW = Math.max(1, Math.round(cw / scale));
    const cssH = Math.max(1, Math.round(ch / scale));
    const out = canvas.ownerDocument.createElement("canvas");
    out.width = cssW * scale;
    out.height = cssH * scale;
    const octx = out.getContext("2d");
    if (!octx)
        return null;
    const dx = Math.round((out.width - cw) / 2);
    const dy = Math.round((out.height - ch) / 2);
    octx.drawImage(canvas, minX, minY, cw, ch, dx, dy, cw, ch);
    return { src: out.toDataURL("image/png"), natural: { w: cssW, h: cssH } };
}
function paintElement(ctx, el, origin, baselines, scale) {
    const view = el.ownerDocument.defaultView;
    const cs = view?.getComputedStyle(el);
    if (!cs || cs.display === "none" || cs.visibility === "hidden")
        return;
    const opacity = parseFloat(cs.opacity);
    if (opacity === 0)
        return;
    const r = el.getBoundingClientRect();
    const x = (r.left - origin.left) * scale;
    const y = (r.top - origin.top) * scale;
    const clipped = cs.overflow === "hidden" || cs.overflowX === "hidden" || cs.overflowY === "hidden";
    ctx.save();
    if (opacity < 1)
        ctx.globalAlpha *= opacity;
    if (clipped) {
        ctx.beginPath();
        ctx.rect(x, y, r.width * scale, r.height * scale);
        ctx.clip();
    }
    const bg = cs.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)" && !bg.endsWith(", 0)")) {
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, r.width * scale, r.height * scale);
    }
    paintBorders(ctx, cs, x, y, r.width * scale, r.height * scale);
    for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE)
            paintTextNode(ctx, child, origin, baselines, scale);
        else if (child.nodeType === Node.ELEMENT_NODE)
            paintElement(ctx, child, origin, baselines, scale);
    }
    ctx.restore();
}
function paintBorders(ctx, cs, x, y, w, h) {
    const top = parseFloat(cs.borderTopWidth) || 0;
    const right = parseFloat(cs.borderRightWidth) || 0;
    const bottom = parseFloat(cs.borderBottomWidth) || 0;
    const left = parseFloat(cs.borderLeftWidth) || 0;
    if (top > 0 && cs.borderTopStyle !== "none") {
        ctx.fillStyle = cs.borderTopColor;
        ctx.fillRect(x, y, w, top);
    }
    if (bottom > 0 && cs.borderBottomStyle !== "none") {
        ctx.fillStyle = cs.borderBottomColor;
        ctx.fillRect(x, y + h - bottom, w, bottom);
    }
    if (left > 0 && cs.borderLeftStyle !== "none") {
        ctx.fillStyle = cs.borderLeftColor;
        ctx.fillRect(x, y, left, h);
    }
    if (right > 0 && cs.borderRightStyle !== "none") {
        ctx.fillStyle = cs.borderRightColor;
        ctx.fillRect(x + w - right, y, right, h);
    }
}
function paintTextNode(ctx, node, origin, baselines, scale) {
    const text = node.textContent ?? "";
    if (!text)
        return;
    const parent = node.parentElement;
    if (!parent)
        return;
    const view = parent.ownerDocument.defaultView;
    const cs = view?.getComputedStyle(parent);
    if (!cs || cs.display === "none" || cs.visibility === "hidden")
        return;
    if (parseFloat(cs.opacity) === 0)
        return;
    const range = parent.ownerDocument.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0)
        return;
    ctx.save();
    ctx.fillStyle = cs.color;
    ctx.font = canvasFont(cs, scale);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const baseline = readAlphabeticBaseline(parent, baselines);
    ctx.fillText(text, (r.left - origin.left) * scale, (baseline - origin.top) * scale);
    ctx.restore();
}
function canvasFont(cs, scale) {
    const size = parseFloat(cs.fontSize) * scale;
    return `${cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`;
}
/** 0×0 baseline probe：span.top 就是该元素的 alphabetic 基线（视口坐标）。 */
function readAlphabeticBaseline(el, cache) {
    const hit = cache.get(el);
    if (hit !== undefined)
        return hit;
    const probe = el.ownerDocument.createElement("span");
    probe.style.cssText =
        "display:inline-block;width:1px;height:0;vertical-align:baseline;overflow:hidden;padding:0;margin:0;border:0";
    el.appendChild(probe);
    const y = probe.getBoundingClientRect().top;
    probe.remove();
    cache.set(el, y);
    return y;
}
function canvasIsBlank(ctx, canvas) {
    try {
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 3; i < data.length; i += 16) {
            if ((data[i] ?? 0) > 8)
                return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
function latexFallbackPng(doc, latex, w, h, color, fontSize) {
    const canvas = doc.createElement("canvas");
    const scale = 2;
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return { src: "data:image/png;base64,", natural: { w, h } };
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = color;
    ctx.font = `italic ${fontSize}px "Times New Roman", serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(latex, 12, h / 2);
    return { src: canvas.toDataURL("image/png"), natural: { w, h } };
}
/** Insert → Equation：KaTeX 公式编辑器。 */
function openEquationDialog(doc, initial) {
    return (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("dialog.equation.title"),
        width: 520,
        buildBody: (body) => {
            const hint = doc.createElement("p");
            hint.textContent = (0, i18n_1.t)("dialog.equation.hint");
            hint.style.cssText = "margin:0 0 10px;color:var(--muted-foreground);font-size:12px;line-height:1.5";
            body.appendChild(hint);
            const latexLbl = doc.createElement("label");
            latexLbl.textContent = (0, i18n_1.t)("dialog.equation.latexLabel");
            latexLbl.style.cssText = "display:block;margin-bottom:4px;font-size:11px;color:var(--muted-foreground);text-transform:uppercase";
            body.appendChild(latexLbl);
            const latexArea = doc.createElement("textarea");
            latexArea.value = initial?.latex ?? "E = mc^2";
            latexArea.rows = 3;
            latexArea.spellcheck = false;
            latexArea.style.cssText =
                "width:100%;box-sizing:border-box;background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:4px;padding:8px;font:13px/1.5 ui-monospace,monospace;resize:vertical";
            body.appendChild(latexArea);
            const modeRow = doc.createElement("label");
            modeRow.style.cssText = "display:flex;align-items:center;gap:8px;margin:10px 0;cursor:pointer;font-size:12px";
            const modeCb = doc.createElement("input");
            modeCb.type = "checkbox";
            modeCb.checked = initial?.displayMode ?? false;
            modeRow.append(modeCb, doc.createTextNode((0, i18n_1.t)("dialog.equation.displayMode")));
            body.appendChild(modeRow);
            const previewLbl = doc.createElement("div");
            previewLbl.textContent = (0, i18n_1.t)("dialog.equation.preview");
            previewLbl.style.cssText = "margin:8px 0 4px;font-size:11px;color:var(--muted-foreground);text-transform:uppercase";
            body.appendChild(previewLbl);
            const preview = doc.createElement("div");
            preview.style.cssText =
                "min-height:72px;padding:12px;border:1px solid var(--border);border-radius:6px;background:#fff;color:#111827;overflow:auto;display:flex;align-items:center;justify-content:center";
            body.appendChild(preview);
            const syncPreview = () => {
                preview.replaceChildren();
                try {
                    katex_1.default.render(latexArea.value, preview, {
                        throwOnError: false,
                        displayMode: modeCb.checked,
                        output: "html",
                    });
                    preview.querySelectorAll(".katex-display").forEach((n) => {
                        n.style.margin = "0";
                    });
                }
                catch (e) {
                    preview.textContent = e.message;
                }
            };
            syncPreview();
            latexArea.addEventListener("input", syncPreview);
            modeCb.addEventListener("change", syncPreview);
            return () => {
                const latex = latexArea.value.trim();
                if (!latex)
                    return null;
                return { latex, displayMode: modeCb.checked, color: "#111827" };
            };
        },
    });
}
