import type { Rect } from "@ppt/core";
import type { Scene, SceneNode } from "./scene-node";

export interface HitOptions {
  ignoreLocked?: boolean;
}

export class Selection {
  private ids = new Set<string>();
  private listeners = new Set<(ids: Set<string>) => void>();

  get(): string[] {
    return [...this.ids];
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  set(ids: string[]): void {
    this.ids = new Set(ids);
    this.fire();
  }

  add(id: string): void {
    this.ids.add(id);
    this.fire();
  }

  remove(id: string): void {
    this.ids.delete(id);
    this.fire();
  }

  toggle(id: string): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
    this.fire();
  }

  clear(): void {
    if (this.ids.size === 0) return;
    this.ids.clear();
    this.fire();
  }

  on(fn: (ids: Set<string>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private fire(): void {
    for (const l of this.listeners) l(this.ids);
  }
}

export function nodeWorldBBox(node: SceneNode): Rect {
  const b = node.shape.bbox;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const flipX = node.shape.transform?.scaleX ?? 1;
  const flipY = node.shape.transform?.scaleY ?? 1;
  const sx = node.scale * node.scaleX * node.widthScale * (flipX < 0 ? -1 : 1);
  const sy = node.scale * node.scaleY * node.heightScale * (flipY < 0 ? -1 : 1);
  return {
    x: b.x + node.tx + (1 - sx) * (cx - b.x),
    y: b.y + node.ty + (1 - sy) * (cy - b.y),
    w: b.w * sx,
    h: b.h * sy,
  };
}

export function hitTest(scene: Scene, x: number, y: number, opts: HitOptions = {}): SceneNode | null {
  let result: SceneNode | null = null;
  const visit = (node: SceneNode) => {
    if (node.shape.kind !== "group") {
      if (opts.ignoreLocked && node.shape.locked) return;
      if (pointInNode(node, x, y)) result = node;
    }
    for (const c of node.children) visit(c);
  };
  visit(scene.root);
  return result;
}

export function pointInNode(node: SceneNode, x: number, y: number): boolean {
  const b = node.shape.bbox;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let lx = x - node.tx;
  let ly = y - node.ty;
  const flipX = node.shape.transform?.scaleX ?? 1;
  const flipY = node.shape.transform?.scaleY ?? 1;
  const sx = node.scale * node.scaleX * node.widthScale * (flipX < 0 ? -1 : 1);
  const sy = node.scale * node.scaleY * node.heightScale * (flipY < 0 ? -1 : 1);
  if (sx !== 1) lx = (lx - cx) / sx + cx;
  if (sy !== 1) ly = (ly - cy) / sy + cy;
  if (node.rotation !== 0) {
    const a = (-node.rotation * Math.PI) / 180;
    const dx = lx - cx;
    const dy = ly - cy;
    lx = cx + dx * Math.cos(a) - dy * Math.sin(a);
    ly = cy + dx * Math.sin(a) + dy * Math.cos(a);
  }
  if (node.shape.kind === "ellipse") {
    const rx = b.w / 2;
    const ry = b.h / 2;
    const dx = (lx - cx) / rx;
    const dy = (ly - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h;
}

export function attachPointerSelection(
  hostEl: HTMLElement,
  scene: Scene,
  selection: Selection,
): () => void {
  const onClick = (e: PointerEvent) => {
    const rect = hostEl.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * (scene.width / rect.width);
    const sy = (e.clientY - rect.top) * (scene.height / rect.height);
    const hit = hitTest(scene, sx, sy);
    if (!hit) {
      if (!e.shiftKey) selection.clear();
      return;
    }
    if (e.shiftKey) selection.toggle(hit.id);
    else selection.set([hit.id]);
  };
  hostEl.addEventListener("pointerdown", onClick);
  return () => hostEl.removeEventListener("pointerdown", onClick);
}
