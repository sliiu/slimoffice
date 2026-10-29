// 选区旁的短格式条。按元素类型换控件，同一时刻只显示一套，不进底部「常用」行。
// 每次选中都会出现，所以本身不做进出动画。

import { fontPxFromPt, formatFontPt } from "./font-size";
import type { MessageKey } from "./i18n";
import { decodeIconDescr } from "./icon-picker-dialog";
import { lucideSvg, svgIcon, type IconName } from "./icons";

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type FormatSubject = "text" | "shape" | "line" | "image" | "icon" | "table" | "other";

export type LineArrowEnds = "none" | "head" | "tail" | "both";

export type FormatBarMode =
  | { kind: "hidden" }
  | { kind: "text" }
  | { kind: "shape"; align: boolean; distribute: boolean }
  | { kind: "line" }
  | { kind: "image" }
  | { kind: "icon" }
  | { kind: "table" };

const FILLABLE = new Set(["rect", "ellipse", "path", "polygon"]);

/** 选中对象落到哪一套格式条。单元格是文字；表格是带 tableMeta 的编组。 */
export function formatSubject(shape: {
  kind: string;
  descr?: string;
  tableMeta?: unknown;
  smartArtMeta?: unknown;
  cellMeta?: unknown;
}): FormatSubject {
  if (shape.smartArtMeta) return "other";
  if (shape.kind === "group" && shape.tableMeta) return "table";
  if (shape.kind === "text" || shape.cellMeta) return "text";
  if (shape.kind === "line") return "line";
  if (shape.kind === "image") return decodeIconDescr(shape.descr) ? "icon" : "image";
  if (FILLABLE.has(shape.kind)) return "shape";
  return "other";
}

export function selectionFormatMode(input: {
  view: string;
  background: boolean;
  dragging: boolean;
  /** 行内文本编辑中。盖过形状类型，先改字。 */
  editingText: boolean;
  subjects: readonly FormatSubject[];
}): FormatBarMode {
  if (input.dragging || input.view !== "normal") return { kind: "hidden" };
  if (input.background) return { kind: "hidden" };
  if (input.editingText) return { kind: "text" };
  const subjects = input.subjects;
  if (subjects.length < 1) return { kind: "hidden" };
  const first = subjects[0]!;
  if (first === "other" || subjects.some((s) => s !== first)) return { kind: "hidden" };
  if (first === "text") return { kind: "text" };
  if (first === "line") return { kind: "line" };
  if (first === "image") return { kind: "image" };
  if (first === "icon") return { kind: "icon" };
  if (first === "table") return { kind: "table" };
  return {
    kind: "shape",
    align: subjects.length >= 2,
    distribute: subjects.length >= 3,
  };
}

function intersectRect(a: ScreenRect, b: ScreenRect): ScreenRect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

/**
 * 按选区在可视画布里还能看见的那一段摆放。优先放在上方；上方出了画布就改到下方。
 * 整条留在画布内，放大后不会盖到缩略图列、顶栏或属性栏。选区完全离开画布则不放。
 * 条比画布宽时贴着画布左缘，避免盖住左侧幻灯片列。
 */
export function formatBarPosition(input: {
  anchor: ScreenRect;
  view: ScreenRect;
  bar: { w: number; h: number };
  viewport: { w: number; h: number };
  gap?: number;
  margin?: number;
  /** 默认上方；below 时优先下方，下方出了画布再改到上方。 */
  prefer?: "above" | "below";
}): { left: number; top: number } | null {
  const { anchor, view, bar, viewport } = input;
  const gap = input.gap ?? 8;
  const margin = input.margin ?? 8;
  const visible = intersectRect(anchor, view);
  if (!visible || bar.w <= 0 || bar.h <= 0) return null;

  let left = (visible.left + visible.right) / 2 - bar.w / 2;
  const above = visible.top - gap - bar.h;
  const below = visible.bottom + gap;
  let top: number;
  if (input.prefer === "below") top = below + bar.h > view.bottom - margin ? above : below;
  else top = above < view.top + margin ? below : above;

  const minLeft = Math.max(margin, view.left + margin);
  const maxLeft = Math.min(viewport.w - bar.w - margin, view.right - bar.w - margin);
  const minTop = Math.max(margin, view.top + margin);
  const maxTop = Math.min(viewport.h - bar.h - margin, view.bottom - bar.h - margin);
  left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
  top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));
  return { left, top };
}

export interface SelectionFormatView {
  mode: FormatBarMode;
  anchor: ScreenRect | null;
  view: ScreenRect | null;
  viewport: { w: number; h: number };
  fontSize?: number;
  bold: boolean;
  textColor: string;
  align?: "start" | "middle" | "end" | "justify";
  bullet: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
  arrows: LineArrowEnds;
  /** 当前选中可以裁剪。视频、图片填充在自己的格式条上也会露出这颗按钮。 */
  croppable: boolean;
  cropping: boolean;
  /** 当前这一张图片、视频或图标。放大、缩小、旋转、翻转只对这一个。 */
  arrangeable: boolean;
}

export interface SelectionFormatActions {
  label: (key: MessageKey) => string;
  /** 连续输入开始 / 结束，供调用方把一次拖动或一次打字收成一步撤销。 */
  liveStart: () => void;
  liveEnd: () => void;
  applyFontSize: (px: number) => void;
  toggleBold: () => void;
  applyTextColor: (hex: string) => void;
  applyAlign: (align: "start" | "middle") => void;
  toggleBullet: () => void;
  applyFill: (hex: string) => void;
  applyStroke: (hex: string) => void;
  applyStrokeWidth: (px: number) => void;
  applyArrows: (mode: LineArrowEnds) => void;
  replaceImage: () => void;
  replaceIcon: () => void;
  crop: () => void;
  zoom: (factor: number) => void;
  rotateQuarter: () => void;
  flip: (axis: "h" | "v") => void;
  table: (op: "addRow" | "removeRow" | "addCol" | "removeCol") => void;
  align: (mode: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") => void;
  distribute: (axis: "h" | "v") => void;
}

export interface SelectionFormatBar {
  el: HTMLElement;
  sync: (state: SelectionFormatView) => void;
  destroy: () => void;
}

export function mountSelectionFormatBar(doc: Document, actions: SelectionFormatActions): SelectionFormatBar {
  const el = doc.createElement("div");
  el.className = "ppt-selection-format";
  el.dataset.pptSelectionFormat = "1";
  el.setAttribute("role", "toolbar");
  el.setAttribute("aria-label", actions.label("toolbar.formatBar"));
  el.addEventListener("mousedown", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target?.closest("input")) return;
    ev.preventDefault();
  });
  // 系统数字框的箭头在这条上按住不会连加（祖先 user-select: none，改值时条还会重排）。
  // 箭头是自己的按钮：按下立刻一步，停一下再按住连改。按住期间不挪条，松手再跟选区。
  let stepperHeld = false;
  let spinOwnsLive = false;
  let lastView: SelectionFormatView | null = null;
  let repeatKick = 0;
  let repeatTimer = 0;
  const stopRepeat = (): void => {
    const win = doc.defaultView;
    if (repeatKick) win?.clearTimeout(repeatKick);
    if (repeatTimer) win?.clearInterval(repeatTimer);
    repeatKick = 0;
    repeatTimer = 0;
  };
  const releaseStepper = (): void => {
    const owns = spinOwnsLive;
    spinOwnsLive = false;
    stopRepeat();
    if (owns) actions.liveEnd();
    if (!stepperHeld) return;
    stepperHeld = false;
    if (lastView) sync(lastView);
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
    if (raw === "" || raw === "-" || raw === ".") return;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) actions.applyFontSize(fontPxFromPt(n));
  });
  sizeInput.addEventListener("blur", () => actions.liveEnd());
  const boldBtn = iconBtn(doc, "bold", actions.label("ribbon.font.bold"), () => actions.toggleBold());
  const live = { start: () => actions.liveStart(), end: () => actions.liveEnd() };
  const textColor = colorInput(doc, actions.label("ribbon.font.color"), "#111827", actions.applyTextColor, live, "text");
  const alignStart = iconBtn(doc, "text-align-start", actions.label("ribbon.align.left"), () => actions.applyAlign("start"));
  const alignMiddle = iconBtn(doc, "text-align-center", actions.label("ribbon.align.center"), () => actions.applyAlign("middle"));
  const bulletBtn = iconBtn(doc, "list", actions.label("ribbon.bullet.title"), () => actions.toggleBullet());
  textSec.append(
    numberStepper(sizeInput, { min: 6, max: 96, step: 1 }, actions.label("ribbon.font.sizeUp"), actions.label("ribbon.font.sizeDown")),
    boldBtn,
    textColor,
    alignStart,
    alignMiddle,
    bulletBtn,
  );

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
  const shapeAlign: Array<["left" | "centerH" | "right" | "top" | "centerV" | "bottom", IconName, MessageKey]> = [
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
    b.appendChild(svgIcon(doc, icon, 16));
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
    if (raw === "" || raw === "-" || raw === ".") return;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) actions.applyStrokeWidth(Math.min(48, n));
  });
  widthInput.addEventListener("blur", () => actions.liveEnd());
  const arrowBtns = new Map<LineArrowEnds, HTMLButtonElement>();
  const arrows: Array<[LineArrowEnds, string, MessageKey]> = [
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
  lineSec.prepend(
    strokeColor,
    numberStepper(widthInput, { min: 0, max: 48, step: 0.5 }, actions.label("ribbon.font.sizeUp"), actions.label("ribbon.font.sizeDown")),
  );

  const arrangeSec = doc.createElement("div");
  arrangeSec.className = "ppt-selection-format-sec";
  arrangeSec.dataset.section = "arrange";
  const zoomInBtn = iconBtn(doc, "zoom-in", actions.label("toolbar.formatBar.zoomIn"), () => actions.zoom(FORMAT_BAR_ZOOM_IN));
  const zoomOutBtn = iconBtn(doc, "zoom-out", actions.label("toolbar.formatBar.zoomOut"), () => actions.zoom(FORMAT_BAR_ZOOM_OUT));
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
  const tableOps: Array<["addRow" | "removeRow" | "addCol" | "removeCol", MessageKey]> = [
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

  const sync = (state: SelectionFormatView): void => {
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
      const shown = state.fontSize && state.fontSize > 0 ? formatFontPt(state.fontSize) : "";
      if (sizeInput.value !== shown) sizeInput.value = shown;
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
      if (widthInput.value !== shown) widthInput.value = shown;
    }
    for (const [mode, btn] of arrowBtns) {
      btn.setAttribute("aria-pressed", state.arrows === mode ? "true" : "false");
    }

    if (stepperHeld && el.style.display === "flex") return;

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

  function numberStepper(
    input: HTMLInputElement,
    spec: { min: number; max: number; step: number },
    upLabel: string,
    downLabel: string,
  ): HTMLElement {
    const wrap = doc.createElement("span");
    wrap.className = "ppt-selection-format-stepper";
    const spins = doc.createElement("span");
    spins.className = "ppt-selection-format-spin";
    spins.append(spinButton(1, upLabel), spinButton(-1, downLabel));
    wrap.append(input, spins);
    return wrap;

    function spinButton(dir: number, label: string): HTMLButtonElement {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "ppt-selection-format-spin-btn";
      btn.tabIndex = -1;
      btn.dataset.spin = dir > 0 ? "up" : "down";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.appendChild(lucideSvg(doc, dir > 0 ? "chevron-up" : "chevron-down", 10));
      btn.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        stopRepeat();
        stepperHeld = true;
        if (doc.activeElement !== input) {
          actions.liveStart();
          spinOwnsLive = true;
        }
        const tick = (): void => stepNumber(input, dir, spec);
        tick();
        const win = doc.defaultView;
        if (!win) return;
        repeatKick = win.setTimeout(() => {
          repeatTimer = win.setInterval(tick, 50);
        }, 380);
      });
      return btn;
    }
  }
}

function stepNumber(
  input: HTMLInputElement,
  dir: number,
  spec: { min: number; max: number; step: number },
): void {
  const cur = Number(input.value);
  const base = Number.isFinite(cur) ? cur : spec.min;
  const snapped = Math.round((base + dir * spec.step) / spec.step) * spec.step;
  const next = Math.min(spec.max, Math.max(spec.min, snapped));
  const shown = spec.step < 1 ? String(Math.round(next * 1000) / 1000) : String(next);
  if (input.value === shown) return;
  input.value = shown;
  const EventCtor = input.ownerDocument.defaultView?.Event ?? Event;
  input.dispatchEvent(new EventCtor("input", { bubbles: true }));
}

/** 相对当前外框放大。再点一次按同一比例再变一档。 */
export const FORMAT_BAR_ZOOM_IN = 1.1;
/** 相对当前外框缩小。边短于 8 则不再缩。 */
export const FORMAT_BAR_ZOOM_OUT = 0.9;
const FORMAT_BAR_MIN_SIDE = 8;

/** 外框按比例变，中心留在原地。缩到比最小边还小则不动。 */
export function scaleRectAboutCenter(
  rect: { x: number; y: number; w: number; h: number },
  factor: number,
): { x: number; y: number; w: number; h: number } | null {
  const w = rect.w * factor;
  const h = rect.h * factor;
  if (!(w >= FORMAT_BAR_MIN_SIDE) || !(h >= FORMAT_BAR_MIN_SIDE)) return null;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

function iconBtn(doc: Document, icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = doc.createElement("button");
  b.type = "button";
  b.className = "ppt-selection-format-btn";
  b.title = label;
  b.setAttribute("aria-label", label);
  b.appendChild(lucideSvg(doc, icon, 16));
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    onClick();
  });
  return b;
}

function colorInput(
  doc: Document,
  label: string,
  fallback: string,
  onChange: (hex: string) => void,
  live: { start: () => void; end: () => void },
  slot: "fill" | "text" | "stroke",
): HTMLInputElement {
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

function labelBtn(doc: Document, label: string, onClick: () => void): HTMLButtonElement {
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

function sep(doc: Document): HTMLSpanElement {
  const s = doc.createElement("span");
  s.className = "ppt-selection-format-sep";
  s.setAttribute("aria-hidden", "true");
  return s;
}

function setColor(doc: Document, input: HTMLInputElement, color: string, fallback: string): void {
  if (doc.activeElement === input) return;
  const next = toHex(color, fallback);
  if (input.value.toLowerCase() !== next) input.value = next;
}

function toHex(color: string, fallback: string): string {
  const c = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    const r = c[1] ?? "0";
    const g = c[2] ?? "0";
    const b = c[3] ?? "0";
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}
