"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridBackend = void 0;
const svg_backend_1 = require("./svg-backend");
const canvas_backend_1 = require("./canvas-backend");
const webgl_shape_backend_1 = require("./webgl-shape-backend");
const webgl_model3d_backend_1 = require("./webgl-model3d-backend");
const hybrid_segments_1 = require("./hybrid-segments");
class HybridBackend {
    host;
    svg;
    wrapper;
    backends = [];
    constructor(scene, container, opts = {}) {
        this.wrapper = document.createElement("div");
        this.wrapper.style.position = "relative";
        this.wrapper.style.width = "100%";
        this.wrapper.style.height = "100%";
        this.wrapper.style.background = opts.background ?? "transparent";
        container.appendChild(this.wrapper);
        const segments = (0, hybrid_segments_1.buildHybridSegments)(scene.root.children);
        let firstSvg = null;
        for (const seg of segments) {
            const layer = document.createElement("div");
            layer.style.position = "absolute";
            layer.style.inset = "0";
            layer.style.width = "100%";
            layer.style.height = "100%";
            this.wrapper.appendChild(layer);
            const ids = new Set(seg.ids);
            const filter = (s) => ids.has(s.id);
            if (seg.kind === "canvas") {
                this.backends.push(new canvas_backend_1.CanvasBackend(scene, layer, { shapeFilter: filter, transparent: true }));
            }
            else if (seg.kind === "webgl") {
                layer.style.pointerEvents = "none";
                this.backends.push(new webgl_shape_backend_1.WebGLShapeBackend(scene, layer, { shapeFilter: filter }));
            }
            else if (seg.kind === "webglm3d") {
                layer.style.pointerEvents = "none";
                this.backends.push(new webgl_model3d_backend_1.WebGLModel3DBackend(scene, layer, { shapeFilter: filter, interactive: opts.interactive }));
            }
            else {
                // 这一层必须能接到指针。HTML 祖先一旦 pointer-events:none，foreignObject
                // 里的 <video> 控件就点不到，点击会穿透到 stage，被放映的翻页接走。
                const be = new svg_backend_1.SvgBackend(scene, layer, {
                    shapeFilter: filter,
                    transparent: true,
                    clipToSlide: opts.clipToSlide,
                });
                this.backends.push(be);
                if (!firstSvg)
                    firstSvg = be;
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
            firstSvg = new svg_backend_1.SvgBackend(scene, layer, {
                shapeFilter: () => false,
                transparent: true,
                clipToSlide: opts.clipToSlide,
            });
            this.backends.push(firstSvg);
        }
        this.svg = firstSvg;
        this.host = this.wrapper;
    }
    get svgRoot() {
        return this.svg.root;
    }
    /** 同步刷新所有子 backend；详见 SvgBackend.flush。 */
    flush() {
        for (const b of this.backends)
            b.flush?.();
    }
    /** 等待所有 live 3D（WebGLShapeBackend）首帧就绪——截图 / visual-compare 前调。 */
    async waitForReady() {
        await Promise.all(this.backends.map((b) => b.whenReady?.() ?? Promise.resolve()));
    }
    destroy() {
        for (const b of this.backends)
            b.destroy();
        this.backends = [];
        this.wrapper.remove();
    }
}
exports.HybridBackend = HybridBackend;
