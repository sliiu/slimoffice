// 编辑器 / Playground 公用 Lucide SVG 图标。
//
// 统一用 lucide 包渲染矢量图标，避免 emoji / Unicode 在不同系统下回退不一致。
// Ribbon、Inspector、AI 面板、MCP 描述符等 UI 图标均通过本模块创建。

import { icons, type IconNode } from "lucide";

/** 未指定或无法解析时的默认 Lucide 图标 id（kebab-case）。 */
export const DEFAULT_LUCIDE_ICON = "puzzle";

type IconChild = [string, Record<string, string | number>, IconChild[]?];

/** Ribbon / Inspector 对齐与变换按钮的图标名（保持既有 API）。 */
export type IconName =
  | "alignParaLeft"
  | "alignParaCenter"
  | "alignParaRight"
  | "alignParaJustify"
  | "alignLeft"
  | "alignCenterH"
  | "alignRight"
  | "alignTop"
  | "alignCenterV"
  | "alignBottom"
  | "distributeH"
  | "distributeV"
  | "flipH"
  | "flipV"
  | "rotatePlus90"
  | "rotateMinus90";

const EDITOR_ICON_IDS: Record<IconName, string> = {
  alignParaLeft: "text-align-start",
  alignParaCenter: "text-align-center",
  alignParaRight: "text-align-end",
  alignParaJustify: "text-align-justify",
  alignLeft: "align-start-horizontal",
  alignCenterH: "align-center-horizontal",
  alignRight: "align-end-horizontal",
  alignTop: "align-start-vertical",
  alignCenterV: "align-center-vertical",
  alignBottom: "align-end-vertical",
  distributeH: "align-horizontal-distribute-center",
  distributeV: "align-vertical-distribute-center",
  // Lucide 用中线方向起名：flip-horizontal-2 虚线横着、三角上下对。
  // 水平翻转是左右对调，用竖中线那枚。
  flipH: "flip-vertical-2",
  flipV: "flip-horizontal-2",
  rotatePlus90: "rotate-cw",
  rotateMinus90: "rotate-ccw",
};

/** 历史 emoji 图标 → Lucide id（localStorage 里旧 MCP 配置兼容）。 */
const LEGACY_EMOJI_ICONS: Record<string, string> = {
  "🧩": "puzzle",
  "💬": "message-circle",
  "🖼️": "image",
  "🖼": "image",
  "🔤": "a-large-small",
  "📚": "library",
  "📄": "file-text",
  "🔷": "shapes",
  "📝": "type",
  "📊": "table",
  "◻️": "square",
  "📘": "book-open",
  "📒": "notebook",
  "✨": "sparkles",
  "▶": "play",
  "⏸": "pause",
  "⏹": "square",
  "×": "x",
  "✕": "x",
  "✖": "x",
  "⚙": "settings",
  "🪄": "wand-sparkles",
  "🔧": "wrench",
  "✅": "circle-check",
  "⚠️": "triangle-alert",
  "⚠": "triangle-alert",
  "💾": "save",
  "↑": "arrow-up",
  "↓": "arrow-down",
  "←": "arrow-left",
  "→": "arrow-right",
  "↩": "undo-2",
  "▾": "chevron-down",
  "▴": "chevron-up",
  "‹": "chevron-left",
  "›": "chevron-right",
};

function kebabToPascal(id: string): string {
  return id.replace(/[-_]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^(.)/, (m) => m.toUpperCase());
}

function iconNodeById(id: string): IconNode | undefined {
  const rec = icons as Record<string, IconNode | undefined>;
  return rec[id] ?? rec[kebabToPascal(id)];
}

/** 将用户 / 历史配置规范为 Lucide kebab-case id。 */
export function normalizeLucideIconName(raw?: string | null): string {
  if (!raw?.trim()) return DEFAULT_LUCIDE_ICON;
  const t = raw.trim();
  const legacy = LEGACY_EMOJI_ICONS[t];
  if (legacy) return legacy;
  if (iconNodeById(t)) return t;
  if (t in EDITOR_ICON_IDS) return EDITOR_ICON_IDS[t as IconName];
  return DEFAULT_LUCIDE_ICON;
}

function strokeWidthForSize(size: number): number {
  return size <= 12 ? 1.5 : size <= 16 ? 1.75 : 2;
}

function appendIconChild(doc: Document, parent: Element, node: IconChild): void {
  const [tag, attrs, children] = node;
  const el = doc.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  children?.forEach((child) => appendIconChild(doc, el, child));
  parent.appendChild(el);
}

/**
 * 创建 Lucide SVG 节点（currentColor 跟随父级 color）。
 * 使用传入的 `doc` 创建元素，以便在 iframe / shadow DOM 中正确挂载。
 */
export function lucideSvg(doc: Document, name: string, size = 14): SVGElement {
  const id = normalizeLucideIconName(name);
  const node = iconNodeById(id) ?? iconNodeById(DEFAULT_LUCIDE_ICON)!;
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(strokeWidthForSize(size)));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  (node as IconChild[]).forEach((child) => appendIconChild(doc, svg, child));
  svg.style.display = "block";
  svg.style.flex = "0 0 auto";
  return svg;
}

/** 将容器内容替换为单个 Lucide 图标。 */
export function fillLucideIcon(doc: Document, el: HTMLElement, iconName: string, size = 14): void {
  el.replaceChildren(lucideSvg(doc, iconName, size));
}

/** Ribbon / Inspector 专用：按既有 IconName 创建 SVG。 */
export function svgIcon(doc: Document, name: IconName, size = 14): SVGElement {
  return lucideSvg(doc, EDITOR_ICON_IDS[name], size);
}

/** 向容器追加 Lucide 图标，返回 SVG。 */
export function appendLucideIcon(
  doc: Document,
  parent: HTMLElement,
  iconName: string,
  size = 14,
  className?: string,
): SVGElement {
  const svg = lucideSvg(doc, iconName, size);
  if (className) svg.classList.add(className);
  parent.appendChild(svg);
  return svg;
}

/** 图标 + 文案（inline-flex），用于 Tab / 标题等。 */
export function appendLabelWithIcon(
  doc: Document,
  parent: HTMLElement,
  iconName: string,
  text: string,
  iconSize = 14,
): void {
  const wrap = doc.createElement("span");
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "6px";
  wrap.appendChild(lucideSvg(doc, iconName, iconSize));
  const label = doc.createElement("span");
  label.textContent = text;
  wrap.appendChild(label);
  parent.appendChild(wrap);
}

/** 仅图标的按钮。 */
export function mkLucideIconButton(
  doc: Document,
  iconName: string,
  className: string,
  title?: string,
  size = 14,
): HTMLButtonElement {
  const b = doc.createElement("button");
  b.type = "button";
  b.className = className;
  if (title) {
    b.title = title;
    b.setAttribute("aria-label", title);
  }
  b.style.display = "inline-flex";
  b.style.alignItems = "center";
  b.style.justifyContent = "center";
  b.appendChild(lucideSvg(doc, iconName, size));
  return b;
}

/** 将按钮内容替换为单个 Lucide 图标（用于 play/pause 切换等）。 */
export function setButtonLucideIcon(
  doc: Document,
  btn: HTMLButtonElement,
  iconName: string,
  size = 14,
): void {
  btn.replaceChildren(lucideSvg(doc, iconName, size));
}

/** 图标 + 可选文案的按钮。 */
export function mkLucideButton(
  doc: Document,
  iconName: string,
  label: string,
  className: string,
  title?: string,
  iconSize = 14,
): HTMLButtonElement {
  const b = mkLucideIconButton(doc, iconName, className, title, iconSize);
  if (label) {
    const span = doc.createElement("span");
    span.textContent = label;
    b.style.gap = "6px";
    b.insertBefore(span, null);
  }
  return b;
}
