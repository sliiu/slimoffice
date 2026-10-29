// ════════════════════════════════════════════════════════════════════════════
// PowerPoint 效果层 —— preset 数值表与默认值（唯一来源）
//
// ECMA-376 只定义 preset 的**名称**（camera/@prst、sp3d/@prstMaterial、lightRig/@rig），
// **不**定义数值。下面的相机角度 / fov / 材质参数都是**逆向 PowerPoint / WPS 行为**
// 得到的 best-effort 值，并以 samples/7.pptx slide2 棋盘（perspectiveRelaxedModerately
// + fov 55° + 默认 bevel + threePt/dir=t）做视觉校验基准。
//
// 这里是整套 3D 的「PowerPoint 知识」集中地：parser 只忠实解析名称，渲染器只消费
// resolve.ts 解析出来的具体参数。改 preset 视觉只动这一份文件。
// ════════════════════════════════════════════════════════════════════════════

export interface CameraPreset {
  /** 纬度（俯仰），度。负值=相机在物体上方俯视（"Above" 类语义）。 */
  lat: number;
  /** 经度（偏航），度。 */
  lon: number;
  /** 自转，度。 */
  rev: number;
  /** 视场角，度。<1 视为正交投影。 */
  fov: number;
}

// 相机方位/符号约定与几何/UV 的协调见 resolve.ts + camera.ts 的注释。
export const CAMERA_PRESETS: Record<string, CameraPreset> = {
  // ── legacy oblique（窄 fov 斜投影）─────────────────────────────────────────
  legacyObliqueTopLeft: { lat: -20, lon: -30, rev: 0, fov: 25 },
  legacyObliqueTop: { lat: -20, lon: 0, rev: 0, fov: 25 },
  legacyObliqueTopRight: { lat: -20, lon: 30, rev: 0, fov: 25 },
  legacyObliqueLeft: { lat: 0, lon: -30, rev: 0, fov: 25 },
  legacyObliqueFront: { lat: 0, lon: 0, rev: 0, fov: 25 },
  legacyObliqueRight: { lat: 0, lon: 30, rev: 0, fov: 25 },
  legacyObliqueBottomLeft: { lat: 20, lon: -30, rev: 0, fov: 25 },
  legacyObliqueBottom: { lat: 20, lon: 0, rev: 0, fov: 25 },
  legacyObliqueBottomRight: { lat: 20, lon: 30, rev: 0, fov: 25 },
  // ── legacy perspective（中等 fov 透视）─────────────────────────────────────
  legacyPerspectiveTopLeft: { lat: -20, lon: -30, rev: 0, fov: 40 },
  legacyPerspectiveTop: { lat: -20, lon: 0, rev: 0, fov: 40 },
  legacyPerspectiveTopRight: { lat: -20, lon: 30, rev: 0, fov: 40 },
  legacyPerspectiveLeft: { lat: 0, lon: -30, rev: 0, fov: 40 },
  legacyPerspectiveFront: { lat: 0, lon: 0, rev: 0, fov: 40 },
  legacyPerspectiveRight: { lat: 0, lon: 30, rev: 0, fov: 40 },
  legacyPerspectiveBottomLeft: { lat: 20, lon: -30, rev: 0, fov: 40 },
  legacyPerspectiveBottom: { lat: 20, lon: 0, rev: 0, fov: 40 },
  legacyPerspectiveBottomRight: { lat: 20, lon: 30, rev: 0, fov: 40 },
  // ── orthographic / isometric（正交）────────────────────────────────────────
  orthographicFront: { lat: 0, lon: 0, rev: 0, fov: 0.01 },
  isometricTopUp: { lat: -35, lon: 45, rev: 0, fov: 0.01 },
  isometricTopDown: { lat: 35, lon: 45, rev: 0, fov: 0.01 },
  isometricBottomUp: { lat: -35, lon: -135, rev: 0, fov: 0.01 },
  isometricBottomDown: { lat: 35, lon: -135, rev: 0, fov: 0.01 },
  isometricLeftUp: { lat: -35, lon: -45, rev: 0, fov: 0.01 },
  isometricLeftDown: { lat: 35, lon: -45, rev: 0, fov: 0.01 },
  isometricRightUp: { lat: -35, lon: 135, rev: 0, fov: 0.01 },
  isometricRightDown: { lat: 35, lon: 135, rev: 0, fov: 0.01 },
  isometricOffAxis1Left: { lat: -25, lon: -50, rev: 0, fov: 0.01 },
  isometricOffAxis1Right: { lat: -25, lon: 50, rev: 0, fov: 0.01 },
  isometricOffAxis1Top: { lat: -45, lon: 0, rev: 0, fov: 0.01 },
  isometricOffAxis2Left: { lat: 25, lon: -50, rev: 0, fov: 0.01 },
  isometricOffAxis2Right: { lat: 25, lon: 50, rev: 0, fov: 0.01 },
  isometricOffAxis2Top: { lat: 45, lon: 0, rev: 0, fov: 0.01 },
  isometricOffAxis3Bottom: { lat: 0, lon: 45, rev: 0, fov: 0.01 },
  isometricOffAxis3Left: { lat: 0, lon: -45, rev: 0, fov: 0.01 },
  isometricOffAxis3Right: { lat: 0, lon: 45, rev: 0, fov: 0.01 },
  isometricOffAxis3Top: { lat: -45, lon: 0, rev: 0, fov: 0.01 },
  isometricOffAxis4Bottom: { lat: 30, lon: -45, rev: 0, fov: 0.01 },
  isometricOffAxis4Left: { lat: 0, lon: -45, rev: 0, fov: 0.01 },
  isometricOffAxis4Right: { lat: 0, lon: 45, rev: 0, fov: 0.01 },
  isometricOffAxis4Top: { lat: -30, lon: 45, rev: 0, fov: 0.01 },
  // ── oblique（正交斜投影）────────────────────────────────────────────────────
  obliqueTopLeft: { lat: -20, lon: -30, rev: 0, fov: 0.01 },
  obliqueTop: { lat: -20, lon: 0, rev: 0, fov: 0.01 },
  obliqueTopRight: { lat: -20, lon: 30, rev: 0, fov: 0.01 },
  obliqueLeft: { lat: 0, lon: -30, rev: 0, fov: 0.01 },
  obliqueRight: { lat: 0, lon: 30, rev: 0, fov: 0.01 },
  obliqueBottomLeft: { lat: 20, lon: -30, rev: 0, fov: 0.01 },
  obliqueBottom: { lat: 20, lon: 0, rev: 0, fov: 0.01 },
  obliqueBottomRight: { lat: 20, lon: 30, rev: 0, fov: 0.01 },
  // ── perspective（透视）──────────────────────────────────────────────────────
  perspectiveFront: { lat: 0, lon: 0, rev: 0, fov: 35 },
  perspectiveLeft: { lat: 0, lon: -25, rev: 0, fov: 35 },
  perspectiveRight: { lat: 0, lon: 25, rev: 0, fov: 35 },
  perspectiveAbove: { lat: -20, lon: 0, rev: 0, fov: 35 },
  perspectiveBelow: { lat: 20, lon: 0, rev: 0, fov: 35 },
  perspectiveAboveLeftFacing: { lat: -20, lon: -25, rev: 0, fov: 35 },
  perspectiveAboveRightFacing: { lat: -20, lon: 25, rev: 0, fov: 35 },
  perspectiveContrastingLeftFacing: { lat: -10, lon: -50, rev: 0, fov: 60 },
  perspectiveContrastingRightFacing: { lat: -10, lon: 50, rev: 0, fov: 60 },
  perspectiveHeroicLeftFacing: { lat: -45, lon: -45, rev: 0, fov: 60 },
  perspectiveHeroicRightFacing: { lat: -45, lon: 45, rev: 0, fov: 60 },
  perspectiveHeroicExtremeLeftFacing: { lat: -55, lon: -55, rev: 0, fov: 80 },
  perspectiveHeroicExtremeRightFacing: { lat: -55, lon: 55, rev: 0, fov: 80 },
  // perspectiveRelaxed / perspectiveRelaxedModerately：PowerPoint 3D 旋转库里的
  // "透视：宽松 / 适度宽松" —— 真·透视相机（不是正交！），相机在物体上方俯视，使顶边
  // 后退、底边前凸，产生"桌面式"透视倾斜。两个关键：
  //   1. 必须用 PerspectiveCamera：正交投影下倾斜只按 cos(angle) 缩放（15° 仅 3%，看不出），
  //      透视收缩才让倾斜可见。
  //   2. "relaxed" = 长焦镜头（窄 fov），透视轻柔、畸变小；配中等俯角形成柔和的梯形。
  //      PowerPoint 写进 OOXML 的 `@fov`（棋盘 fov=55°）不是字面相机视角，PPT 内部当
  //      zoom/参考用 —— 真正落地是窄 fov + 适度俯视，所以这两个 preset 锁定窄 fov。
  //   - lat：俯视下倾角，负值=相机在上方（"Above" 语义，见 camera.ts eye.y 约定）。
  perspectiveRelaxed: { lat: -13, lon: 0, rev: 0, fov: 22 },
  perspectiveRelaxedModerately: { lat: -18, lon: 0, rev: 0, fov: 28 },
};

// "perspectiveRelaxed*" 锁定预设窄 fov，忽略 OOXML 里偏宽的显式 `@fov`（见上注释）。
export const FOV_LOCKED_PRESETS = new Set<string>([
  "perspectiveRelaxed",
  "perspectiveRelaxedModerately",
]);

// ── 默认值（OOXML 缺省时的 PowerPoint 默认）───────────────────────────────────

/**
 * ECMA-376 §20.1.5.4：`<a:bevelT/>` / `<a:bevelB/>` 缺省 w/h = 76200 EMU。
 * 76200 ÷ 9525 EMU/px = 8 px。parser 把缺省留 undefined，这里补默认。
 */
export const DEFAULT_BEVEL_PX = 8;

/** ECMA-376 §20.1.5.12 sp3d/@prstMaterial 默认 = warmMatte。 */
export const DEFAULT_MATERIAL = "warmMatte";

/** ECMA-376 §20.1.5.9 lightRig 缺省（无 scene3d 时）我们用 threePt 兜底。 */
export const DEFAULT_LIGHT_RIG = "threePt";

/** PerspectiveCamera 缺省 fov（无 preset 也无显式 fov 时）。 */
export const DEFAULT_FOV = 35;
