// 3D 数据类型的唯一来源是 @ppt/core（packages/core/src/three-d.ts）。three-bake 只
// 做「已解析参数 → three.js 场景 / PNG」的渲染，不再自带一份类型定义，避免与 parser
// 漂移。这里整体 re-export，保持 `@ppt/three-bake` 的旧引用路径可用。
export type {
  Bevel3D,
  Sphere3D,
  Sp3DParams,
  Camera3D,
  LightRig3D,
  Backdrop3D,
  Scene3DParams,
  Sp3DInfo,
  Shape3DRequest,
  Shape3DResult,
  Baker,
} from "@ppt/core";
