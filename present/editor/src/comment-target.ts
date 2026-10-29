import type { Shape, ShapeKind, Slide, TextShape } from "@ppt/core";
import { t, type MessageKey } from "./i18n";
import { inverseNodeTransform } from "./shape-transform";

export interface CommentShapeCaption {
  kind: ShapeKind;
  /** 文本框里的正文。有正文时卡片只显示这一行。 */
  text?: string;
  /** 没有正文时用形状名称，前面再加类型。 */
  name?: string;
}

/** 点在形状上时，批注记下的那个形状。装饰层（dec_）不算。 */
export function shapeAtPoint(slide: Slide, x: number, y: number): Shape | undefined {
  for (let li = slide.layers.length - 1; li >= 0; li--) {
    const layer = slide.layers[li];
    if (!layer || layer.visible === false) continue;
    for (let si = layer.shapes.length - 1; si >= 0; si--) {
      const hit = hitLeaf(layer.shapes[si]!, x, y);
      if (hit && !hit.id.startsWith("dec_")) return hit;
    }
  }
  return undefined;
}

function hitLeaf(s: Shape, x: number, y: number): Shape | undefined {
  if (s.visible === false) return undefined;
  const p = inverseNodeTransform(s, x, y);
  if (s.kind === "group") {
    for (let i = s.children.length - 1; i >= 0; i--) {
      const hit = hitLeaf(s.children[i]!, p.x, p.y);
      if (hit) return hit;
    }
    return undefined;
  }
  const b = s.bbox;
  if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return s;
  return undefined;
}

const shapeKindKey: Record<ShapeKind, MessageKey> = {
  group: "comments.shape.group",
  rect: "comments.shape.rect",
  ellipse: "comments.shape.ellipse",
  path: "comments.shape.path",
  text: "comments.shape.text",
  image: "comments.shape.image",
  line: "comments.shape.line",
  polygon: "comments.shape.polygon",
  chart: "comments.shape.chart",
  video: "comments.shape.video",
  audio: "comments.shape.audio",
  ole: "comments.shape.ole",
  model3d: "comments.shape.model3d",
  webEmbed: "comments.shape.webEmbed",
};

/** 卡片和新建对话框上的那一行：有正文就用正文，否则是「类型 · 名称」。 */
export function commentShapeLabel(shape: Shape): string {
  const cap = commentShapeCaption(shape);
  const kindLabel = t(shapeKindKey[cap.kind]);
  if (cap.text) return cap.text;
  if (cap.name) return `${kindLabel} · ${cap.name}`;
  return kindLabel;
}

/** 卡片上用来认出这个形状的材料：正文优先，否则用名称。 */
export function commentShapeCaption(shape: Shape): CommentShapeCaption {
  if (shape.kind === "text") {
    const text = textOf(shape).replace(/\s+/g, " ").trim();
    if (text) return { kind: shape.kind, text };
  }
  const name = shape.name?.trim();
  return { kind: shape.kind, ...(name ? { name } : {}) };
}

function textOf(shape: TextShape): string {
  return shape.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join(" ");
}
