import type { EditCommand, Presentation, Shape, SmartArtItem, SmartArtLayoutKind } from "@ppt/core";
import { extractSmartArtItems, rebuildSmartArtChildren } from "@ppt/core";
import { findShape } from "./selection";
import { convertTextShapeToSmartArt } from "./smartart-factory";

function getSmartArtGroup(pres: Presentation, slideIdx: number, groupId: string) {
  const slide = pres.slides[slideIdx];
  if (!slide) return null;
  const sh = findShape(slide, groupId);
  if (!sh || sh.kind !== "group" || !sh.smartArtMeta) return null;
  return sh;
}

export class RebuildSmartArtCmd implements EditCommand {
  readonly label: string;
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly nextItems: SmartArtItem[],
    private readonly prevItems: SmartArtItem[],
    private readonly nextLayout?: SmartArtLayoutKind,
    private readonly prevLayout?: SmartArtLayoutKind,
  ) {
    this.label = "Update diagram";
  }
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    if (this.nextLayout) g.smartArtMeta = { layout: this.nextLayout };
    rebuildSmartArtChildren(g, this.nextItems, g.smartArtMeta?.layout);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    if (this.prevLayout) g.smartArtMeta = { layout: this.prevLayout };
    rebuildSmartArtChildren(g, this.prevItems, g.smartArtMeta?.layout);
  }
}

export class UpdateSmartArtItemsCmd implements EditCommand {
  readonly label = "Edit diagram items";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly nextItems: SmartArtItem[],
    private readonly prevItems: SmartArtItem[],
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.nextItems);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.prevItems);
  }
}

export class AddSmartArtItemCmd implements EditCommand {
  readonly label = "Add diagram item";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly snapshot: SmartArtItem[],
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    const items = extractSmartArtItems(g);
    const n = items.length + 1;
    const layout = g.smartArtMeta!.layout;
    items.push({
      id: `item_${n}`,
      text: `Item ${n}`,
      lvl: layout === "hierarchy" && items.length > 0 ? 1 : 0,
    });
    rebuildSmartArtChildren(g, items);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.snapshot);
  }
}

export class DuplicateSmartArtItemCmd implements EditCommand {
  readonly label = "Duplicate diagram item";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly itemIndex: number,
    private readonly snapshot: SmartArtItem[],
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    const items = extractSmartArtItems(g);
    if (this.itemIndex < 0 || this.itemIndex >= items.length) return;
    const src = items[this.itemIndex]!;
    const copy: SmartArtItem = {
      id: `item_${items.length + 1}_${Date.now()}`,
      text: src.text ? `${src.text} (copy)` : "Copy",
      lvl: src.lvl,
      imageSrc: src.imageSrc,
    };
    const next = [...items];
    next.splice(this.itemIndex + 1, 0, copy);
    rebuildSmartArtChildren(g, next);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.snapshot);
  }
}

export class ClearSmartArtPicturesCmd implements EditCommand {
  readonly label = "Clear diagram pictures";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly snapshot: SmartArtItem[],
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    const items = extractSmartArtItems(g).map((item) => {
      if (!item.imageSrc) return item;
      const next = { ...item };
      delete next.imageSrc;
      return next;
    });
    rebuildSmartArtChildren(g, items);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.snapshot);
  }
}

export class RemoveSmartArtItemCmd implements EditCommand {
  readonly label = "Remove diagram item";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly snapshot: SmartArtItem[],
    private readonly itemIndex?: number,
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    const items = extractSmartArtItems(g);
    if (items.length <= 1) return;
    const idx = this.itemIndex ?? items.length - 1;
    if (idx < 0 || idx >= items.length) return;
    items.splice(idx, 1);
    rebuildSmartArtChildren(g, items);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.snapshot);
  }
}

export class MoveSmartArtItemCmd implements EditCommand {
  readonly label = "Reorder diagram item";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly itemIndex: number,
    private readonly direction: -1 | 1,
    private readonly snapshot: SmartArtItem[],
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    const items = extractSmartArtItems(g);
    const j = this.itemIndex + this.direction;
    if (j < 0 || j >= items.length) return;
    const tmp = items[this.itemIndex]!;
    items[this.itemIndex] = items[j]!;
    items[j] = tmp;
    rebuildSmartArtChildren(g, items);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.snapshot);
  }
}

export class SetSmartArtItemLevelCmd implements EditCommand {
  readonly label = "Change diagram level";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly itemIndex: number,
    private readonly delta: -1 | 1,
    private readonly snapshot: SmartArtItem[],
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    const items = extractSmartArtItems(g);
    const it = items[this.itemIndex];
    if (!it) return;
    const next = Math.max(0, (it.lvl ?? 0) + this.delta);
    it.lvl = next;
    rebuildSmartArtChildren(g, items);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    rebuildSmartArtChildren(g, this.snapshot);
  }
}

export class SetSmartArtLayoutCmd implements EditCommand {
  readonly label = "Change diagram layout";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly layout: SmartArtLayoutKind,
    private readonly prevLayout: SmartArtLayoutKind,
    private readonly itemsSnapshot: SmartArtItem[],
  ) {}
  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    g.smartArtMeta = { layout: this.layout };
    rebuildSmartArtChildren(g, this.itemsSnapshot, this.layout);
  }
  revert(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    g.smartArtMeta = { layout: this.prevLayout };
    rebuildSmartArtChildren(g, this.itemsSnapshot, this.prevLayout);
  }
}

/** 将文本框（含 bullets 多段）替换为 SmartArt group。 */
export class ConvertToSmartArtCmd implements EditCommand {
  readonly label = "Convert to diagram";
  private removed?: Shape;
  private layerIdx?: number;
  private groupId?: string;
  /** Populated on apply for collab wire (full group + placement). */
  private inserted?: { layerIdx: number; index: number; group: Shape };

  constructor(
    private readonly slideIdx: number,
    private readonly shapeId: string,
    private readonly layout?: SmartArtLayoutKind,
  ) {}

  apply(pres: Presentation): void {
    const slide = pres.slides[this.slideIdx];
    if (!slide) return;
    const sh = findShape(slide, this.shapeId);
    if (!sh || sh.kind !== "text") return;
    const group = convertTextShapeToSmartArt(sh, this.layout);
    this.groupId = group.id;
    for (let li = 0; li < slide.layers.length; li++) {
      const layer = slide.layers[li]!;
      const pos = layer.shapes.findIndex((s) => s.id === this.shapeId);
      if (pos < 0) continue;
      this.removed = layer.shapes[pos]!;
      this.layerIdx = li;
      layer.shapes.splice(pos, 1, group);
      this.inserted = { layerIdx: li, index: pos, group: structuredClone(group) };
      return;
    }
  }

  revert(pres: Presentation): void {
    if (!this.removed || this.layerIdx === undefined || !this.groupId) return;
    const slide = pres.slides[this.slideIdx];
    const layer = slide?.layers[this.layerIdx];
    if (!layer) return;
    const idx = layer.shapes.findIndex((s) => s.id === this.groupId);
    if (idx < 0) return;
    layer.shapes.splice(idx, 1, this.removed);
  }
}
