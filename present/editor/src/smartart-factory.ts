import type { Rect, Shape, SmartArtItem, SmartArtLayoutKind, TextShape } from "@ppt/core";
import { buildSmartArtShapes } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import { genShapeId } from "./shape-factory";

export function paragraphText(p: TextShape["paragraphs"][number]): string {
  return p.runs.map((r) => r.text).join("").trim();
}

/** 从文本框段落提取 SmartArt 条目（保留 level → lvl）。 */
export function itemsFromTextShape(text: TextShape): SmartArtItem[] {
  const items: SmartArtItem[] = [];
  text.paragraphs.forEach((p, i) => {
    const t = paragraphText(p);
    if (!t) return;
    items.push({
      id: `item_${i}`,
      text: t,
      lvl: p.level ?? 0,
    });
  });
  if (items.length === 0) {
    items.push({ id: "item_0", text: "Item 1", lvl: 0 });
  }
  return items;
}

/** 根据段落层级 / 数量推断默认 SmartArt 版式。 */
export function inferSmartArtLayout(text: TextShape): SmartArtLayoutKind {
  const items = itemsFromTextShape(text);
  const levels = new Set(items.map((it) => it.lvl ?? 0));
  if (levels.size > 1 || (levels.has(1) && items.length >= 2)) return "orgChart";
  if (items.length >= 4) return "process";
  if (items.length === 3) return "list";
  return "list";
}

export function convertTextShapeToSmartArt(
  text: TextShape,
  layout?: SmartArtLayoutKind,
): Shape {
  const lay = layout ?? inferSmartArtLayout(text);
  const items = itemsFromTextShape(text);
  return createSmartArtGroup({
    id: genShapeId("sa"),
    layout: lay,
    items,
    bbox: { ...text.bbox },
  });
}

export function defaultSmartArtItems(layout: SmartArtLayoutKind): SmartArtItem[] {
  if (layout === "hierarchy" || layout === "orgChart" || layout === "horizontalHierarchy") {
    return [
      { id: "item_0", text: "Main idea", lvl: 0 },
      { id: "item_1", text: "Detail A", lvl: 1 },
      { id: "item_2", text: "Detail B", lvl: 1 },
    ];
  }
  if (layout === "venn") {
    return [
      { id: "item_0", text: "Set A" },
      { id: "item_1", text: "Set B" },
      { id: "item_2", text: "Set C" },
    ];
  }
  if (layout === "target") {
    return [
      { id: "item_0", text: "Goal", lvl: 0 },
      { id: "item_1", text: "Metric 1", lvl: 1 },
      { id: "item_2", text: "Metric 2", lvl: 1 },
      { id: "item_3", text: "Metric 3", lvl: 1 },
    ];
  }
  if (layout === "radial" || layout === "gear") {
    return [
      { id: "item_0", text: "Core idea", lvl: 0 },
      { id: "item_1", text: "Branch A", lvl: 1 },
      { id: "item_2", text: "Branch B", lvl: 1 },
      { id: "item_3", text: "Branch C", lvl: 1 },
    ];
  }
  if (layout === "equation") {
    return [
      { id: "item_0", text: "Input" },
      { id: "item_1", text: "Process" },
      { id: "item_2", text: "Result" },
    ];
  }
  return [
    { id: "item_0", text: "Step 1" },
    { id: "item_1", text: "Step 2" },
    { id: "item_2", text: "Step 3" },
  ];
}

export function createSmartArtGroup(opts: {
  id: string;
  layout: SmartArtLayoutKind;
  items: SmartArtItem[];
  bbox: Rect;
}): Shape {
  const children = buildSmartArtShapes(opts.layout, opts.items, opts.bbox);
  return {
    id: opts.id,
    name: "SmartArt",
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    bbox: opts.bbox,
    transform: identityTransform(),
    kind: "group",
    children,
    smartArtMeta: { layout: opts.layout },
  };
}
