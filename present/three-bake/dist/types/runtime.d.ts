import type { Shape, Slide, Sp3DInfo } from "@sliiu/present-core";
import type { Shape3DResult } from "./types.js";
/**
 * 该 3D 信息是否需要 3D 渲染（实时 or 烘焙）。parser 现在对 `<a:bevelT/>` 留空 w/h，
 * 所以用「是否声明了 bevel 元素」判断，而非 h>0。
 */
export declare function needs3DRender(meta: Sp3DInfo | undefined): boolean;
export declare function needs3DBake(s: Shape): boolean;
export interface Bake3DRuntime {
    /**
     * 扫描 slide，找出需要烘焙的 3D shape 异步烘焙。同一 shape.id 不会重复。
     * `applyBaked` 在烘焙完成时被调用，由调用方负责把结果写入副通道并按需触发 redraw。
     */
    kick(slide: Slide, applyBaked: (s: Shape, result: Shape3DResult) => void, opts?: {
        frontImageSrc?: (s: Shape) => string | undefined;
    }): void;
    /** 等待所有 pending 烘焙完成（截图前调）。 */
    waitForAll(): Promise<void>;
    /** 标记 shape.id 已处理过（跨重建避免重复）。 */
    markBaked(id: string): void;
}
export declare function createBake3DRuntime(): Bake3DRuntime;
