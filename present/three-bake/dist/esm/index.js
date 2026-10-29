export * from "./types.js";
export { bakeSp3d } from "./bake-sp3d.js";
export { createBake3DRuntime, needs3DRender, needs3DBake } from "./runtime.js";
// PowerPoint 效果层 + 共享场景构建器（live WebGLShapeBackend 复用）。
export { resolveScene3D, resolveCamera, resolveSp3D, resolveLightRig, resolveBackdrop, } from "./resolve.js";
export { buildThreeScene, createSceneCamera, loadImageTexture, getCachedImageTexture, } from "./scene-builder.js";
export { applyTextureCrop } from "./material.js";
export { shapeSupports3D, shape3DInfo, shape3DPathD, shape3DPad, IMAGE_3D_PAD, SHAPE_3D_PAD, } from "./shape-path.js";
export { CAMERA_PRESETS } from "./presets.js";
