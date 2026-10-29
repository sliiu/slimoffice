import * as THREE from "three";
import { applyModel3DCameraPose, applyModel3DTransform, loadGltfScene } from "./model3d-frame.js";
let sharedRenderer = null;
let sharedRendererFailed = false;
function getSharedRenderer() {
    if (sharedRenderer)
        return sharedRenderer;
    if (sharedRendererFailed)
        return null;
    try {
        const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
        r.setPixelRatio(1);
        r.setClearColor(0x000000, 0);
        r.outputColorSpace = THREE.SRGBColorSpace;
        sharedRenderer = r;
    }
    catch {
        sharedRendererFailed = true;
    }
    return sharedRenderer;
}
export class WebGLModel3DBackend {
    space;
    managed = [];
    dispose = [];
    k = 1;
    rafId = 0;
    readyResolvers = [];
    constructor(scene, container, opts = {}) {
        const shapeFilter = opts.shapeFilter ?? (() => true);
        const interactive = opts.interactive === true;
        this.space = document.createElement("div");
        this.space.style.cssText = "position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none";
        this.space.style.width = `${scene.width}px`;
        this.space.style.height = `${scene.height}px`;
        container.appendChild(this.space);
        scene.root.walk((n) => {
            if (n.shape.kind !== "model3d")
                return;
            const s = n.shape;
            if (!shapeFilter(s))
                return;
            if (!s.glbSrc)
                return;
            this.add(n, s, interactive);
        });
        const updateScale = () => {
            const w = container.clientWidth || scene.width;
            const k = w / scene.width;
            if (!Number.isFinite(k) || k <= 0)
                return;
            this.k = k;
            this.space.style.transform = `scale(${k})`;
            this.scheduleRender();
        };
        if (typeof ResizeObserver !== "undefined") {
            const ro = new ResizeObserver(updateScale);
            ro.observe(container);
            this.dispose.push(() => ro.disconnect());
        }
        updateScale();
        this.scheduleRender();
    }
    add(node, s, interactive) {
        const wrapper = document.createElement("div");
        wrapper.style.position = "absolute";
        wrapper.style.overflow = "hidden";
        const canvas = document.createElement("canvas");
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        wrapper.appendChild(canvas);
        this.space.appendChild(wrapper);
        const m = {
            node,
            bbox: { ...s.bbox },
            wrapper,
            canvas,
            ctx: canvas.getContext("2d"),
            scene: null,
            camera: null,
            lat: s.camera?.rot?.lat ?? 15,
            lon: s.camera?.rot?.lon ?? 25,
            lastW: 0,
            lastH: 0,
        };
        this.managed.push(m);
        if (interactive)
            this.bindOrbit(m);
        void loadGltfScene(s.glbSrc).then((root) => {
            const sc = new THREE.Scene();
            const clone = root.clone(true);
            applyModel3DTransform(clone, s);
            sc.add(clone);
            const light = new THREE.DirectionalLight(0xffffff, 1.1);
            light.position.set(2, 3, 4);
            sc.add(light);
            sc.add(new THREE.AmbientLight(0xffffff, 0.45));
            const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
            applyModel3DCameraPose(cam, m.lat, m.lon);
            m.scene = sc;
            m.camera = cam;
            this.syncWrapper(m);
            this.scheduleRender();
            this.resolveReady();
        }).catch(() => this.resolveReady());
        const off = node.on(() => this.syncWrapper(m));
        this.dispose.push(off);
    }
    bindOrbit(m) {
        const el = m.wrapper;
        el.style.pointerEvents = "auto";
        el.style.cursor = "grab";
        el.style.touchAction = "none";
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        const stop = (e) => e.stopPropagation();
        el.addEventListener("pointerdown", (e) => {
            if (e.button !== 0)
                return;
            e.stopPropagation();
            e.preventDefault();
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            try {
                el.setPointerCapture(e.pointerId);
            }
            catch { }
            el.style.cursor = "grabbing";
        });
        el.addEventListener("pointermove", (e) => {
            if (!dragging)
                return;
            e.stopPropagation();
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            this.orbitModel3D(m.node.shape.id, -dx * 0.45, dy * 0.45);
        });
        const end = (e) => {
            if (!dragging)
                return;
            dragging = false;
            el.style.cursor = "grab";
            try {
                el.releasePointerCapture(e.pointerId);
            }
            catch { }
            e.stopPropagation();
        };
        el.addEventListener("pointerup", end);
        el.addEventListener("pointercancel", end);
        el.addEventListener("mousedown", stop);
        el.addEventListener("click", stop);
        el.addEventListener("dblclick", stop);
        el.addEventListener("touchstart", stop, { passive: true });
    }
    syncWrapper(m) {
        const n = m.node;
        const s = n.shape;
        const b = s.bbox;
        m.bbox = { ...b };
        m.wrapper.style.left = `${b.x}px`;
        m.wrapper.style.top = `${b.y}px`;
        m.wrapper.style.width = `${b.w}px`;
        m.wrapper.style.height = `${b.h}px`;
        m.wrapper.style.opacity = String(n.opacity * ((n.visibleOverride ?? s.visible) !== false ? 1 : 0));
        m.wrapper.style.transform = `translate(${n.tx}px,${n.ty}px) rotate(${n.rotation}deg) scale(${n.scale})`;
    }
    scheduleRender() {
        if (this.rafId)
            return;
        this.rafId = requestAnimationFrame(() => {
            this.rafId = 0;
            this.renderAll();
        });
    }
    renderAll() {
        const renderer = getSharedRenderer();
        if (!renderer)
            return;
        const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        for (const m of this.managed) {
            if (!m.scene || !m.camera || !m.ctx)
                continue;
            const w = Math.max(1, Math.ceil(m.bbox.w * this.k * dpr));
            const h = Math.max(1, Math.ceil(m.bbox.h * this.k * dpr));
            m.lastW = w;
            m.lastH = h;
            if (m.canvas.width !== w)
                m.canvas.width = w;
            if (m.canvas.height !== h)
                m.canvas.height = h;
            m.camera.aspect = w / h;
            m.camera.updateProjectionMatrix();
            renderer.setSize(w, h, false);
            renderer.render(m.scene, m.camera);
            m.ctx.clearRect(0, 0, w, h);
            m.ctx.drawImage(renderer.domElement, 0, 0, w, h);
        }
    }
    resolveReady() {
        const rs = this.readyResolvers.splice(0);
        for (const r of rs)
            r();
    }
    orbitModel3D(shapeId, dLon, dLat) {
        const m = this.managed.find((x) => x.node.shape.id === shapeId);
        if (!m)
            return false;
        if (dLon === 0 && dLat === 0)
            return true;
        m.lon += dLon;
        m.lat = Math.max(-85, Math.min(85, m.lat + dLat));
        if (m.camera) {
            applyModel3DCameraPose(m.camera, m.lat, m.lon);
            this.scheduleRender();
        }
        return true;
    }
    flush() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
        for (const m of this.managed)
            this.syncWrapper(m);
        this.renderAll();
    }
    whenReady() {
        return new Promise((res) => {
            if (this.managed.every((m) => m.scene || !m.node.shape.glbSrc))
                res();
            else
                this.readyResolvers.push(res);
        });
    }
    destroy() {
        for (const d of this.dispose)
            d();
        this.dispose = [];
        this.space.remove();
        this.managed = [];
    }
}
