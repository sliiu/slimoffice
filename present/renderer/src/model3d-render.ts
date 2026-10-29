import type { Model3DShape } from "@ppt/core";
import { getImage } from "./paint-canvas";
import { getModel3DPreviewFrame } from "./model3d-frame";

export function model3DDisplaySrc(s: Model3DShape, onReady?: () => void): string | undefined {
  const frame = s.glbSrc ? getModel3DPreviewFrame(s, onReady) : null;
  return frame?.src ?? s.rasterSrc;
}

export function drawModel3DCanvas(
  ctx: CanvasRenderingContext2D,
  s: Model3DShape,
  onReady?: () => void,
): void {
  const { x, y, w, h } = s.bbox;
  const src = model3DDisplaySrc(s, onReady);
  ctx.save();
  if (src) {
    const img = getImage(src, onReady);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, w, h);
    if (img.complete && img.naturalWidth > 0) {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
  } else {
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

export function renderModel3DSvg(
  container: SVGGElement,
  s: Model3DShape,
  onReady?: () => void,
): void {
  while (container.firstChild) container.removeChild(container.firstChild);
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
  } else {
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
