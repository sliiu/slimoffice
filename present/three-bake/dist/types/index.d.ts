export * from "./types.js";
export { bakeSp3d } from "./bake-sp3d.js";
export { createBake3DRuntime, needs3DRender, needs3DBake, type Bake3DRuntime } from "./runtime.js";
export { resolveScene3D, resolveCamera, resolveSp3D, resolveLightRig, resolveBackdrop, type ResolvedScene3D, type ResolvedCamera, type ResolvedSp3D, type ResolvedLightRig, type ResolvedBevel, type ResolvedBackdrop, } from "./resolve.js";
export { buildThreeScene, createSceneCamera, loadImageTexture, getCachedImageTexture, type BuildSceneInputs, type BuiltScene, } from "./scene-builder.js";
export { applyTextureCrop } from "./material.js";
export { shapeSupports3D, shape3DInfo, shape3DPathD, shape3DPad, IMAGE_3D_PAD, SHAPE_3D_PAD, } from "./shape-path.js";
export { CAMERA_PRESETS, type CameraPreset } from "./presets.js";
