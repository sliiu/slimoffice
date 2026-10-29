import type { Shape } from "@sliiu/present-core";
import type { Scene } from "./scene-node.js";
export interface WebGLModel3DBackendOptions {
    shapeFilter?: (s: Shape) => boolean;
    interactive?: boolean;
}
export declare class WebGLModel3DBackend {
    private space;
    private managed;
    private dispose;
    private k;
    private rafId;
    private readyResolvers;
    constructor(scene: Scene, container: HTMLElement, opts?: WebGLModel3DBackendOptions);
    private add;
    private bindOrbit;
    private syncWrapper;
    private scheduleRender;
    private renderAll;
    private resolveReady;
    orbitModel3D(shapeId: string, dLon: number, dLat: number): boolean;
    flush(): void;
    whenReady(): Promise<void>;
    destroy(): void;
}
