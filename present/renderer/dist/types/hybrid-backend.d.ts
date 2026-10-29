import type { Scene } from "./scene-node.js";
import { SvgBackend } from "./svg-backend.js";
export interface HybridBackendOptions {
    background?: string;
    interactive?: boolean;
    /** 传给 SVG 段。false 时伸出幻灯片的矢量形状仍画在工作区里。 */
    clipToSlide?: boolean;
}
export declare class HybridBackend {
    readonly host: HTMLElement;
    readonly svg: SvgBackend;
    private wrapper;
    private backends;
    constructor(scene: Scene, container: HTMLElement, opts?: HybridBackendOptions);
    get svgRoot(): SVGSVGElement;
    /** 同步刷新所有子 backend；详见 SvgBackend.flush。 */
    flush(): void;
    /** 等待所有 live 3D（WebGLShapeBackend）首帧就绪——截图 / visual-compare 前调。 */
    waitForReady(): Promise<void>;
    destroy(): void;
}
