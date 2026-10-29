// Player 侧的 3D bake 适配器：把 packages/three-bake 的通用 Bake3DRuntime 嫁接到
// Scene 上。bake 完成时通过 `setProperty` 把 baked PNG 写回 scene-node，触发
// svg-backend / canvas-backend 的 redraw。原来的实现内联在这里、又在 editor 端
// 不可用，现在通用部分（walk slide / dedupe / waitForAll）下沉到 three-bake/runtime.ts。

import { createBake3DRuntime as createCore, needs3DBake, shape3DInfo, type Bake3DRuntime as CoreRuntime } from "@ppt/three-bake";
import type { Shape, Slide } from "@ppt/core";
import { shapeFrontImageSrc, type Scene } from "@ppt/renderer";

export interface Bake3DRuntimeOpts {
  /**
   * 一张 slide 上 **所有** sp3d image 都 bake 完成（或失败）后触发一次。宿主用它
   * 刷新该 slide 的缩略图——bake mutate 了 `shape.src/bbox`，重建 thumbnail 的
   * Scene 就能拿到 baked 状态，不再出现"缩略图扁平 / 舞台立体"的不一致。
   */
  onSlideBaked?: (slide: Slide) => void;
}

export interface Bake3DRuntime {
  kick(slide: Slide, scene: Scene): void;
  waitForAll(): Promise<void>;
}

export function createBake3DRuntime(opts: Bake3DRuntimeOpts = {}): Bake3DRuntime {
  const core: CoreRuntime = createCore();
  // 用 slide 引用做 dedupe key：相同 slide 重复 kick 不会重复发 onSlideBaked，但
  // bake 过的 slide 在 shape.src 已经被替换、再 kick 时 core.shouldBake 自然返回
  // false 不会重新 bake，所以也不会把 onSlideBaked 抛重复。
  const pendingByslide = new WeakMap<Slide, number>();
  return {
    kick(slide, scene) {
      let pending = 0;
      const onOne = (): void => {
        pending -= 1;
        const left = (pendingByslide.get(slide) ?? 1) - 1;
        pendingByslide.set(slide, left);
        if (left <= 0) {
          opts.onSlideBaked?.(slide);
        }
      };
      // 先扫一遍，统计本轮 kick 实际会跑多少 bake，再调用 core.kick 让它真的执行。
      // core 内部已经有 baked Set / inFlight Map dedupe，所以这里 wrap 的回调和
      // core 自己的 walk 顺序保持一致就好。
      const before = countPendingBakes(slide);
      pending = before;
      pendingByslide.set(slide, before);
      if (before === 0) {
        // 没有需要 bake 的：立即触发一次（让宿主在切到该 slide 时也能确认"已经
        // 是终态"——主要是兜底，UI 一般不依赖）。
        opts.onSlideBaked?.(slide);
        return;
      }
      core.kick(slide, (s: Shape, result) => {
        // 写入**副通道**而非直接改 shape.src/bbox：SvgBackend（缩略图）/ CanvasBackend
        // （截图/PDF）读 bakedSrc 显示 3D PNG；live WebGLShapeBackend 忽略它、
        // 实时渲染原始几何，两条路径互不污染。文字写在 body3D 上。
        const info = shape3DInfo(s);
        if (info) {
          info.bakedSrc = result.src;
          info.bakedBBox = result.paddedBBox;
          info.bakedNatural = result.natural;
        }
        const node = scene.root.findById(s.id);
        node?.markDirty();
        onOne();
      }, {
        frontImageSrc: (s) => shapeFrontImageSrc(scene, s),
      });
      // bake 失败 / no-op 的也要 decrement。core.kick 不发 callback 给 skipped 的
      // shape，所以这里在 micro-task 末尾如果 pending 还没归零，等 waitForAll 之
      // 后再补。
      void core.waitForAll().then(() => {
        // 用 pendingByslide 的值兜底：如果还有残余（bake 失败），强制归 0 触发。
        const left = pendingByslide.get(slide) ?? 0;
        if (left > 0) {
          pendingByslide.set(slide, 0);
          opts.onSlideBaked?.(slide);
        }
      });
    },
    waitForAll: () => core.waitForAll(),
  };
}

function countPendingBakes(slide: Slide): number {
  let n = 0;
  const walk = (s: Shape): void => {
    if (needs3DBake(s)) n += 1;
    if (s.kind === "group") {
      for (const c of s.children) walk(c);
    }
  };
  for (const layer of slide.layers) for (const s of layer.shapes) walk(s);
  return n;
}
