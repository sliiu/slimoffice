"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountInkOverlay = mountInkOverlay;
const ink_tool_1 = require("./ink-tool");
function mountInkOverlay(opts) {
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
    let mode = null;
    let penColor = "#111827";
    let penWidth = 3;
    let drawing = [];
    let activePointer = null;
    let docBound = false;
    const syncPreview = () => {
        if (drawing.length < 2) {
            preview.removeAttribute("d");
            return;
        }
        preview.setAttribute("d", (0, ink_tool_1.pointsToSvgPath)(drawing));
        if (mode === "pen" || mode === "highlighter") {
            const style = (0, ink_tool_1.inkStrokeStyle)(mode, penColor, penWidth);
            preview.setAttribute("stroke", style.color);
            preview.setAttribute("stroke-width", String(style.width));
            if (style.alpha < 1)
                preview.setAttribute("stroke-opacity", String(style.alpha));
            else
                preview.removeAttribute("stroke-opacity");
        }
    };
    const setActive = (on) => {
        svg.style.pointerEvents = on ? "auto" : "none";
        opts.stage.style.cursor = on
            ? mode === "eraser"
                ? "cell"
                : "crosshair"
            : "";
    };
    const unbindDoc = () => {
        if (!docBound)
            return;
        docBound = false;
        doc.removeEventListener("pointerup", onDocUp);
        doc.removeEventListener("pointercancel", onDocUp);
    };
    const finishStroke = () => {
        if (activePointer === null && drawing.length === 0)
            return;
        const pointerId = activePointer;
        const points = drawing;
        const strokeMode = mode;
        drawing = [];
        activePointer = null;
        syncPreview();
        unbindDoc();
        if (pointerId !== null) {
            try {
                if (svg.hasPointerCapture(pointerId))
                    svg.releasePointerCapture(pointerId);
            }
            catch {
                // ignore
            }
        }
        if (points.length >= 2 && (strokeMode === "pen" || strokeMode === "highlighter")) {
            opts.onStroke(points, strokeMode);
        }
    };
    const onDocUp = (e) => {
        if (activePointer !== e.pointerId)
            return;
        finishStroke();
    };
    const bindDoc = () => {
        if (docBound)
            return;
        docBound = true;
        doc.addEventListener("pointerup", onDocUp);
        doc.addEventListener("pointercancel", onDocUp);
    };
    const onPointerDown = (e) => {
        if (!mode || e.button !== 0)
            return;
        e.preventDefault();
        e.stopPropagation();
        if (activePointer !== null)
            finishStroke();
        activePointer = e.pointerId;
        try {
            svg.setPointerCapture(e.pointerId);
        }
        catch {
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
    const onPointerMove = (e) => {
        if (!mode || activePointer !== e.pointerId)
            return;
        // Mouse pointerId stays 1 after mouseup. Without this guard, hover continues the stroke.
        if ((e.buttons & 1) !== 1)
            return;
        e.preventDefault();
        e.stopPropagation();
        const pt = opts.screenToStage(e.clientX, e.clientY);
        if (mode === "eraser") {
            opts.onEraseAt(pt);
            return;
        }
        const last = drawing[drawing.length - 1];
        if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.5)
            return;
        drawing.push(pt);
        syncPreview();
    };
    const onPointerUp = (e) => {
        if (activePointer !== e.pointerId)
            return;
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
            if (activePointer !== null || drawing.length > 0)
                finishStroke();
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
