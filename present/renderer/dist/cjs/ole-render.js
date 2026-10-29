"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.oleUsesPackagePreview = oleUsesPackagePreview;
exports.drawOleCanvas = drawOleCanvas;
exports.renderOleSvg = renderOleSvg;
const paint_canvas_1 = require("./paint-canvas");
const SVG_NS = "http://www.w3.org/2000/svg";
function truncateLabel(text, maxLen) {
    if (text.length <= maxLen)
        return text;
    return text.slice(0, Math.max(1, maxLen - 1)) + "…";
}
/** Full-bleed package preview (not icon mode). */
function oleUsesPackagePreview(s) {
    return Boolean(s.previewSrc && s.showAsIcon === false);
}
function oleLayout(bbox) {
    const { x, y, w, h } = bbox;
    const pad = Math.max(4, Math.min(w, h) * 0.06);
    const badgeSize = Math.min(w * 0.28, h * 0.55, 72);
    const badgeX = x + pad;
    const badgeY = y + (h - badgeSize) / 2;
    const textX = badgeX + badgeSize + pad;
    const textW = Math.max(0, x + w - pad - textX);
    return { pad, badgeSize, badgeX, badgeY, textX, textW, cx: x + w / 2, cy: y + h / 2 };
}
function drawPreviewBadge(ctx, s, x, y) {
    const badgeColor = s.badgeColor ?? "#64748b";
    const badgeText = s.badgeText ?? (s.previewKind === "pdf" ? "PDF" : "OLE");
    const size = 28;
    ctx.save();
    ctx.fillStyle = "rgba(15,23,42,0.55)";
    ctx.fillRect(x, y, size + 8, size + 8);
    ctx.fillStyle = badgeColor;
    if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 4, size, size, 4);
        ctx.fill();
    }
    else {
        ctx.fillRect(x + 4, y + 4, size, size);
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText.slice(0, 4), x + 4 + size / 2, y + 4 + size / 2);
    ctx.restore();
}
function drawOleImagePreview(ctx, s) {
    const { x, y, w, h } = s.bbox;
    const src = s.previewSrc;
    const img = (0, paint_canvas_1.getImage)(src);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, w, h);
    if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, w, h);
    }
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    drawPreviewBadge(ctx, s, x + 4, y + 4);
    ctx.restore();
}
function drawOlePdfCanvasPlaceholder(ctx, s) {
    const { x, y, w, h } = s.bbox;
    ctx.save();
    ctx.fillStyle = "#f1f5f9";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    const title = s.objectName ?? s.embedFileName ?? "PDF Document";
    ctx.fillStyle = "#0f172a";
    ctx.font = `600 ${Math.max(11, Math.min(16, h * 0.12))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(truncateLabel(title, 40), x + w / 2, y + h / 2 - 8);
    ctx.fillStyle = "#64748b";
    ctx.font = `${Math.max(9, h * 0.08)}px system-ui, sans-serif`;
    ctx.fillText("PDF preview (editor)", x + w / 2, y + h / 2 + 12);
    drawPreviewBadge(ctx, s, x + 4, y + 4);
    ctx.restore();
}
/** Canvas / export path: package preview or icon tile + filename. */
function drawOleCanvas(ctx, s) {
    if (oleUsesPackagePreview(s)) {
        if (s.previewKind === "image") {
            drawOleImagePreview(ctx, s);
            return;
        }
        if (s.previewKind === "pdf") {
            drawOlePdfCanvasPlaceholder(ctx, s);
            return;
        }
    }
    const { x, y, w, h } = s.bbox;
    const badgeColor = s.badgeColor ?? "#64748b";
    const badgeText = s.badgeText ?? "OLE";
    const title = s.objectName ?? s.embedFileName ?? "Embedded Object";
    const subtitle = s.isLinked ? `${s.typeLabel ?? "Object"} (linked)` : s.typeLabel ?? "Embedded Object";
    ctx.save();
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const rr = Math.min(w, h) * 0.08;
    if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, rr);
        ctx.fill();
        ctx.stroke();
    }
    else {
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.setLineDash([]);
    const layout = oleLayout(s.bbox);
    const showIcon = s.showAsIcon !== false && layout.textW > 8;
    if (showIcon) {
        const br = Math.min(layout.badgeSize * 0.18, 8);
        ctx.fillStyle = badgeColor;
        if (typeof ctx.roundRect === "function") {
            ctx.beginPath();
            ctx.roundRect(layout.badgeX, layout.badgeY, layout.badgeSize, layout.badgeSize, br);
            ctx.fill();
        }
        else {
            ctx.fillRect(layout.badgeX, layout.badgeY, layout.badgeSize, layout.badgeSize);
        }
        ctx.fillStyle = "#ffffff";
        const fs = Math.max(9, layout.badgeSize * 0.28);
        ctx.font = `bold ${fs}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, layout.badgeX + layout.badgeSize / 2, layout.badgeY + layout.badgeSize / 2);
    }
    const titleFs = Math.max(10, Math.min(16, h * 0.14));
    const subFs = Math.max(8, titleFs * 0.78);
    ctx.textAlign = showIcon ? "left" : "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0f172a";
    ctx.font = `600 ${titleFs}px system-ui, sans-serif`;
    const titleX = showIcon ? layout.textX : layout.cx;
    const titleMax = showIcon ? Math.floor(layout.textW / (titleFs * 0.55)) : Math.floor(w / (titleFs * 0.55));
    ctx.fillText(truncateLabel(title, Math.max(4, titleMax)), titleX, layout.cy - subFs * 0.55);
    ctx.fillStyle = "#64748b";
    ctx.font = `400 ${subFs}px system-ui, sans-serif`;
    const subMax = showIcon ? Math.floor(layout.textW / (subFs * 0.5)) : Math.floor(w / (subFs * 0.5));
    ctx.fillText(truncateLabel(subtitle, Math.max(6, subMax)), titleX, layout.cy + titleFs * 0.45);
    ctx.restore();
}
function appendPreviewBadgeSvg(container, s, x, y) {
    const badgeColor = s.badgeColor ?? "#64748b";
    const badgeText = s.badgeText ?? (s.previewKind === "pdf" ? "PDF" : "OLE");
    const tile = document.createElementNS(SVG_NS, "rect");
    tile.setAttribute("x", String(x + 4));
    tile.setAttribute("y", String(y + 4));
    tile.setAttribute("width", "28");
    tile.setAttribute("height", "28");
    tile.setAttribute("rx", "4");
    tile.setAttribute("fill", badgeColor);
    container.appendChild(tile);
    const badge = document.createElementNS(SVG_NS, "text");
    badge.setAttribute("x", String(x + 18));
    badge.setAttribute("y", String(y + 20));
    badge.setAttribute("fill", "#ffffff");
    badge.setAttribute("font-size", "10");
    badge.setAttribute("font-weight", "700");
    badge.setAttribute("text-anchor", "middle");
    badge.setAttribute("dominant-baseline", "middle");
    badge.textContent = badgeText.slice(0, 4);
    container.appendChild(badge);
}
/** SVG preview path — package preview via image / PDF embed, else icon placeholder. */
function renderOleSvg(container, s) {
    while (container.firstChild)
        container.removeChild(container.firstChild);
    const { x, y, w, h } = s.bbox;
    if (oleUsesPackagePreview(s) && s.previewSrc) {
        if (s.previewKind === "image") {
            const im = document.createElementNS(SVG_NS, "image");
            im.setAttribute("x", String(x));
            im.setAttribute("y", String(y));
            im.setAttribute("width", String(w));
            im.setAttribute("height", String(h));
            im.setAttribute("href", s.previewSrc);
            im.setAttributeNS("http://www.w3.org/1999/xlink", "href", s.previewSrc);
            im.setAttribute("preserveAspectRatio", "none");
            container.appendChild(im);
            const border = document.createElementNS(SVG_NS, "rect");
            border.setAttribute("x", String(x));
            border.setAttribute("y", String(y));
            border.setAttribute("width", String(w));
            border.setAttribute("height", String(h));
            border.setAttribute("fill", "none");
            border.setAttribute("stroke", "#94a3b8");
            border.setAttribute("stroke-width", "1");
            container.appendChild(border);
            appendPreviewBadgeSvg(container, s, x, y);
            return;
        }
        if (s.previewKind === "pdf") {
            const fo = document.createElementNS(SVG_NS, "foreignObject");
            fo.setAttribute("x", String(x));
            fo.setAttribute("y", String(y));
            fo.setAttribute("width", String(w));
            fo.setAttribute("height", String(h));
            const wrap = document.createElement("div");
            wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
            wrap.style.width = "100%";
            wrap.style.height = "100%";
            wrap.style.background = "#f8fafc";
            wrap.style.overflow = "hidden";
            const embed = document.createElement("embed");
            embed.src = s.previewSrc;
            embed.type = "application/pdf";
            embed.style.width = "100%";
            embed.style.height = "100%";
            embed.style.pointerEvents = "none";
            wrap.appendChild(embed);
            fo.appendChild(wrap);
            container.appendChild(fo);
            appendPreviewBadgeSvg(container, s, x, y);
            return;
        }
    }
    const badgeColor = s.badgeColor ?? "#64748b";
    const badgeText = s.badgeText ?? "OLE";
    const title = s.objectName ?? s.embedFileName ?? "Embedded Object";
    const subtitle = s.isLinked ? `${s.typeLabel ?? "Object"} (linked)` : s.typeLabel ?? "Embedded Object";
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", String(x));
    bg.setAttribute("y", String(y));
    bg.setAttribute("width", String(w));
    bg.setAttribute("height", String(h));
    bg.setAttribute("rx", String(Math.min(w, h) * 0.08));
    bg.setAttribute("fill", "#f8fafc");
    bg.setAttribute("stroke", "#94a3b8");
    bg.setAttribute("stroke-width", "1");
    bg.setAttribute("stroke-dasharray", "4 3");
    container.appendChild(bg);
    const layout = oleLayout(s.bbox);
    const showIcon = s.showAsIcon !== false && layout.textW > 8;
    if (showIcon) {
        const tile = document.createElementNS(SVG_NS, "rect");
        tile.setAttribute("x", String(layout.badgeX));
        tile.setAttribute("y", String(layout.badgeY));
        tile.setAttribute("width", String(layout.badgeSize));
        tile.setAttribute("height", String(layout.badgeSize));
        tile.setAttribute("rx", String(Math.min(layout.badgeSize * 0.18, 8)));
        tile.setAttribute("fill", badgeColor);
        container.appendChild(tile);
        const badge = document.createElementNS(SVG_NS, "text");
        badge.setAttribute("x", String(layout.badgeX + layout.badgeSize / 2));
        badge.setAttribute("y", String(layout.badgeY + layout.badgeSize / 2));
        badge.setAttribute("fill", "#ffffff");
        badge.setAttribute("font-size", String(Math.max(9, layout.badgeSize * 0.28)));
        badge.setAttribute("font-weight", "700");
        badge.setAttribute("text-anchor", "middle");
        badge.setAttribute("dominant-baseline", "middle");
        badge.textContent = badgeText;
        container.appendChild(badge);
    }
    const titleFs = Math.max(10, Math.min(16, h * 0.14));
    const subFs = Math.max(8, titleFs * 0.78);
    const titleX = showIcon ? layout.textX : layout.cx;
    const titleEl = document.createElementNS(SVG_NS, "text");
    titleEl.setAttribute("x", String(titleX));
    titleEl.setAttribute("y", String(layout.cy - subFs * 0.55));
    titleEl.setAttribute("fill", "#0f172a");
    titleEl.setAttribute("font-size", String(titleFs));
    titleEl.setAttribute("font-weight", "600");
    titleEl.setAttribute("text-anchor", showIcon ? "start" : "middle");
    titleEl.setAttribute("dominant-baseline", "middle");
    titleEl.textContent = truncateLabel(title, 48);
    container.appendChild(titleEl);
    const subEl = document.createElementNS(SVG_NS, "text");
    subEl.setAttribute("x", String(titleX));
    subEl.setAttribute("y", String(layout.cy + titleFs * 0.45));
    subEl.setAttribute("fill", "#64748b");
    subEl.setAttribute("font-size", String(subFs));
    subEl.setAttribute("text-anchor", showIcon ? "start" : "middle");
    subEl.setAttribute("dominant-baseline", "middle");
    subEl.textContent = truncateLabel(subtitle, 56);
    container.appendChild(subEl);
}
