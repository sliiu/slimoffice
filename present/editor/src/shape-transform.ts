// ============================================================================
// Shape 世界变换：与 renderer scene-node / svg-backend 的公式对偶
// ----------------------------------------------------------------------------
// parser 把 group 子 shape 的 bbox 写成 slide 绝对坐标，但 group 自身的
// rotation / flipH / flipV / tx / ty 仍挂在 group.transform 上，渲染时由父
// <g> 一次性套到所有孩子。
//
// 编辑器的选中框 / 行内文本 overlay / 命中测试如果只读叶子 bbox，就会和
// 画面上"已经被父 group 转过 / 翻过"的文字错位——典型场景是解析后的
// TextBox（带 txBody 的形状会拆成 group(_base, _text)，旋转留在外层 group）。
// ============================================================================
import type { Rect, Shape, Transform } from "@ppt/core";

/** bbox + transform，命中测试 / 锚点补偿不需要完整 Shape。 */
export type XfrmNode = { bbox: Rect; transform?: Transform };

export function shapeCenter(s: { bbox: Rect }): { x: number; y: number } {
  return { x: s.bbox.x + s.bbox.w / 2, y: s.bbox.y + s.bbox.h / 2 };
}

function flipSign(v: number | undefined): 1 | -1 {
  return (v ?? 1) < 0 ? -1 : 1;
}

function isIdentityNodeTransform(s: XfrmNode): boolean {
  const t = s.transform;
  if (!t) return true;
  return (
    (t.tx ?? 0) === 0 &&
    (t.ty ?? 0) === 0 &&
    (t.rotation ?? 0) === 0 &&
    flipSign(t.scaleX) === 1 &&
    flipSign(t.scaleY) === 1
  );
}

function rotateAround(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number,
): { x: number; y: number } {
  if (!deg) return { x, y };
  const a = (deg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(a) - dy * Math.sin(a),
    y: cy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** 原点上的线性部分：先 flip 再 rotate（与 svg-backend 一致）。 */
function linearForward(x: number, y: number, rot: number, sx: number, sy: number): { x: number; y: number } {
  return rotateAround(x * sx, y * sy, 0, 0, rot);
}

function linearInverse(x: number, y: number, rot: number, sx: number, sy: number): { x: number; y: number } {
  const u = rotateAround(x, y, 0, 0, -rot);
  return { x: u.x * sx, y: u.y * sy };
}

/**
 * 撤销单个 shape 的 scene-node 变换（tx/ty，再绕 bbox 中心 rotate / flip）。
 * 正向（svg-backend）：translate(tx,ty) → rotate/scale around center。
 */
export function inverseNodeTransform(s: XfrmNode, x: number, y: number): { x: number; y: number } {
  if (isIdentityNodeTransform(s)) return { x, y };
  const t = s.transform!;
  let lx = x - (t.tx ?? 0);
  let ly = y - (t.ty ?? 0);
  const c = shapeCenter(s);
  const rot = t.rotation ?? 0;
  if (rot !== 0) {
    const p = rotateAround(lx, ly, c.x, c.y, -rot);
    lx = p.x;
    ly = p.y;
  }
  const sx = flipSign(t.scaleX);
  const sy = flipSign(t.scaleY);
  if (sx !== 1) lx = (lx - c.x) / sx + c.x;
  if (sy !== 1) ly = (ly - c.y) / sy + c.y;
  return { x: lx, y: ly };
}

/**
 * 正向：local → slide。对偶 inverseNodeTransform。
 * 公式：flip around center → rotate around center → translate(tx,ty)。
 */
export function applyNodeTransform(s: XfrmNode, x: number, y: number): { x: number; y: number } {
  if (isIdentityNodeTransform(s)) return { x, y };
  const t = s.transform!;
  const c = shapeCenter(s);
  const sx = flipSign(t.scaleX);
  const sy = flipSign(t.scaleY);
  if (sx !== 1) x = (x - c.x) * sx + c.x;
  if (sy !== 1) y = (y - c.y) * sy + c.y;
  const rot = t.rotation ?? 0;
  if (rot !== 0) {
    const p = rotateAround(x, y, c.x, c.y, rot);
    x = p.x;
    y = p.y;
  }
  return { x: x + (t.tx ?? 0), y: y + (t.ty ?? 0) };
}

/** 缩放手柄的对侧锚点（该点在世界坐标里应保持不动）。 */
export function oppositeHandlePoint(b: Rect, corner: string): { x: number; y: number } {
  let x = b.x + b.w / 2;
  let y = b.y + b.h / 2;
  if (corner.includes("e")) x = b.x;
  else if (corner.includes("w")) x = b.x + b.w;
  if (corner.includes("s")) y = b.y;
  else if (corner.includes("n")) y = b.y + b.h;
  return { x, y };
}

/**
 * 旋转 / 翻转后改 bbox 会移动旋转中心，视觉上整块形状会滑走。
 * 平移 next，让对侧手柄的世界坐标与 start 时一致。
 */
export function keepOppositeHandleWorld(
  transform: Transform | undefined,
  start: Rect,
  next: Rect,
  corner: string,
): Rect {
  const node = { bbox: start, transform };
  if (isIdentityNodeTransform(node)) return next;
  const opp0 = oppositeHandlePoint(start, corner);
  const opp1 = oppositeHandlePoint(next, corner);
  const w0 = applyNodeTransform(node, opp0.x, opp0.y);
  const w1 = applyNodeTransform({ bbox: next, transform }, opp1.x, opp1.y);
  return { ...next, x: next.x + w0.x - w1.x, y: next.y + w0.y - w1.y };
}

function pointsBbox(points: Array<[number, number]>): Rect {
  if (!points.length) return { x: 0, y: 0, w: 1, h: 1 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [px, py] of points) {
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * 把世界坐标点重新编码回「未旋转局部点 + 绕 bbox 中心的 rot/flip」。
 * 改线/多边形锚点后 bbox 中心会变；不重编码的话旋转枢轴一移，整段形状就跳。
 */
export function relocalizeWorldPoints(
  worldPts: Array<[number, number]>,
  transform: Transform | undefined,
): { points: Array<[number, number]>; bbox: Rect } {
  const t = transform;
  const rot = t?.rotation ?? 0;
  const sx = flipSign(t?.scaleX);
  const sy = flipSign(t?.scaleY);
  const tx = t?.tx ?? 0;
  const ty = t?.ty ?? 0;
  const unT = worldPts.map(([x, y]) => ({ x: x - tx, y: y - ty }));
  if (rot === 0 && sx === 1 && sy === 1) {
    const points = unT.map((p) => [p.x, p.y] as [number, number]);
    return { points, bbox: pointsBbox(points) };
  }
  const primed = unT.map((p) => linearInverse(p.x, p.y, rot, sx, sy));
  const aabbP = pointsBbox(primed.map((p) => [p.x, p.y]));
  const cP = { x: aabbP.x + aabbP.w / 2, y: aabbP.y + aabbP.h / 2 };
  const c = linearForward(cP.x, cP.y, rot, sx, sy);
  const local = unT.map((p) => {
    const inv = linearInverse(p.x - c.x, p.y - c.y, rot, sx, sy);
    return [c.x + inv.x, c.y + inv.y] as [number, number];
  });
  return { points: local, bbox: pointsBbox(local) };
}

/** 祖先 group 的累计翻转奇偶性（不含 shape 自身）。 */
export function ancestorFlipParity(ancestors: readonly Shape[]): { x: number; y: number } {
  let x = 1;
  let y = 1;
  for (const s of ancestors) {
    if (flipSign(s.transform?.scaleX) < 0) x = -x;
    if (flipSign(s.transform?.scaleY) < 0) y = -y;
  }
  return { x, y };
}

/**
 * 单个 shape 的 SVG transform 属性片段，坐标系 = slide。
 * 与 svg-backend redraw 写到 <g> 上的公式一致。
 */
export function nodeSvgTransform(s: Shape): string {
  if (isIdentityNodeTransform(s)) return "";
  const t = s.transform!;
  const tx = t.tx ?? 0;
  const ty = t.ty ?? 0;
  const rot = t.rotation ?? 0;
  const sx = flipSign(t.scaleX);
  const sy = flipSign(t.scaleY);
  const c = shapeCenter(s);
  const parts: string[] = [];
  if (tx !== 0 || ty !== 0) parts.push(`translate(${tx},${ty})`);
  if (rot !== 0 || sx !== 1 || sy !== 1) {
    parts.push(`translate(${c.x},${c.y})`);
    if (rot !== 0) parts.push(`rotate(${rot})`);
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx},${sy})`);
    parts.push(`translate(${-c.x},${-c.y})`);
  }
  return parts.join(" ");
}

/** 从外到内拼接 ancestors + self，给选中框用。 */
export function composeSvgTransforms(shapes: readonly Shape[]): string {
  return shapes.map(nodeSvgTransform).filter(Boolean).join(" ");
}

function cssNodeTransform(
  s: Shape,
  overlaySlideOrigin: { x: number; y: number },
  scale: number,
): string {
  if (isIdentityNodeTransform(s)) return "";
  const t = s.transform!;
  const tx = (t.tx ?? 0) * scale;
  const ty = (t.ty ?? 0) * scale;
  const rot = t.rotation ?? 0;
  const sx = flipSign(t.scaleX);
  const sy = flipSign(t.scaleY);
  const cx = (s.bbox.x + s.bbox.w / 2 - overlaySlideOrigin.x) * scale;
  const cy = (s.bbox.y + s.bbox.h / 2 - overlaySlideOrigin.y) * scale;
  const parts: string[] = [];
  if (tx !== 0 || ty !== 0) parts.push(`translate(${tx}px, ${ty}px)`);
  if (rot !== 0 || sx !== 1 || sy !== 1) {
    parts.push(`translate(${cx}px, ${cy}px)`);
    if (rot !== 0) parts.push(`rotate(${rot}deg)`);
    if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
    parts.push(`translate(${-cx}px, ${-cy}px)`);
  }
  return parts.join(" ");
}

export interface OverlayBoxGeom {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * 行内 overlay 的 CSS transform。
 *
 * 无祖先时保持 `rotate(Ndeg)` + origin center，和旧行为字节级一致。
 * 有祖先 group 时改成 origin 0 0 的变换链：先自身旋转（含 bodyRot/vert），
 * 再按祖先 flip 绕 overlay 中心反向一次（字形保持可读，与 netFlipParity 一致），
 * 最后套上每个祖先绕**自己中心**的 rotate/flip/tx/ty。
 */
export function overlayWorldTransformCss(
  box: OverlayBoxGeom,
  scale: number,
  ancestors: readonly Shape[] = [],
): { css: string; origin: "center center" | "0 0" } {
  const overlayOrigin = scale === 0 ? { x: 0, y: 0 } : { x: box.left / scale, y: box.top / scale };
  const ancestorParts = ancestors
    .map((a) => cssNodeTransform(a, overlayOrigin, scale))
    .filter(Boolean);
  const flip = ancestorFlipParity(ancestors);
  const needsComposed = ancestorParts.length > 0 || flip.x < 0 || flip.y < 0;
  if (!needsComposed) {
    return { css: box.rotation ? `rotate(${box.rotation}deg)` : "", origin: "center center" };
  }
  const parts: string[] = [...ancestorParts];
  const hx = box.width / 2;
  const hy = box.height / 2;
  if (flip.x < 0 || flip.y < 0) {
    parts.push(
      `translate(${hx}px, ${hy}px) scale(${flip.x}, ${flip.y}) translate(${-hx}px, ${-hy}px)`,
    );
  }
  if (box.rotation) {
    parts.push(
      `translate(${hx}px, ${hy}px) rotate(${box.rotation}deg) translate(${-hx}px, ${-hy}px)`,
    );
  }
  return { css: parts.join(" "), origin: "0 0" };
}
