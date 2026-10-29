// 高层 runtime helper：把 bakeSp3d 接到任意持有 Scene 的离屏光栅消费者
// （thumbnail=SvgBackend / snapshot+pdf=CanvasBackend）上。bake 完成后通过 `applyBaked`
// 回调把结果交给 caller 写入**副通道**（meta3D.bakedSrc 等），由那些后端读取显示。
// player/editor 的实时视图不走这里，改用 packages/renderer 的 WebGLShapeBackend。
//
// 触发条件见 needs3DRender：相机 rot 非平凡 / extrusionH>0 / 声明了 bevel。
// 性能：bake 是 OffscreenCanvas + WebGLRenderer 的一次性渲染，per-shape 30-100 ms。

import type { Shape, Slide, Sp3DInfo } from "@ppt/core";
import { bakeSp3d } from "./bake-sp3d";
import { shape3DInfo, shape3DPathD, shapeSupports3D } from "./shape-path";
import type { Shape3DResult } from "./types";

/**
 * 该 3D 信息是否需要 3D 渲染（实时 or 烘焙）。parser 现在对 `<a:bevelT/>` 留空 w/h，
 * 所以用「是否声明了 bevel 元素」判断，而非 h>0。
 */
export function needs3DRender(meta: Sp3DInfo | undefined): boolean {
  if (!meta) return false;
  const rot = meta.scene3d?.camera?.rot;
  const hasRot = !!rot && Math.abs(rot.lat) + Math.abs(rot.lon) + Math.abs(rot.rev) > 0.01;
  const ext = meta.sp3d?.extrusionH ?? 0;
  const hasBevel = !!(meta.sp3d?.bevelT || meta.sp3d?.bevelB);
  return hasRot || ext > 0 || hasBevel;
}

function readMeta(s: Shape): Sp3DInfo | undefined {
  return shape3DInfo(s);
}

// 烘焙输出的几何/参数签名：bakeSp3d 的全部输入（bbox / fill / stroke / sp3d / scene3d /
// src / cropRect）。任一变化 → 签名变化 → 需要重烘。id 是身份不入签名。
function bakeKeyOf(s: Shape): string {
  const meta = readMeta(s);
  return JSON.stringify({
    k: s.kind,
    b: s.bbox ?? null,
    f: s.fill ?? null,
    st: s.stroke ?? null,
    sp: meta?.sp3d ?? null,
    sc: meta?.scene3d ?? null,
    src: s.kind === "image" ? s.src ?? null : null,
    cr: s.kind === "image" ? s.cropRect ?? null : null,
    d: s.kind === "path" ? s.d : s.kind === "polygon" ? s.points : null,
    tx: s.kind === "text" ? s.paragraphs : null,
  });
}

// 该 shape 当前是否需要（重新）烘焙：image / 自选形状 / 带 body3D 的文字，
// 需要 3D 渲染，且"当前几何签名"与上次烘焙记录的 bakedKey 不一致
// （首次烘焙时 bakedKey 为 undefined，必然不一致）。
export function needs3DBake(s: Shape): boolean {
  if (!shapeSupports3D(s)) return false;
  const meta = readMeta(s);
  if (!meta || !needs3DRender(meta)) return false;
  return meta.bakedKey !== bakeKeyOf(s);
}

function shouldBake(s: Shape): boolean {
  return needs3DBake(s);
}

function walkShapes(slide: Slide, fn: (s: Shape) => void): void {
  for (const layer of slide.layers) {
    const stack: Array<[Shape[], number]> = [[layer.shapes, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const [arr, i] = top;
      if (i >= arr.length) {
        stack.pop();
        continue;
      }
      const s = arr[i]!;
      top[1] = i + 1;
      fn(s);
      if (s.kind === "group") stack.push([s.children, 0]);
    }
  }
}

export interface Bake3DRuntime {
  /**
   * 扫描 slide，找出需要烘焙的 3D shape 异步烘焙。同一 shape.id 不会重复。
   * `applyBaked` 在烘焙完成时被调用，由调用方负责把结果写入副通道并按需触发 redraw。
   */
  kick(
    slide: Slide,
    applyBaked: (s: Shape, result: Shape3DResult) => void,
    opts?: { frontImageSrc?: (s: Shape) => string | undefined },
  ): void;
  /** 等待所有 pending 烘焙完成（截图前调）。 */
  waitForAll(): Promise<void>;
  /** 标记 shape.id 已处理过（跨重建避免重复）。 */
  markBaked(id: string): void;
}

export function createBake3DRuntime(): Bake3DRuntime {
  // markBaked 强制跳过集合（外部显式声明"别再烘这个 id"）。
  const forceSkip = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();

  const bakeOne = async (
    s: Shape,
    applyBaked: (s: Shape, result: Shape3DResult) => void,
    frontImageSrc?: (s: Shape) => string | undefined,
  ): Promise<void> => {
    const meta = readMeta(s);
    if (!meta) return;
    // 在烘焙前快照签名：bake 是异步的，期间用户可能又动了 shape；用快照写回 bakedKey
    // 保证"已烘的就是这个签名"，若烘焙期间又变了，下一轮 kick 的签名不一致会再烘。
    const key = bakeKeyOf(s);
    const front = s.kind === "text" ? frontImageSrc?.(s) : undefined;
    const isPicture = s.kind === "image" || !!front;
    try {
      const result = await bakeSp3d({
        id: s.id,
        bbox: s.bbox,
        pathD: isPicture ? undefined : shape3DPathD(s),
        fill: s.fill,
        stroke: s.stroke,
        sp3d: meta.sp3d ?? {},
        scene3d: meta.scene3d,
        imageSrc: s.kind === "image" ? s.src : front,
        cropRect: s.kind === "image" ? s.cropRect : undefined,
      });
      // baked/bakedKey 仅作 dedupe；不改 shape.src/bbox/cropRect，让 live 视图保持原始几何。
      meta.baked = true;
      if (result) applyBaked(s, result);
    } catch {
      // 烘焙失败不致命，仍能看到 2D 图。
    } finally {
      // 成功或失败都记录签名（避免失败时无限重试）；下次几何变化签名变了再烘。
      meta.bakedKey = key;
    }
  };

  return {
    kick(slide, applyBaked, opts) {
      const front = opts?.frontImageSrc;
      walkShapes(slide, (s) => {
        if (forceSkip.has(s.id) || inFlight.has(s.id)) return;
        if (!shouldBake(s)) return;
        const p = bakeOne(s, applyBaked, front).then(() => {
          inFlight.delete(s.id);
        });
        inFlight.set(s.id, p);
      });
    },
    async waitForAll() {
      while (inFlight.size > 0) {
        await Promise.all(Array.from(inFlight.values()));
      }
      if (typeof requestAnimationFrame !== "undefined") {
        await new Promise<void>((r) => {
          requestAnimationFrame(() => requestAnimationFrame(() => r()));
        });
      }
    },
    markBaked(id) {
      forceSkip.add(id);
    },
  };
}
