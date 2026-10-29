import type { Rect } from "./geometry";
import type { Paint, Stroke } from "./paint";
import type { ShapeEffect } from "./shape";

// ECMA-376 §20.1.5 DrawingML 3D 类型 —— 这些接口是 OOXML 结构的**忠实镜像**。
//
// 重要约定（决定整套 3D 架构的事实）：
//   OOXML 只定义 preset 的**名称**（如 camera/@prst="perspectiveRelaxedModerately"、
//   sp3d/@prstMaterial="warmMatte"），**不**定义它们对应的相机角度 / fov / 材质数值。
//   那些数值是 PowerPoint 私有、靠逆向得到的。所以：
//     - parser 只把 XML 里**实际写了**的东西原样记录到这里（prst 名 + 显式 fov/rot/zoom
//       + bevel/extrusion 等原值），不展开 preset、不补默认；
//     - 「preset → 具体相机/材质/默认值」的映射全部放在渲染侧的效果层
//       （packages/three-bake/src/presets.ts + resolve.ts）。
//   这样「按 OOXML 解析」和「按 PowerPoint 效果实现」是两层、互不污染。

/** §20.1.5.4 EG_Bevel。缺省 w/h 由效果层补（76200 EMU ≈ 8px）；这里 undefined = XML 未写。 */
export interface Bevel3D {
  /** px（emuToPx 后）。undefined 表示属性缺省，默认值由效果层决定。 */
  w?: number;
  /** px。undefined 表示属性缺省。 */
  h?: number;
  /** §ST_BevelPresetType，如 "circle" / "relaxedInset" / "angle"。 */
  prst?: string;
}

/** §20.1.5.11 CT_SphereCoords：lat / lon / rev，单位 = 度（OOXML 原值 ÷ 60000）。 */
export interface Sphere3D {
  lat: number;
  lon: number;
  rev: number;
}

/** §20.1.5.12 CT_Shape3D（spPr / bodyPr 下的 `<a:sp3d>`）。 */
export interface Sp3DParams {
  /** @extrusionH，px。 */
  extrusionH?: number;
  /** @contourW，px。 */
  contourW?: number;
  bevelT?: Bevel3D;
  bevelB?: Bevel3D;
  contourClr?: string;
  extrusionClr?: string;
  /** §ST_PresetMaterialType 名称（默认 "warmMatte" 由效果层补）。 */
  prstMaterial?: string;
  /** @z，px。形状离 XY 平面的高度。 */
  z?: number;
  /** `<a:flatTx>`，z = 文本相对形状表面的位移（px，默认 0）。 */
  flatTx?: { z: number };
}

/**
 * §20.1.5.5 CT_Camera。
 * - `prst`：preset 名（数值不在此，效果层查表）。
 * - `fov`：显式视场角（度）。XML 原值是 60000ths of a degree，parser 已 ÷ 60000。
 * - `zoom`：缩放倍率（1 = 100%）。
 * - `rot`：显式 `<a:rot>` 覆盖（度）。preset 与 rot 是「覆盖」而非「叠加」。
 */
export interface Camera3D {
  prst?: string;
  fov?: number;
  zoom?: number;
  rot?: Sphere3D;
}

/** §20.1.5.9 CT_LightRig。 */
export interface LightRig3D {
  rig?: string;
  dir?: string;
  rot?: Sphere3D;
}

/** §20.1.5.2 CT_Backdrop。渲染层用 plane 的 norm/up 旋转相机；全 0 / +Z 朝向视为 identity。 */
export interface Backdrop3D {
  anchor?: { x: number; y: number; z: number };
  up?: { dx: number; dy: number; dz: number };
  norm?: { dx: number; dy: number; dz: number };
}

/** §20.1.5.14 CT_Scene3D。 */
export interface Scene3DParams {
  camera?: Camera3D;
  lightRig?: LightRig3D;
  backdrop?: Backdrop3D;
}

/**
 * spPr / bodyPr 上解析出的 3D 信息（parser 输出，存到 Shape.meta3D / TextBody.body3D）。
 * `baked` 是渲染期标记：离屏光栅路径（thumbnail/snapshot/pdf）把 3D 烘成 PNG 后置位，
 * 避免重复烘焙；live WebGL 渲染不置位。原始 sp3d/scene3d 始终保留以便 OOXML 回写。
 */
export interface Sp3DInfo {
  sp3d: Sp3DParams;
  scene3d?: Scene3DParams;
  /** 离屏光栅 dedupe 标记：true 表示已尝试过烘焙（不论成功），避免重复烘。 */
  baked?: boolean;
  /**
   * 离屏光栅 dedupe 的**几何/参数签名**：上次烘焙时 bbox + sp3d + scene3d + src +
   * cropRect + fill/stroke 的指纹。编辑器移动/缩放/改 3D 参数后该签名变化 → 触发重烘，
   * 让缩略图 / 截图等光栅视图跟随更新（否则一直显示旧 bakedSrc，与舞台不一致）。
   */
  bakedKey?: string;
  // ── 离屏光栅副通道 ──────────────────────────────────────────────────────────
  // SvgBackend（缩略图）/ CanvasBackend（截图/PDF）这些无法挂 live WebGL context 的
  // 后端，读这里的 baked PNG 来显示 3D；而 live WebGLShapeBackend 完全忽略它、实时
  // 渲染原始 src。把烘焙结果写进副通道（而非直接改 shape.src/bbox），可让「实时」与
  // 「光栅」两条路径互不污染——live 视图永远拿原始几何，不会被 PNG 替换。
  bakedSrc?: string;
  bakedBBox?: Rect;
  bakedNatural?: { w: number; h: number };
}

// ── 渲染侧 IO 类型（offscreen 光栅 baker 与 live backend 共用）─────────────────
// 这些只依赖 core 自身的几何/绘制类型，所以放在 core，让 parser（parse-time bake
// 选项）与 three-bake（实现）都能引用，而无需相互依赖。

export interface Shape3DRequest {
  id: string;
  bbox: Rect;
  pathD?: string;
  fill?: Paint;
  stroke?: Stroke;
  effects?: ShapeEffect[];
  sp3d: Sp3DParams;
  scene3d?: Scene3DParams;
  dpr?: number;
  pad?: number;
  /** image shape（`<p:pic>`）blip 解析出的 dataURL / URL，贴到 3D 体正面。 */
  imageSrc?: string;
  cropRect?: { l: number; t: number; r: number; b: number };
}

export interface Shape3DResult {
  src: string;
  natural: { w: number; h: number };
  /** baked PNG 在 slide 坐标系下覆盖的矩形（含 pad）。 */
  paddedBBox?: Rect;
  /** 配合 paddedBBox 把 PNG clip 回原 bbox 的 srcRect 等价值。 */
  cropRect?: { l: number; t: number; r: number; b: number };
}

export type Baker = (req: Shape3DRequest) => Promise<Shape3DResult | null>;
