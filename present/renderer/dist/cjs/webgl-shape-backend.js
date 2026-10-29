"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebGLShapeBackend = void 0;
const THREE = __importStar(require("three"));
const three_bake_1 = require("@sliiu/present-three-bake");
const node_affine_1 = require("./node-affine");
const shape_front_1 = require("./shape-front");
// ════════════════════════════════════════════════════════════════════════════
// Live WebGL 3D backend —— player / editor 的 hybrid 视图里，每个需要 3D 的
// image / 矩形 / 椭圆 / 路径 / 多边形用一块定位 canvas 实时渲染 three.js 3D
// （透视 / 倒角 / 光照 / 材质）。好处：
//   - 缩放清晰（按显示像素重渲，不再是固定分辨率位图）；
//   - 动画（entrance/emphasis 的 tx/ty/scale/opacity）过程中 3D 形体保持立体、光照正确。
//
// 设计：
//   - 一个 "slide-space" 容器（slide 像素尺寸）用 transform:scale(k) 适配 layer 实际像素，
//     ResizeObserver 跟随更新；每个 shape 的 wrapper 用 slide 单位定位。
//   - 共享一个 WebGLRenderer（单 GL context），逐 shape 渲染到其 backing 尺寸再 drawImage
//     到该 shape 的 2D 展示 canvas，避免 per-shape GL context 累积。
//   - 几何/材质/相机全部复用 @sliiu/present-three-bake 的 buildThreeScene / createSceneCamera，
//     与离屏光栅（缩略图/截图）完全一致。
//   - 每帧 2D 变换（tx/ty/rotation/scale/opacity）经 node.on() 同步到 wrapper CSS，
//     不重渲 GL（3D 相机不随动画变）；仅 resize / 贴图加载完成时重渲 GL。
// ════════════════════════════════════════════════════════════════════════════
// ── 共享 WebGLRenderer（单 GL context，跨 backend 实例复用）──────────────────────
// 编辑器拖动时 drawSlide 每帧重建整个 backend（含 WebGLShapeBackend）。若每个实例都
// 自建/销毁一个 WebGLRenderer，会以 ~60fps 频繁创建 + forceContextLoss GL context：
// 浏览器对活动 context 数量有上限、create/loss 自身也有开销，会引发掉帧甚至闪烁。
// 这里改用一个 module 级单例 renderer，所有 WebGLShapeBackend 复用它（逐 shape
// setSize→render→drawImage 是同步串行的，复用安全）。backend.destroy() 不再销毁它。
let sharedRenderer = null;
let sharedRendererFailed = false;
function getSharedRenderer() {
    if (sharedRenderer)
        return sharedRenderer;
    if (sharedRendererFailed)
        return null;
    try {
        const r = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
            preserveDrawingBuffer: true,
        });
        r.setPixelRatio(1);
        r.setClearColor(0x000000, 0);
        r.outputColorSpace = THREE.SRGBColorSpace;
        sharedRenderer = r;
    }
    catch {
        sharedRendererFailed = true;
        sharedRenderer = null;
    }
    return sharedRenderer;
}
function paddedRect(bbox, pad) {
    const padW = Math.ceil(bbox.w * (1 + pad));
    const padH = Math.ceil(bbox.h * (1 + pad));
    return {
        x: bbox.x - (padW - bbox.w) / 2,
        y: bbox.y - (padH - bbox.h) / 2,
        w: padW,
        h: padH,
    };
}
class WebGLShapeBackend {
    scene;
    space;
    managed = [];
    dispose = [];
    dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    k = 1;
    rafId = 0;
    ro = null;
    readyResolvers = [];
    constructor(scene, container, opts = {}) {
        this.scene = scene;
        const filter = opts.shapeFilter ?? (() => true);
        this.space = document.createElement("div");
        this.space.style.position = "absolute";
        this.space.style.left = "0";
        this.space.style.top = "0";
        this.space.style.width = `${scene.width}px`;
        this.space.style.height = `${scene.height}px`;
        this.space.style.transformOrigin = "0 0";
        this.space.style.pointerEvents = "none";
        container.appendChild(this.space);
        scene.root.walk((n) => {
            const s = n.shape;
            if (!(0, three_bake_1.shapeSupports3D)(s))
                return;
            if (!filter(s))
                return;
            if (!(0, three_bake_1.needs3DRender)((0, three_bake_1.shape3DInfo)(s)))
                return;
            this.add(n);
        });
        // 适配 layer 实际像素：k = 实际宽 / slide 宽。
        const updateScale = () => {
            const w = container.clientWidth || scene.width;
            const k = w / scene.width;
            if (!Number.isFinite(k) || k <= 0)
                return;
            if (Math.abs(k - this.k) < 1e-4)
                return;
            this.k = k;
            this.space.style.transform = `scale(${k})`;
            this.scheduleGlRender();
        };
        if (typeof ResizeObserver !== "undefined") {
            this.ro = new ResizeObserver(updateScale);
            this.ro.observe(container);
        }
        updateScale();
        this.scheduleSync();
        this.scheduleGlRender();
    }
    add(node) {
        const s = node.shape;
        const meta = (0, three_bake_1.shape3DInfo)(s);
        if (!meta)
            return;
        const pad = (0, three_bake_1.shape3DPad)(s.kind);
        const baseBBox = { x: s.bbox.x, y: s.bbox.y, w: s.bbox.w, h: s.bbox.h };
        const paddedBBox = paddedRect(baseBBox, pad);
        const resolved = (0, three_bake_1.resolveScene3D)(meta);
        const wrapper = document.createElement("div");
        wrapper.style.position = "absolute";
        wrapper.style.left = `${paddedBBox.x}px`;
        wrapper.style.top = `${paddedBBox.y}px`;
        wrapper.style.width = `${paddedBBox.w}px`;
        wrapper.style.height = `${paddedBBox.h}px`;
        wrapper.style.pointerEvents = "none";
        const canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        wrapper.appendChild(canvas);
        this.space.appendChild(wrapper);
        const m = {
            node,
            baseBBox,
            paddedBBox,
            pad,
            resolved,
            wrapper,
            canvas,
            ctx: canvas.getContext("2d"),
            built: null,
            camera: null,
            texture: null,
            lastBackingW: 0,
            lastBackingH: 0,
            disposed: false,
        };
        this.managed.push(m);
        const src = s.kind === "image" ? s.src : s.kind === "text" ? (0, shape_front_1.shapeFrontImageSrc)(this.scene, s) : undefined;
        // 贴图此前已解码过（典型：初次加载已经走过一遍）→ 同步构建场景并 built 就绪，
        // 这样紧随其后的 flush() 能当帧首渲，drawSlide 双缓冲不会出现 3D 空一帧的闪屏。
        const cachedTex = src ? (0, three_bake_1.getCachedImageTexture)(src) : null;
        if (src ? cachedTex !== null : true) {
            this.buildManaged(m, s, cachedTex);
        }
        else {
            // 首次（未缓存）走异步解码；解码完成后会缓存，后续重建即走上面的同步路径。
            void (async () => {
                const texture = src ? await (0, three_bake_1.loadImageTexture)(src) : null;
                if (m.disposed) {
                    texture?.dispose();
                    return;
                }
                this.buildManaged(m, s, texture);
            })();
        }
        let cur = node;
        while (cur) {
            const off = cur.on(() => this.scheduleSync());
            this.dispose.push(off);
            cur = cur.parent;
        }
    }
    /** 用（可能为空的）贴图构建 three 场景 + 相机，写回 managed 并触发首渲。 */
    buildManaged(m, s, texture) {
        if (m.disposed) {
            texture?.dispose();
            return;
        }
        const isPicture = s.kind === "image" || (s.kind === "text" && !!texture);
        if (s.kind === "image" && texture)
            (0, three_bake_1.applyTextureCrop)(texture, s.cropRect);
        m.texture = texture;
        m.built = (0, three_bake_1.buildThreeScene)({
            baseW: Math.max(8, m.baseBBox.w),
            baseH: Math.max(8, m.baseBBox.h),
            pathD: isPicture ? undefined : (0, three_bake_1.shape3DPathD)(s),
            fill: s.fill,
            stroke: s.stroke,
            resolved: m.resolved,
            texture: isPicture ? texture : null,
            isImage: isPicture,
        });
        m.camera = (0, three_bake_1.createSceneCamera)(m.resolved.camera, m.built.geoW, m.built.geoH, m.paddedBBox.w, m.paddedBBox.h, m.pad, m.resolved.backdrop);
        this.scheduleGlRender();
        this.checkReady();
    }
    getRenderer() {
        return getSharedRenderer();
    }
    // ── 每帧 2D 变换同步（CSS，不重渲 GL）─────────────────────────────────────────
    scheduleSync() {
        if (this.rafId)
            return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = 0;
            this.syncTransforms();
        });
    }
    syncTransforms() {
        for (const m of this.managed)
            this.syncOne(m);
    }
    syncOne(m) {
        const node = m.node;
        const visible = !(0, node_affine_1.chainHidden)(node);
        m.wrapper.style.display = visible ? "block" : "none";
        if (!visible)
            return;
        // wrapper 放在 paddedBBox。CSS 原点取左上角，矩阵里已经包含祖先组合的旋转。
        const css = (0, node_affine_1.cssAffineForBox)((0, node_affine_1.accumulatedAffine)(node), m.paddedBBox.x, m.paddedBBox.y);
        m.wrapper.style.transformOrigin = "0 0";
        m.wrapper.style.transform = `matrix(${css.a}, ${css.b}, ${css.c}, ${css.d}, ${css.e}, ${css.f})`;
        let alpha = (0, node_affine_1.chainOpacity)(node);
        const clip = node.clip;
        if (clip && clip.kind === "effect" && clip.filter === "fade") {
            const tr = clip.transition ?? "none";
            alpha *= tr === "none" ? 1 : Math.max(0, Math.min(1, clip.progress ?? 0));
        }
        m.wrapper.style.opacity = String(alpha);
    }
    // ── GL 重渲（仅 resize / 贴图加载完成时）──────────────────────────────────────
    scheduleGlRender() {
        if (typeof requestAnimationFrame === "undefined") {
            this.glRenderAll();
            return;
        }
        requestAnimationFrame(() => this.glRenderAll());
    }
    glRenderAll() {
        const renderer = this.getRenderer();
        if (!renderer)
            return;
        for (const m of this.managed)
            this.glRenderOne(renderer, m);
    }
    glRenderOne(renderer, m) {
        if (m.disposed || !m.built || !m.camera || !m.ctx)
            return;
        const backingW = Math.max(1, Math.ceil(m.paddedBBox.w * this.k * this.dpr));
        const backingH = Math.max(1, Math.ceil(m.paddedBBox.h * this.k * this.dpr));
        if (backingW === m.lastBackingW && backingH === m.lastBackingH && m.canvas.width === backingW) {
            // 尺寸没变也重渲一次（贴图刚加载完会走到这里）；但避免无意义的频繁循环。
        }
        renderer.setSize(backingW, backingH, false);
        renderer.render(m.built.scene, m.camera);
        if (m.canvas.width !== backingW)
            m.canvas.width = backingW;
        if (m.canvas.height !== backingH)
            m.canvas.height = backingH;
        m.ctx.clearRect(0, 0, backingW, backingH);
        try {
            m.ctx.drawImage(renderer.domElement, 0, 0, backingW, backingH);
        }
        catch {
            // drawImage 偶发失败（context lost）忽略，下次 resize 再试。
        }
        m.lastBackingW = backingW;
        m.lastBackingH = backingH;
    }
    flush() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        this.syncTransforms();
        this.glRenderAll();
    }
    /** 所有 3D shape 的贴图都加载完、场景已构建并首渲后 resolve（截图前等待用）。 */
    whenReady() {
        if (this.isReady()) {
            this.flush();
            return Promise.resolve();
        }
        return new Promise((res) => this.readyResolvers.push(res));
    }
    isReady() {
        return this.managed.every((m) => m.built || m.disposed);
    }
    checkReady() {
        if (!this.isReady())
            return;
        this.flush();
        const rs = this.readyResolvers;
        this.readyResolvers = [];
        for (const r of rs)
            r();
    }
    destroy() {
        if (this.rafId)
            cancelAnimationFrame(this.rafId);
        this.rafId = 0;
        for (const off of this.dispose)
            off();
        this.dispose = [];
        this.ro?.disconnect();
        this.ro = null;
        for (const m of this.managed) {
            m.disposed = true;
            m.built?.dispose();
            m.texture?.dispose();
        }
        this.managed = [];
        // 不销毁 sharedRenderer：它是跨 backend 实例复用的单例 GL context（见顶部注释）。
        // 编辑器拖动每帧重建 backend，这里若 forceContextLoss 会造成 context 抖动 / 闪屏。
        this.space.remove();
    }
}
exports.WebGLShapeBackend = WebGLShapeBackend;
