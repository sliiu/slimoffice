import * as THREE from "three";
import type { Paint } from "@ppt/core";

export interface MaterialOpts {
  prst?: string;
  fallbackColor?: string;
  // image 贴图（dataURL / URL）。提供时会替代 paint，绑到 material.map。
  imageTexture?: THREE.Texture;
  // 贴图是否参与光照。默认 false（MeshBasicMaterial：贴图原色 1:1 透出，正面保色）。
  // true 时用 MeshStandardMaterial + map：贴图仍透出，但法线偏转的面（倒角折边、侧壁）
  // 吃光照产生明暗 → 让「图片裹过倒角」的同时仍有一条可辨认面的折痕。
  litTexture?: boolean;
  // 贴图调色（与 map 相乘），默认 0xffffff（原色）。给倒角面一个 <1 的灰度，可在
  // 「顶光把折边照得和正面一样亮」时仍把折边压暗，逼出区分上面/前面的折痕。
  tint?: number;
}

const MATERIAL_PRESETS: Record<string, { metalness: number; roughness: number; clearcoat?: number }> = {
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

export function pickPrimaryColor(paint: Paint | undefined, fallback: string): string {
  if (!paint) return fallback;
  if (paint.kind === "solid") return paint.color;
  if (paint.kind === "linear" || paint.kind === "radial") {
    const stops = paint.stops;
    if (stops.length === 0) return fallback;
    const mid = stops[Math.floor(stops.length / 2)];
    return mid?.color ?? stops[0]?.color ?? fallback;
  }
  return fallback;
}

export function buildMaterial(paint: Paint | undefined, opts: MaterialOpts = {}): THREE.Material {
  const fallback = opts.fallbackColor ?? "#7f7f7f";
  const color = pickPrimaryColor(paint, fallback);
  // ECMA-376 §20.1.5.12 sp3d/@prstMaterial 默认是 `warmMatte` —— 缺省 prstMaterial
  // 时之前回落到 `plastic`，体高光太亮，看起来像塑料板而不是 PPT 默认的暖哑光纸/卡片
  // 质感（用户在 WPS 里看到 "材料：暖色粗糙" = warmMatte）。
  const preset = MATERIAL_PRESETS[opts.prst ?? "warmMatte"] ?? MATERIAL_PRESETS.warmMatte!;
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
export function applyTextureCrop(
  texture: THREE.Texture,
  cropRect: { l: number; t: number; r: number; b: number } | undefined,
): void {
  if (!cropRect) return;
  const { l, t, r, b } = cropRect;
  const w = Math.max(1e-6, 1 - l - r);
  const h = Math.max(1e-6, 1 - t - b);
  texture.offset.set(l, b);
  texture.repeat.set(w, h);
  texture.needsUpdate = true;
}
