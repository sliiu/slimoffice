import type { Shape } from "@ppt/core";
import type { Scene } from "./scene-node";
import { SvgBackend } from "./svg-backend";
import { CanvasBackend } from "./canvas-backend";
import { WebGLShapeBackend } from "./webgl-shape-backend";
import { WebGLModel3DBackend } from "./webgl-model3d-backend";
import { buildHybridSegments } from "./hybrid-segments";

export interface HybridBackendOptions {
  background?: string;
  interactive?: boolean;
  /** 传给 SVG 段。false 时伸出幻灯片的矢量形状仍画在工作区里。 */
  clipToSlide?: boolean;
}

export class HybridBackend {
  readonly host: HTMLElement;
  readonly svg: SvgBackend;
  private wrapper: HTMLDivElement;
  private backends: Array<{ destroy(): void; flush?(): void; whenReady?(): Promise<void> }> = [];

  constructor(scene: Scene, container: HTMLElement, opts: HybridBackendOptions = {}) {
    this.wrapper = document.createElement("div");
    this.wrapper.style.position = "relative";
    this.wrapper.style.width = "100%";
    this.wrapper.style.height = "100%";
    this.wrapper.style.background = opts.background ?? "transparent";
    container.appendChild(this.wrapper);

    const segments = buildHybridSegments(scene.root.children);
    let firstSvg: SvgBackend | null = null;

    for (const seg of segments) {
      const layer = document.createElement("div");
      layer.style.position = "absolute";
      layer.style.inset = "0";
      layer.style.width = "100%";
      layer.style.height = "100%";
      this.wrapper.appendChild(layer);
      const ids = new Set(seg.ids);
      const filter = (s: Shape) => ids.has(s.id);
      if (seg.kind === "canvas") {
        this.backends.push(
          new CanvasBackend(scene, layer, { shapeFilter: filter, transparent: true }),
        );
      } else if (seg.kind === "webgl") {
        layer.style.pointerEvents = "none";
        this.backends.push(new WebGLShapeBackend(scene, layer, { shapeFilter: filter }));
      } else if (seg.kind === "webglm3d") {
        layer.style.pointerEvents = "none";
        this.backends.push(
          new WebGLModel3DBackend(scene, layer, { shapeFilter: filter, interactive: opts.interactive }),
        );
      } else {
        // 这一层必须能接到指针。HTML 祖先一旦 pointer-events:none，foreignObject
        // 里的 <video> 控件就点不到，点击会穿透到 stage，被放映的翻页接走。
        const be = new SvgBackend(scene, layer, {
          shapeFilter: filter,
          transparent: true,
          clipToSlide: opts.clipToSlide,
        });
        this.backends.push(be);
        if (!firstSvg) firstSvg = be;
      }
    }

    if (!firstSvg) {
      const layer = document.createElement("div");
      layer.style.position = "absolute";
      layer.style.inset = "0";
      layer.style.width = "100%";
      layer.style.height = "100%";
      layer.style.pointerEvents = "none";
      this.wrapper.appendChild(layer);
      firstSvg = new SvgBackend(scene, layer, {
        shapeFilter: () => false,
        transparent: true,
        clipToSlide: opts.clipToSlide,
      });
      this.backends.push(firstSvg);
    }
    this.svg = firstSvg;
    this.host = this.wrapper;
  }

  get svgRoot(): SVGSVGElement {
    return this.svg.root;
  }

  /** 同步刷新所有子 backend；详见 SvgBackend.flush。 */
  flush(): void {
    for (const b of this.backends) b.flush?.();
  }

  /** 等待所有 live 3D（WebGLShapeBackend）首帧就绪——截图 / visual-compare 前调。 */
  async waitForReady(): Promise<void> {
    await Promise.all(this.backends.map((b) => b.whenReady?.() ?? Promise.resolve()));
  }

  destroy(): void {
    for (const b of this.backends) b.destroy();
    this.backends = [];
    this.wrapper.remove();
  }
}
