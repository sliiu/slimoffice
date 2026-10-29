import type { SceneNode } from "./scene-node";

/**
 * 撤销单个 SceneNode 的绘制变换，与 canvas/svg backend 对偶：
 * translate(tx,ty) → rotate around bbox center → scale around center。
 */
export function inverseSceneNode(n: SceneNode, x: number, y: number): { x: number; y: number } {
  const s = n.shape;
  const cx = s.bbox.x + s.bbox.w / 2;
  const cy = s.bbox.y + s.bbox.h / 2;
  let lx = x - n.tx;
  let ly = y - n.ty;
  if (n.rotation) {
    const a = (-n.rotation * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const dx = lx - cx;
    const dy = ly - cy;
    lx = cx + dx * cos - dy * sin;
    ly = cy + dx * sin + dy * cos;
  }
  const flipX = s.transform?.scaleX ?? 1;
  const flipY = s.transform?.scaleY ?? 1;
  const sx = n.scale * n.scaleX * n.widthScale * (flipX < 0 ? -1 : 1);
  const sy = n.scale * n.scaleY * n.heightScale * (flipY < 0 ? -1 : 1);
  if (sx !== 1 && sx !== 0) lx = (lx - cx) / sx + cx;
  if (sy !== 1 && sy !== 0) ly = (ly - cy) / sy + cy;
  return { x: lx, y: ly };
}

/** 世界坐标 → 该节点未旋转 bbox 空间（含祖先 group 变换）。 */
export function worldToLocal(node: SceneNode, x: number, y: number): { x: number; y: number } {
  const chain: SceneNode[] = [];
  for (let n: SceneNode | null = node; n; n = n.parent) chain.push(n);
  chain.reverse();
  let p = { x, y };
  for (const n of chain) p = inverseSceneNode(n, p.x, p.y);
  return p;
}

export function hitTestNodeBBox(node: SceneNode, worldX: number, worldY: number): boolean {
  const p = worldToLocal(node, worldX, worldY);
  const b = node.shape.bbox;
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}
