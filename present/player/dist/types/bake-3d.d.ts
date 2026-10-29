import type { Slide } from "@sliiu/present-core";
import { type Scene } from "@sliiu/present-renderer";
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
export declare function createBake3DRuntime(opts?: Bake3DRuntimeOpts): Bake3DRuntime;
