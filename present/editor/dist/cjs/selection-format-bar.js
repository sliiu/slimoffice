"use strict";
// 选区旁的短格式条。按元素类型换控件，同一时刻只显示一套，不进底部「常用」行。
// 每次选中都会出现，所以本身不做进出动画。
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORMAT_BAR_ZOOM_OUT = exports.FORMAT_BAR_ZOOM_IN = void 0;
exports.formatSubject = formatSubject;
exports.selectionFormatMode = selectionFormatMode;
exports.formatBarPosition = formatBarPosition;
exports.mountSelectionFormatBar = mountSelectionFormatBar;
exports.scaleRectAboutCenter = scaleRectAboutCenter;
const font_size_1 = require("./font-size");
const icon_picker_dialog_1 = require("./icon-picker-dialog");
const icons_1 = require("./icons");
const FILLABLE = new Set(["rect", "ellipse", "path", "polygon"]);
/** 选中对象落到哪一套格式条。单元格是文字；表格是带 tableMeta 的编组。 */
function formatSubject(shape) {
    if (shape.smartArtMeta)
        return "other";
    if (shape.kind === "group" && shape.tableMeta)
        return "table";
    if (shape.kind === "text" || shape.cellMeta)
        return "text";
    if (shape.kind === "line")
        return "line";
    if (shape.kind === "image")
        return (0, icon_picker_dialog_1.decodeIconDescr)(shape.descr) ? "icon" : "image";
    if (FILLABLE.has(shape.kind))
        return "shape";
    return "other";
}
function selectionFormatMode(input) {
    if (input.dragging || input.view !== "normal")
        return { kind: "hidden" };
    if (input.background)
        return { kind: "hidden" };
    if (input.editingText)
        return { kind: "text" };
    const subjects = input.subjects;
    if (subjects.length < 1)
        return { kind: "hidden" };
    const first = subjects[0];
    if (first === "other" || subjects.some((s) => s !== first))
        return { kind: "hidden" };
    if (first === "text")
        return { kind: "text" };
    if (first === "line")
        return { kind: "line" };
    if (first === "image")
        return { kind: "image" };
    if (first === "icon")
        return { kind: "icon" };
    if (first === "table")
        return { kind: "table" };
    return {
        kind: "shape",
        align: subjects.length >= 2,
        distribute: subjects.length >= 3,
    };
}
function intersectRect(a, b) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const right = Math.min(a.right, b.right);
    const bottom = Math.min(a.bottom, b.bottom);
    if (right <= left || bottom <= top)
        return null;
    return { left, top, right, bottom };
}
/**
 * 按选区在可视画布里还能看见的那一段摆放。优先放在上方；上方出了画布就改到下方。
 * 整条留在画布内，放大后不会盖到缩略图列、顶栏或属性栏。选区完全离开画布则不放。
 * 条比画布宽时贴着画布左缘，避免盖住左侧幻灯片列。
 */
function formatBarPosition(input) {
    const { anchor, view, bar, viewport } = input;
    const gap = input.gap ?? 8;
    const margin = input.margin ?? 8;
    const visible = intersectRect(anchor, view);
    if (!visible || bar.w <= 0 || bar.h <= 0)
        return null;
    let left = (visible.left + visible.right) / 2 - bar.w / 2;
    const above = visible.top - gap - bar.h;
    const below = visible.bottom + gap;
    let top;
    if (input.prefer === "below")
        top = below + bar.h > view.bottom - margin ? above : below;
    else
        top = above < view.top + margin ? below : above;
    const minLeft = Math.max(margin, view.left + margin);
    const maxLeft = Math.min(viewport.w - bar.w - margin, view.right - bar.w - margin);
    const minTop = Math.max(margin, view.top + margin);
    const maxTop = Math.min(viewport.h - bar.h - margin, view.bottom - bar.h - margin);
    left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
    top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));
    return { left, top };
}
function mountSelectionFormatBar(doc, actions) {
    const el = doc.createElement("div");
    el.className = "ppt-selection-format";
    el.dataset.pptSelectionFormat = "1";
    el.setAttribute("role", "toolbar");
    el.setAttribute("aria-label", actions.label("toolbar.formatBar"));
    el.addEventListener("mousedown", (ev) => {
        const target = ev.target;
        if (target?.closest("input"))
            return;
        ev.preventDefault();
    });
    // 系统数字框的箭头在这条上按住不会连加（祖先 user-select: none，改值时条还会重排）。
    // 箭头是自己的按钮：按下立刻一步，停一下再按住连改。按住期间不挪条，松手再跟选区。
    let stepperHeld = false;
    let spinOwnsLive = false;
    let lastView = null;
    let repeatKick = 0;
    let repeatTimer = 0;
    const stopRepeat = () => {
        const win = doc.defaultView;
        if (repeatKick)
            win?.clearTimeout(repeatKick);
        if (repeatTimer)
            win?.clearInterval(repeatTimer);
        repeatKick = 0;
        repeatTimer = 0;
    };
    const releaseStepper = () => {
        const owns = spinOwnsLive;
        spinOwnsLive = false;
        stopRepeat();
        if (owns)
            actions.liveEnd();
        if (!stepperHeld)
            return;
        stepperHeld = false;
        if (lastView)
            sync(lastView);
    };
    doc.addEventListener("pointerup", releaseStepper);
    doc.addEventListener("pointercancel", releaseStepper);
    const textSec = doc.createElement("div");
    textSec.className = "ppt-selection-format-sec";
    textSec.dataset.section = "text";
    const sizeInput = doc.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "6";
    sizeInput.max = "96";
    sizeInput.className = "ppt-selection-format-size";
    sizeInput.title = actions.label("ribbon.font.size");
    sizeInput.setAttribute("aria-label", actions.label("ribbon.font.size"));
    sizeInput.addEventListener("focus", () => actions.liveStart());
    sizeInput.addEventListener("input", () => {
        const raw = sizeInput.value.trim();
        if (raw === "" || raw === "-" || raw === ".")
            return;
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0)
            actions.applyFontSize((0, font_size_1.fontPxFromPt)(n));
    });
    sizeInput.addEventListener("blur", () => actions.liveEnd());
    const boldBtn = iconBtn(doc, "bold", actions.label("ribbon.font.bold"), () => actions.toggleBold());
    const live = { start: () => actions.liveStart(), end: () => actions.liveEnd() };
    const textColor = colorInput(doc, actions.label("ribbon.font.color"), "#111827", actions.applyTextColor, live, "text");
    const alignStart = iconBtn(doc, "text-align-start", actions.label("ribbon.align.left"), () => actions.applyAlign("start"));
    const alignMiddle = iconBtn(doc, "text-align-center", actions.label("ribbon.align.center"), () => actions.applyAlign("middle"));
    const bulletBtn = iconBtn(doc, "list", actions.label("ribbon.bullet.title"), () => actions.toggleBullet());
    textSec.append(numberStepper(sizeInput, { min: 6, max: 96, step: 1 }, actions.label("ribbon.font.sizeUp"), actions.label("ribbon.font.sizeDown")), boldBtn, textColor, alignStart, alignMiddle, bulletBtn);
    const fillSep = sep(doc);
    const fillSec = doc.createElement("div");
    fillSec.className = "ppt-selection-format-sec";
    fillSec.dataset.section = "fill";
    const fillColor = colorInput(doc, actions.label("ribbon.shapeStyle.fill"), "#94a3b8", actions.applyFill, live, "fill");
    fillSec.appendChild(fillColor);
    const alignSep = sep(doc);
    const alignSec = doc.createElement("div");
    alignSec.className = "ppt-selection-format-sec";
    alignSec.dataset.section = "align";
    const shapeAlign = [
        ["left", "alignLeft", "ribbon.align.alignLeft"],
        ["centerH", "alignCenterH", "ribbon.align.alignCenterH"],
        ["right", "alignRight", "ribbon.align.alignRight"],
        ["top", "alignTop", "ribbon.align.alignTop"],
        ["centerV", "alignCenterV", "ribbon.align.alignCenterV"],
        ["bottom", "alignBottom", "ribbon.align.alignBottom"],
    ];
    for (const [mode, icon, key] of shapeAlign) {
        const b = doc.createElement("button");
        b.type = "button";
        b.className = "ppt-selection-format-btn";
        b.title = actions.label(key);
        b.setAttribute("aria-label", actions.label(key));
        b.appendChild((0, icons_1.svgIcon)(doc, icon, 16));
        b.addEventListener("click", (ev) => {
            ev.preventDefault();
            actions.align(mode);
        });
        alignSec.appendChild(b);
    }
    const distSep = sep(doc);
    const distSec = doc.createElement("div");
    distSec.className = "ppt-selection-format-sec";
    distSec.dataset.section = "distribute";
    const distH = iconBtn(doc, "align-horizontal-distribute-center", actions.label("ribbon.distribute.h"), () => actions.distribute("h"));
    const distV = iconBtn(doc, "align-vertical-distribute-center", actions.label("ribbon.distribute.v"), () => actions.distribute("v"));
    distSec.append(distH, distV);
    const lineSec = doc.createElement("div");
    lineSec.className = "ppt-selection-format-sec";
    lineSec.dataset.section = "line";
    const strokeColor = colorInput(doc, actions.label("ribbon.shapeStyle.stroke"), "#1e3a8a", actions.applyStroke, live, "stroke");
    const widthInput = doc.createElement("input");
    widthInput.type = "number";
    widthInput.min = "0";
    widthInput.max = "48";
    widthInput.step = "0.5";
    widthInput.className = "ppt-selection-format-size";
    widthInput.title = actions.label("ribbon.shapeStyle.strokeWidth");
    widthInput.setAttribute("aria-label", actions.label("ribbon.shapeStyle.strokeWidth"));
    widthInput.addEventListener("focus", () => actions.liveStart());
    widthInput.addEventListener("input", () => {
        const raw = widthInput.value.trim();
        if (raw === "" || raw === "-" || raw === ".")
            return;
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0)
            actions.applyStrokeWidth(Math.min(48, n));
    });
    widthInput.addEventListener("blur", () => actions.liveEnd());
    const arrowBtns = new Map();
    const arrows = [
        ["none", "minus", "ribbon.shapeStyle.arrowNone"],
        ["head", "arrow-left", "ribbon.shapeStyle.arrowHead"],
        ["tail", "arrow-right", "ribbon.shapeStyle.arrowTail"],
        ["both", "move-horizontal", "ribbon.shapeStyle.arrowBoth"],
    ];
    for (const [mode, icon, key] of arrows) {
        const b = iconBtn(doc, icon, actions.label(key), () => actions.applyArrows(mode));
        b.dataset.arrow = mode;
        arrowBtns.set(mode, b);
        lineSec.appendChild(b);
    }
    lineSec.prepend(strokeColor, numberStepper(widthInput, { min: 0, max: 48, step: 0.5 }, actions.label("ribbon.font.sizeUp"), actions.label("ribbon.font.sizeDown")));
    const arrangeSec = doc.createElement("div");
    arrangeSec.className = "ppt-selection-format-sec";
    arrangeSec.dataset.section = "arrange";
    const zoomInBtn = iconBtn(doc, "zoom-in", actions.label("toolbar.formatBar.zoomIn"), () => actions.zoom(exports.FORMAT_BAR_ZOOM_IN));
    const zoomOutBtn = iconBtn(doc, "zoom-out", actions.label("toolbar.formatBar.zoomOut"), () => actions.zoom(exports.FORMAT_BAR_ZOOM_OUT));
    const rotateBtn = iconBtn(doc, "rotate-cw", actions.label("ribbon.rotate.plus90"), () => actions.rotateQuarter());
    const flipHBtn = iconBtn(doc, "flipH", actions.label("inspector.flipH"), () => actions.flip("h"));
    const flipVBtn = iconBtn(doc, "flipV", actions.label("inspector.flipV"), () => actions.flip("v"));
    arrangeSec.append(zoomInBtn, zoomOutBtn, rotateBtn, flipHBtn, flipVBtn);
    const imageSec = doc.createElement("div");
    imageSec.className = "ppt-selection-format-sec";
    imageSec.dataset.section = "image";
    const replaceBtn = iconBtn(doc, "image-up", actions.label("toolbar.formatBar.replaceImage"), () => actions.replaceImage());
    const cropBtn = iconBtn(doc, "crop", actions.label("toolbar.formatBar.crop"), () => actions.crop());
    imageSec.append(replaceBtn, cropBtn);
    const iconSec = doc.createElement("div");
    iconSec.className = "ppt-selection-format-sec";
    iconSec.dataset.section = "icon";
    iconSec.appendChild(iconBtn(doc, "smile-plus", actions.label("toolbar.formatBar.changeIcon"), () => actions.replaceIcon()));
    const tableSep = sep(doc);
    const tableSec = doc.createElement("div");
    tableSec.className = "ppt-selection-format-sec";
    tableSec.dataset.section = "table";
    const tableOps = [
        ["addRow", "inspector.table.addRow"],
        ["removeRow", "inspector.table.removeRow"],
        ["addCol", "inspector.table.addCol"],
        ["removeCol", "inspector.table.removeCol"],
    ];
    for (const [op, key] of tableOps) {
        tableSec.appendChild(labelBtn(doc, actions.label(key), () => actions.table(op)));
    }
    el.append(textSec, fillSep, fillSec, alignSep, alignSec, distSep, distSec, lineSec, arrangeSec, iconSec, imageSec, tableSep, tableSec);
    doc.body.appendChild(el);
    const sync = (state) => {
        lastView = state;
        const mode = state.mode;
        const showText = mode.kind === "text";
        const showFill = mode.kind === "shape" || mode.kind === "table";
        const showAlign = mode.kind === "shape" && mode.align;
        const showDist = mode.kind === "shape" && mode.distribute;
        const showLine = mode.kind === "line";
        const showImage = mode.kind === "image";
        const showCrop = state.croppable && (showImage || mode.kind === "hidden" || mode.kind === "shape" || mode.kind === "text" || mode.kind === "icon");
        const showIcon = mode.kind === "icon";
        const showArrange = state.arrangeable && (showImage || showIcon || mode.kind === "hidden");
        const showTable = mode.kind === "table";
        el.dataset.formatMode = mode.kind;
        textSec.hidden = !showText;
        fillSec.hidden = !showFill;
        fillSep.hidden = true;
        alignSec.hidden = !showAlign;
        alignSep.hidden = !showAlign;
        distSec.hidden = !showDist;
        distSep.hidden = !showDist;
        lineSec.hidden = !showLine;
        arrangeSec.hidden = !showArrange;
        imageSec.hidden = !showImage && !showCrop;
        replaceBtn.hidden = !showImage;
        cropBtn.hidden = !showCrop;
        cropBtn.setAttribute("aria-pressed", state.cropping ? "true" : "false");
        iconSec.hidden = !showIcon;
        tableSec.hidden = !showTable;
        tableSep.hidden = !showTable;
        if (!stepperHeld && doc.activeElement !== sizeInput) {
            const shown = state.fontSize && state.fontSize > 0 ? (0, font_size_1.formatFontPt)(state.fontSize) : "";
            if (sizeInput.value !== shown)
                sizeInput.value = shown;
        }
        boldBtn.setAttribute("aria-pressed", state.bold ? "true" : "false");
        setColor(doc, textColor, state.textColor, "#111827");
        alignStart.setAttribute("aria-pressed", state.align === "start" ? "true" : "false");
        alignMiddle.setAttribute("aria-pressed", state.align === "middle" ? "true" : "false");
        bulletBtn.setAttribute("aria-pressed", state.bullet ? "true" : "false");
        setColor(doc, fillColor, state.fill, "#94a3b8");
        setColor(doc, strokeColor, state.stroke, "#1e3a8a");
        if (!stepperHeld && doc.activeElement !== widthInput) {
            const shown = Number.isFinite(state.strokeWidth) ? String(state.strokeWidth) : "";
            if (widthInput.value !== shown)
                widthInput.value = shown;
        }
        for (const [mode, btn] of arrowBtns) {
            btn.setAttribute("aria-pressed", state.arrows === mode ? "true" : "false");
        }
        if (stepperHeld && el.style.display === "flex")
            return;
        if ((mode.kind === "hidden" && !showCrop && !showArrange) || !state.anchor || !state.view) {
            el.style.display = "none";
            return;
        }
        el.style.display = "flex";
        el.style.visibility = "hidden";
        const pos = formatBarPosition({
            anchor: state.anchor,
            view: state.view,
            bar: { w: el.offsetWidth, h: el.offsetHeight },
            viewport: state.viewport,
        });
        if (!pos) {
            el.style.display = "none";
            el.style.visibility = "";
            return;
        }
        el.style.left = `${pos.left}px`;
        el.style.top = `${pos.top}px`;
        el.style.visibility = "visible";
    };
    return {
        el,
        sync,
        destroy: () => {
            stopRepeat();
            doc.removeEventListener("pointerup", releaseStepper);
            doc.removeEventListener("pointercancel", releaseStepper);
            el.remove();
        },
    };
    function numberStepper(input, spec, upLabel, downLabel) {
        const wrap = doc.createElement("span");
        wrap.className = "ppt-selection-format-stepper";
        const spins = doc.createElement("span");
        spins.className = "ppt-selection-format-spin";
        spins.append(spinButton(1, upLabel), spinButton(-1, downLabel));
        wrap.append(input, spins);
        return wrap;
        function spinButton(dir, label) {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.className = "ppt-selection-format-spin-btn";
            btn.tabIndex = -1;
            btn.dataset.spin = dir > 0 ? "up" : "down";
            btn.title = label;
            btn.setAttribute("aria-label", label);
            btn.appendChild((0, icons_1.lucideSvg)(doc, dir > 0 ? "chevron-up" : "chevron-down", 10));
            btn.addEventListener("pointerdown", (ev) => {
                if (ev.button !== 0)
                    return;
                ev.preventDefault();
                stopRepeat();
                stepperHeld = true;
                if (doc.activeElement !== input) {
                    actions.liveStart();
                    spinOwnsLive = true;
                }
                const tick = () => stepNumber(input, dir, spec);
                tick();
                const win = doc.defaultView;
                if (!win)
                    return;
                repeatKick = win.setTimeout(() => {
                    repeatTimer = win.setInterval(tick, 50);
                }, 380);
            });
            return btn;
        }
    }
}
function stepNumber(input, dir, spec) {
    const cur = Number(input.value);
    const base = Number.isFinite(cur) ? cur : spec.min;
    const snapped = Math.round((base + dir * spec.step) / spec.step) * spec.step;
    const next = Math.min(spec.max, Math.max(spec.min, snapped));
    const shown = spec.step < 1 ? String(Math.round(next * 1000) / 1000) : String(next);
    if (input.value === shown)
        return;
    input.value = shown;
    const EventCtor = input.ownerDocument.defaultView?.Event ?? Event;
    input.dispatchEvent(new EventCtor("input", { bubbles: true }));
}
/** 相对当前外框放大。再点一次按同一比例再变一档。 */
exports.FORMAT_BAR_ZOOM_IN = 1.1;
/** 相对当前外框缩小。边短于 8 则不再缩。 */
exports.FORMAT_BAR_ZOOM_OUT = 0.9;
const FORMAT_BAR_MIN_SIDE = 8;
/** 外框按比例变，中心留在原地。缩到比最小边还小则不动。 */
function scaleRectAboutCenter(rect, factor) {
    const w = rect.w * factor;
    const h = rect.h * factor;
    if (!(w >= FORMAT_BAR_MIN_SIDE) || !(h >= FORMAT_BAR_MIN_SIDE))
        return null;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
}
function iconBtn(doc, icon, label, onClick) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "ppt-selection-format-btn";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild((0, icons_1.lucideSvg)(doc, icon, 16));
    b.addEventListener("click", (ev) => {
        ev.preventDefault();
        onClick();
    });
    return b;
}
function colorInput(doc, label, fallback, onChange, live, slot) {
    const input = doc.createElement("input");
    input.type = "color";
    input.className = "ppt-selection-format-color";
    input.dataset.liveColor = slot;
    input.value = fallback;
    input.dataset.fallback = fallback;
    input.title = label;
    input.setAttribute("aria-label", label);
    input.addEventListener("pointerdown", () => live.start());
    input.addEventListener("input", () => onChange(input.value));
    input.addEventListener("change", () => live.end());
    input.addEventListener("blur", () => live.end());
    return input;
}
function labelBtn(doc, label, onClick) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "ppt-selection-format-label";
    b.textContent = label;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", (ev) => {
        ev.preventDefault();
        onClick();
    });
    return b;
}
function sep(doc) {
    const s = doc.createElement("span");
    s.className = "ppt-selection-format-sep";
    s.setAttribute("aria-hidden", "true");
    return s;
}
function setColor(doc, input, color, fallback) {
    if (doc.activeElement === input)
        return;
    const next = toHex(color, fallback);
    if (input.value.toLowerCase() !== next)
        input.value = next;
}
function toHex(color, fallback) {
    const c = color.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c))
        return c.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(c)) {
        const r = c[1] ?? "0";
        const g = c[2] ?? "0";
        const b = c[3] ?? "0";
        return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return fallback;
}
