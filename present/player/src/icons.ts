// Player 内嵌 UI 的 Lucide 图标（与 @ppt/editor/icons 同逻辑，避免 player 依赖整个 editor）。

import { icons, type IconNode } from "lucide";

type IconChild = [string, Record<string, string | number>, IconChild[]?];

function kebabToPascal(id: string): string {
  return id.replace(/[-_]+(.)/g, (_, c: string) => c.toUpperCase()).replace(/^(.)/, (m) => m.toUpperCase());
}

function iconNodeById(id: string): IconNode | undefined {
  const rec = icons as Record<string, IconNode | undefined>;
  return rec[id] ?? rec[kebabToPascal(id)];
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

export function lucideSvg(doc: Document, name: string, size = 14): SVGElement {
  const node = iconNodeById(name);
  if (!node) return doc.createElementNS("http://www.w3.org/2000/svg", "svg");
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

export function fillLucideIcon(doc: Document, el: HTMLElement, iconName: string, size = 14): void {
  el.replaceChildren(lucideSvg(doc, iconName, size));
}

export function mkLucideIconButton(
  doc: Document,
  iconName: string,
  title?: string,
  size = 14,
): HTMLButtonElement {
  const b = doc.createElement("button");
  b.type = "button";
  if (title) b.title = title;
  b.style.display = "inline-flex";
  b.style.alignItems = "center";
  b.style.justifyContent = "center";
  b.appendChild(lucideSvg(doc, iconName, size));
  return b;
}
