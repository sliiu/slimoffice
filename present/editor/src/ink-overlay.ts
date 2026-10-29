import type { InkMode, InkPoint } from "./ink-tool";
import { inkStrokeStyle, pointsToSvgPath } from "./ink-tool";

export interface InkOverlayHandle {
  setMode(mode: InkMode | null): void;
  setPenColor(color: string): void;
  setPenWidth(width: number): void;
  bringToFront(): void;
  destroy(): void;
}

export interface InkOverlayOptions {
  stage: HTMLElement;
  slideW: number;
  slideH: number;
  screenToStage: (clientX: number, clientY: number) => InkPoint;
  onStroke: (points: InkPoint[], mode: "pen" | "highlighter") => void;
  onEraseAt: (pt: InkPoint) => void;
}

export function mountInkOverlay(opts: InkOverlayOptions): InkOverlayHandle {
  const doc = opts.stage.ownerDocument;
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${opts.slideW} ${opts.slideH}`);
  svg.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;overflow:visible;touch-action:none";
  const preview = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  preview.setAttribute("fill", "none");
  preview.setAttribute("stroke-linecap", "round");
  preview.setAttribute("stroke-linejoin", "round");
  svg.appendChild(preview);
  opts.stage.appendChild(svg);

  let mode: InkMode | null = null;
  let penColor = "#111827";
  let penWidth = 3;
  let drawing: InkPoint[] = [];
  let activePointer: number | null = null;
  let docBound = false;

  const syncPreview = (): void => {
    if (drawing.length < 2) {
      preview.removeAttribute("d");
      return;
    }
    preview.setAttribute("d", pointsToSvgPath(drawing));
    if (mode === "pen" || mode === "highlighter") {
      const style = inkStrokeStyle(mode, penColor, penWidth);
      preview.setAttribute("stroke", style.color);
      preview.setAttribute("stroke-width", String(style.width));
      if (style.alpha < 1) preview.setAttribute("stroke-opacity", String(style.alpha));
      else preview.removeAttribute("stroke-opacity");
    }
  };

  const setActive = (on: boolean): void => {
    svg.style.pointerEvents = on ? "auto" : "none";
    opts.stage.style.cursor = on
      ? mode === "eraser"
        ? "cell"
        : "crosshair"
      : "";
  };

  const unbindDoc = (): void => {
    if (!docBound) return;
    docBound = false;
    doc.removeEventListener("pointerup", onDocUp);
    doc.removeEventListener("pointercancel", onDocUp);
  };

  const finishStroke = (): void => {
    if (activePointer === null && drawing.length === 0) return;
    const pointerId = activePointer;
    const points = drawing;
    const strokeMode = mode;
    drawing = [];
    activePointer = null;
    syncPreview();
    unbindDoc();
    if (pointerId !== null) {
      try {
        if (svg.hasPointerCapture(pointerId)) svg.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
    if (points.length >= 2 && (strokeMode === "pen" || strokeMode === "highlighter")) {
      opts.onStroke(points, strokeMode);
    }
  };

  const onDocUp = (e: PointerEvent): void => {
    if (activePointer !== e.pointerId) return;
    finishStroke();
  };

  const bindDoc = (): void => {
    if (docBound) return;
    docBound = true;
    doc.addEventListener("pointerup", onDocUp);
    doc.addEventListener("pointercancel", onDocUp);
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (!mode || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (activePointer !== null) finishStroke();
    activePointer = e.pointerId;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // capture is optional; document pointerup is the fallback
    }
    bindDoc();
    const pt = opts.screenToStage(e.clientX, e.clientY);
    if (mode === "eraser") {
      opts.onEraseAt(pt);
      return;
    }
    drawing = [pt];
    syncPreview();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!mode || activePointer !== e.pointerId) return;
    // Mouse pointerId stays 1 after mouseup. Without this guard, hover continues the stroke.
    if ((e.buttons & 1) !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    const pt = opts.screenToStage(e.clientX, e.clientY);
    if (mode === "eraser") {
      opts.onEraseAt(pt);
      return;
    }
    const last = drawing[drawing.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.5) return;
    drawing.push(pt);
    syncPreview();
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (activePointer !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    finishStroke();
  };

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);
  svg.addEventListener("lostpointercapture", onPointerUp);

  return {
    setMode(next) {
      if (activePointer !== null || drawing.length > 0) finishStroke();
      mode = next;
      drawing = [];
      activePointer = null;
      syncPreview();
      setActive(next !== null);
    },
    setPenColor(color) {
      penColor = color;
      syncPreview();
    },
    setPenWidth(width) {
      penWidth = Math.max(1, width);
      syncPreview();
    },
    bringToFront() {
      opts.stage.appendChild(svg);
    },
    destroy() {
      unbindDoc();
      svg.remove();
      opts.stage.style.cursor = "";
    },
  };
}
