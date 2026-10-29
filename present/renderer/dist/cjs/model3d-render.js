"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.model3DDisplaySrc = model3DDisplaySrc;
exports.drawModel3DCanvas = drawModel3DCanvas;
exports.renderModel3DSvg = renderModel3DSvg;
const paint_canvas_1 = require("./paint-canvas");
const model3d_frame_1 = require("./model3d-frame");
function model3DDisplaySrc(s, onReady) {
    const frame = s.glbSrc ? (0, model3d_frame_1.getModel3DPreviewFrame)(s, onReady) : null;
    return frame?.src ?? s.rasterSrc;
}
function drawModel3DCanvas(ctx, s, onReady) {
    const { x, y, w, h } = s.bbox;
    const src = model3DDisplaySrc(s, onReady);
    ctx.save();
    if (src) {
        const img = (0, paint_canvas_1.getImage)(src, onReady);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, w, h);
        if (img.complete && img.naturalWidth > 0) {
            const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        }
    }
    else {
        ctx.fillStyle = "#e2e8f0";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#475569";
        ctx.font = `600 ${Math.max(11, Math.min(16, h * 0.12))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.objectName ?? "3D Model", x + w / 2, y + h / 2);
    }
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.restore();
}
const SVG_NS = "http://www.w3.org/2000/svg";
function renderModel3DSvg(container, s, onReady) {
    while (container.firstChild)
        container.removeChild(container.firstChild);
    const { x, y, w, h } = s.bbox;
    const src = model3DDisplaySrc(s, onReady);
    if (src) {
        const im = document.createElementNS(SVG_NS, "image");
        im.setAttribute("x", String(x));
        im.setAttribute("y", String(y));
        im.setAttribute("width", String(w));
        im.setAttribute("height", String(h));
        im.setAttribute("href", src);
        im.setAttributeNS("http://www.w3.org/1999/xlink", "href", src);
        im.setAttribute("preserveAspectRatio", "xMidYMid slice");
        container.appendChild(im);
    }
    else {
        const bg = document.createElementNS(SVG_NS, "rect");
        bg.setAttribute("x", String(x));
        bg.setAttribute("y", String(y));
        bg.setAttribute("width", String(w));
        bg.setAttribute("height", String(h));
        bg.setAttribute("fill", "#e2e8f0");
        bg.setAttribute("stroke", "#94a3b8");
        container.appendChild(bg);
        const label = document.createElementNS(SVG_NS, "text");
        label.setAttribute("x", String(x + w / 2));
        label.setAttribute("y", String(y + h / 2));
        label.setAttribute("fill", "#475569");
        label.setAttribute("font-size", String(Math.max(11, Math.min(16, h * 0.12))));
        label.setAttribute("font-weight", "600");
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("dominant-baseline", "middle");
        label.textContent = s.objectName ?? "3D Model";
        container.appendChild(label);
    }
}
