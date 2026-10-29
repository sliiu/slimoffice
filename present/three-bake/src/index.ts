export * from "./types";
export { bakeSp3d } from "./bake-sp3d";
export { createBake3DRuntime, needs3DRender, needs3DBake, type Bake3DRuntime } from "./runtime";
// PowerPoint 效果层 + 共享场景构建器（live WebGLShapeBackend 复用）。
export {
  resolveScene3D,
  resolveCamera,
  resolveSp3D,
  resolveLightRig,
  resolveBackdrop,
  type ResolvedScene3D,
  type ResolvedCamera,
  type ResolvedSp3D,
  type ResolvedLightRig,
  type ResolvedBevel,
  type ResolvedBackdrop,
} from "./resolve";
export {
  buildThreeScene,
  createSceneCamera,
  loadImageTexture,
  getCachedImageTexture,
  type BuildSceneInputs,
  type BuiltScene,
} from "./scene-builder";
export { applyTextureCrop } from "./material";
export {
  shapeSupports3D,
  shape3DInfo,
  shape3DPathD,
  shape3DPad,
  IMAGE_3D_PAD,
  SHAPE_3D_PAD,
} from "./shape-path";
export { CAMERA_PRESETS, type CameraPreset } from "./presets";
