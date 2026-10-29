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
exports.pickPrimaryColor = pickPrimaryColor;
exports.buildMaterial = buildMaterial;
exports.applyTextureCrop = applyTextureCrop;
const THREE = __importStar(require("three"));
const MATERIAL_PRESETS = {
    legacyMatte: { metalness: 0, roughness: 1 },
    legacyPlastic: { metalness: 0, roughness: 0.4 },
    legacyMetal: { metalness: 0.9, roughness: 0.35 },
    legacyWireframe: { metalness: 0, roughness: 1 },
    matte: { metalness: 0, roughness: 0.95 },
    plastic: { metalness: 0, roughness: 0.35 },
    metal: { metalness: 0.85, roughness: 0.3 },
    warmMatte: { metalness: 0, roughness: 0.95 },
    translucentPowder: { metalness: 0, roughness: 0.6 },
    powder: { metalness: 0, roughness: 0.8 },
    dkEdge: { metalness: 0, roughness: 0.6 },
    softEdge: { metalness: 0, roughness: 0.5 },
    clear: { metalness: 0, roughness: 0.05, clearcoat: 1 },
    flat: { metalness: 0, roughness: 1 },
    softmetal: { metalness: 0.6, roughness: 0.5 },
};
function pickPrimaryColor(paint, fallback) {
    if (!paint)
        return fallback;
    if (paint.kind === "solid")
        return paint.color;
    if (paint.kind === "linear" || paint.kind === "radial") {
        const stops = paint.stops;
        if (stops.length === 0)
            return fallback;
        const mid = stops[Math.floor(stops.length / 2)];
        return mid?.color ?? stops[0]?.color ?? fallback;
    }
    return fallback;
}
function buildMaterial(paint, opts = {}) {
    const fallback = opts.fallbackColor ?? "#7f7f7f";
    const color = pickPrimaryColor(paint, fallback);
    // ECMA-376 §20.1.5.12 sp3d/@prstMaterial 默认是 `warmMatte` —— 缺省 prstMaterial
    // 时之前回落到 `plastic`，体高光太亮，看起来像塑料板而不是 PPT 默认的暖哑光纸/卡片
    // 质感（用户在 WPS 里看到 "材料：暖色粗糙" = warmMatte）。
    const preset = MATERIAL_PRESETS[opts.prst ?? "warmMatte"] ?? MATERIAL_PRESETS.warmMatte;
    const useTexture = !!opts.imageTexture;
    // image 贴图：lighting 有时会把 hi-contrast 黑白图（比如棋盘）压成灰白灰黑——
    // PBR diffuse 永远把入射光按 albedo/π 漫反射回去，多光源叠加之后白只能勉强达
    // 1.0、黑被 ambient 提到非零灰。视觉上的"暖色卡片纸 + 倒角高光"在没有 texture
    // 的纯色面上才有用，有 texture 时 PowerPoint / WPS 表现是"贴图原色直接透出，
    // 仅做轻微 shading"。
    // → 有 texture 时切到 MeshBasicMaterial：完全不参与 lighting，texture 像素直
    // 接 round-trip 出去，再配合 Three.js outputColorSpace=SRGB 就能 1:1 还原原图
    // 的黑白对比度。lightRig 仍会落到几何，但只通过倒角/侧面（无贴图区）产生明暗
    // 差，用户感知就是"贴图清晰 + 边缘有 3D 立体感"。
    if (useTexture) {
        if (opts.litTexture) {
            // 折边 / 侧壁：贴图照常透出，但走 PBR 受光 + tint 压暗——正面（basic、满亮）与
            // 折边之间形成稳定可辨的明暗折痕，区分「上面 / 前面」。roughness 取 1 让过渡柔和。
            return new THREE.MeshStandardMaterial({
                color: opts.tint ?? 0xffffff,
                side: THREE.DoubleSide,
                map: opts.imageTexture ?? null,
                metalness: 0,
                roughness: 1,
            });
        }
        return new THREE.MeshBasicMaterial({
            color: opts.tint ?? 0xffffff,
            side: THREE.DoubleSide,
            map: opts.imageTexture ?? null,
        });
    }
    if (preset.clearcoat !== undefined) {
        const m = new THREE.MeshPhysicalMaterial({
            color,
            metalness: preset.metalness,
            roughness: preset.roughness,
            clearcoat: preset.clearcoat,
            side: THREE.DoubleSide,
        });
        return m;
    }
    const m = new THREE.MeshStandardMaterial({
        color,
        metalness: preset.metalness,
        roughness: preset.roughness,
        side: THREE.DoubleSide,
    });
    return m;
}
// `<a:blip>` 上的 srcRect 把 0..1 的图像截到 (l, t, 1-r, 1-b) 区域。three.js
// 直接拿原图 + 调整 texture.offset / repeat 就等价裁剪——比预先把 imageData
// 切片成新 PNG 省一次 putImageData。
function applyTextureCrop(texture, cropRect) {
    if (!cropRect)
        return;
    const { l, t, r, b } = cropRect;
    const w = Math.max(1e-6, 1 - l - r);
    const h = Math.max(1e-6, 1 - t - b);
    texture.offset.set(l, b);
    texture.repeat.set(w, h);
    texture.needsUpdate = true;
}
