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
exports.bakeSp3d = bakeSp3d;
const THREE = __importStar(require("three"));
const material_1 = require("./material");
const resolve_1 = require("./resolve");
const scene_builder_1 = require("./scene-builder");
const shape_path_1 = require("./shape-path");
// 离屏光栅路径：把 3D 烘成 PNG，给无法挂 live WebGL context 的消费者用
// （thumbnail=SvgBackend / snapshot+pdf=CanvasBackend / parse-time bake3D 选项）。
// player/editor 的实时视图改走 packages/renderer 的 WebGLShapeBackend（live three.js）。
// 几何/材质/光照/相机与 live 完全共用 scene-builder，确保两条路径一致。
async function bakeSp3d(req) {
    if (!hasOffscreenCanvas() && typeof document === "undefined")
        return null;
    const dpr = req.dpr ?? Math.min(2, getDevicePixelRatio());
    const isImage = !!req.imageSrc;
    // image bake：slab 几何全收在 bbox 内不外溢，只需 5% pad 吸收 3D 投影 overshoot；
    // 非 image（path/纯色 extrude）倒角对称外扩，留 15%。
    const pad = req.pad ?? (0, shape_path_1.shape3DPad)(isImage ? "image" : "path");
    const baseW = Math.max(8, req.bbox.w);
    const baseH = Math.max(8, req.bbox.h);
    const padW = Math.ceil(baseW * (1 + pad));
    const padH = Math.ceil(baseH * (1 + pad));
    const pixelW = Math.ceil(padW * dpr);
    const pixelH = Math.ceil(padH * dpr);
    const canvas = createBakeCanvas(pixelW, pixelH);
    if (!canvas)
        return null;
    let renderer = null;
    let dispose;
    try {
        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
        });
        renderer.setPixelRatio(1);
        renderer.setSize(pixelW, pixelH, false);
        renderer.setClearColor(0x000000, 0);
        // 输出端补 SRGB，否则 PBR 在 linear 空间写到 canvas 会让纯白变灰、棋盘对比被压扁。
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const resolved = (0, resolve_1.resolveScene3D)({ sp3d: req.sp3d, scene3d: req.scene3d });
        let texture = null;
        if (req.imageSrc) {
            texture = await (0, scene_builder_1.loadImageTexture)(req.imageSrc);
            if (texture)
                (0, material_1.applyTextureCrop)(texture, req.cropRect);
        }
        const built = (0, scene_builder_1.buildThreeScene)({
            baseW,
            baseH,
            pathD: req.pathD,
            fill: req.fill,
            stroke: req.stroke,
            resolved,
            texture,
            isImage,
        });
        dispose = built.dispose;
        const camera = (0, scene_builder_1.createSceneCamera)(resolved.camera, built.geoW, built.geoH, padW, padH, pad, resolved.backdrop);
        renderer.render(built.scene, camera);
        const src = await canvasToDataURL(canvas);
        if (!src)
            return null;
        return {
            src,
            natural: { w: pixelW, h: pixelH },
            paddedBBox: {
                x: req.bbox.x - (padW - baseW) / 2,
                y: req.bbox.y - (padH - baseH) / 2,
                w: padW,
                h: padH,
            },
        };
    }
    catch (err) {
        if (typeof console !== "undefined")
            console.warn("[three-bake] bake failed", err);
        return null;
    }
    finally {
        dispose?.();
        if (renderer) {
            renderer.forceContextLoss();
            renderer.dispose();
        }
    }
}
function getDevicePixelRatio() {
    if (typeof window !== "undefined" && window.devicePixelRatio)
        return window.devicePixelRatio;
    return 1;
}
function hasOffscreenCanvas() {
    return typeof OffscreenCanvas !== "undefined";
}
function createBakeCanvas(w, h) {
    if (typeof OffscreenCanvas !== "undefined") {
        try {
            return new OffscreenCanvas(w, h);
        }
        catch {
            // fall through
        }
    }
    if (typeof document !== "undefined") {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
    }
    return null;
}
async function canvasToDataURL(c) {
    if (typeof OffscreenCanvas !== "undefined" && c instanceof OffscreenCanvas) {
        try {
            const blob = await c.convertToBlob({ type: "image/png" });
            return await blobToDataURL(blob);
        }
        catch {
            return null;
        }
    }
    if (typeof HTMLCanvasElement !== "undefined" && c instanceof HTMLCanvasElement) {
        try {
            return c.toDataURL("image/png");
        }
        catch {
            return null;
        }
    }
    return null;
}
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
    });
}
