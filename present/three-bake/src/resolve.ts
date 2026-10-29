// PowerPoint 效果层 —— 把 parser 的「忠实 OOXML」(Sp3DInfo) 解析成渲染器可直接消费的
// 具体参数（ResolvedScene3D）。所有 PPT 语义集中在这里：
//   - preset 提供基准 lat/lon/rev/fov；显式 <a:rot> 覆盖角度；显式 @fov 覆盖 fov
//     （但 relaxed 系 preset 无条件用窄 fov，见 presets.FOV_LOCKED_PRESETS）；
//   - bevel/material/lightRig 的缺省默认在此补齐；
//   - 几何决策（slab vs extrude、extrusion 推断）仍由 scene 构建器做，这里只给「值」。
import type { Backdrop3D, Camera3D, LightRig3D, Scene3DParams, Sp3DInfo, Sp3DParams } from "@ppt/core";
import {
  CAMERA_PRESETS,
  DEFAULT_BEVEL_PX,
  DEFAULT_FOV,
  DEFAULT_LIGHT_RIG,
  DEFAULT_MATERIAL,
  FOV_LOCKED_PRESETS,
} from "./presets";

export interface ResolvedCamera {
  lat: number;
  lon: number;
  rev: number;
  /** 度；<1 视为正交。 */
  fov: number;
  isOrtho: boolean;
  /** 倍率（1 = 100%），undefined = 不缩放。 */
  zoom?: number;
}

export interface ResolvedBevel {
  /** px，已补默认。 */
  w: number;
  h: number;
}

export interface ResolvedSp3D {
  /** px，原始 extrusionH（缺省 0）。 */
  extrusionH: number;
  contourW?: number;
  contourClr?: string;
  extrusionClr?: string;
  /** 已补默认（warmMatte）。 */
  prstMaterial: string;
  /** 仅当 XML 写了 `<a:bevelT>` 才有；w/h 已补默认。 */
  bevelT?: ResolvedBevel;
  bevelB?: ResolvedBevel;
  /** bevelT/bevelB 任一存在（即声明了倒角）。 */
  hasBevel: boolean;
}

export interface ResolvedLightRig {
  /** 已补默认（threePt）。 */
  rig: string;
  dir?: string;
}

export interface ResolvedScene3D {
  camera: ResolvedCamera;
  sp3d: ResolvedSp3D;
  lightRig: ResolvedLightRig;
  /** undefined = OOXML 未写或 identity（+Z / +Y），相机保持 preset 朝向。 */
  backdrop?: ResolvedBackdrop;
}

export interface ResolvedBackdrop {
  target: { x: number; y: number; z: number };
  /** 单位法向；identity (+Z) 时省略。 */
  forward?: { x: number; y: number; z: number };
  /** 单位 up；identity (+Y) / 零向量时省略。 */
  up?: { x: number; y: number; z: number };
}

export function resolveCamera(cam: Camera3D | undefined): ResolvedCamera {
  let lat = 0;
  let lon = 0;
  let rev = 0;
  let fov = DEFAULT_FOV;
  if (cam?.prst) {
    const p = CAMERA_PRESETS[cam.prst];
    if (p) {
      lat = p.lat;
      lon = p.lon;
      rev = p.rev;
      fov = p.fov;
    }
  }
  // 显式 <a:rot> 覆盖角度（preset 与 rot 是覆盖而非叠加）。
  if (cam?.rot) {
    lat = cam.rot.lat;
    lon = cam.rot.lon;
    rev = cam.rot.rev;
  }
  // 显式 @fov 覆盖 fov——但 relaxed 系 preset 无条件用预设窄 fov（PPT 把显式 fov 当 zoom 参考）。
  if (cam?.fov !== undefined && !(cam.prst && FOV_LOCKED_PRESETS.has(cam.prst))) {
    fov = cam.fov;
  }
  return { lat, lon, rev, fov, isOrtho: fov < 1, zoom: cam?.zoom };
}

function resolveBevel(b: Sp3DParams["bevelT"]): ResolvedBevel | undefined {
  if (!b) return undefined;
  return {
    w: b.w ?? DEFAULT_BEVEL_PX,
    h: b.h ?? DEFAULT_BEVEL_PX,
  };
}

export function resolveSp3D(sp3d: Sp3DParams | undefined): ResolvedSp3D {
  const bevelT = resolveBevel(sp3d?.bevelT);
  const bevelB = resolveBevel(sp3d?.bevelB);
  return {
    extrusionH: sp3d?.extrusionH ?? 0,
    contourW: sp3d?.contourW,
    contourClr: sp3d?.contourClr,
    extrusionClr: sp3d?.extrusionClr,
    prstMaterial: sp3d?.prstMaterial ?? DEFAULT_MATERIAL,
    bevelT,
    bevelB,
    hasBevel: !!(bevelT || bevelB),
  };
}

export function resolveLightRig(lr: LightRig3D | undefined): ResolvedLightRig {
  return { rig: lr?.rig ?? DEFAULT_LIGHT_RIG, dir: lr?.dir };
}

function asVec(v: { dx: number; dy: number; dz: number } | { x: number; y: number; z: number }): {
  x: number;
  y: number;
  z: number;
} {
  return "dx" in v ? { x: v.dx, y: v.dy, z: v.dz } : v;
}

function normalizeVec(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } | undefined {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-8) return undefined;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function nearAxis(v: { x: number; y: number; z: number }, x: number, y: number, z: number, eps = 0.02): boolean {
  return Math.abs(v.x - x) < eps && Math.abs(v.y - y) < eps && Math.abs(v.z - z) < eps;
}

/** identity / 全 0 → undefined，setupCamera 保持 preset 朝向。 */
export function resolveBackdrop(bd: Backdrop3D | undefined): ResolvedBackdrop | undefined {
  if (!bd) return undefined;
  const n = bd.norm ? normalizeVec(asVec(bd.norm)) : undefined;
  const u = bd.up ? normalizeVec(asVec(bd.up)) : undefined;
  const identityN = !n || nearAxis(n, 0, 0, 1);
  const identityU = !u || nearAxis(u, 0, 1, 0);
  const a = bd.anchor;
  const hasAnchor = !!(a && (Math.abs(a.x) > 1e-4 || Math.abs(a.y) > 1e-4 || Math.abs(a.z) > 1e-4));
  if (identityN && identityU && !hasAnchor) return undefined;
  return {
    target: a ?? { x: 0, y: 0, z: 0 },
    forward: identityN ? undefined : n,
    up: identityU ? undefined : u,
  };
}

export function resolveScene3D(info: Sp3DInfo): ResolvedScene3D {
  const scene: Scene3DParams | undefined = info.scene3d;
  return {
    camera: resolveCamera(scene?.camera),
    sp3d: resolveSp3D(info.sp3d),
    lightRig: resolveLightRig(scene?.lightRig),
    backdrop: resolveBackdrop(scene?.backdrop),
  };
}
