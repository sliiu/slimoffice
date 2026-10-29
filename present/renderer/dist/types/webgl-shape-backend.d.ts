import type { Shape } from "@sliiu/present-core";
import type { Scene } from "./scene-node.js";
export interface WebGLShapeBackendOptions {
    shapeFilter?: (s: Shape) => boolean;
}
export declare class WebGLShapeBackend {
    private scene;
    private space;
    private managed;
    private dispose;
    private dpr;
    private k;
    private rafId;
    private ro;
    private readyResolvers;
    constructor(scene: Scene, container: HTMLElement, opts?: WebGLShapeBackendOptions);
    private add;
    /** 用（可能为空的）贴图构建 three 场景 + 相机，写回 managed 并触发首渲。 */
    private buildManaged;
    private getRenderer;
    private scheduleSync;
    private syncTransforms;
    private syncOne;
    private scheduleGlRender;
    private glRenderAll;
    private glRenderOne;
    flush(): void;
    /** 所有 3D shape 的贴图都加载完、场景已构建并首渲后 resolve（截图前等待用）。 */
    whenReady(): Promise<void>;
    private isReady;
    private checkReady;
    destroy(): void;
}
