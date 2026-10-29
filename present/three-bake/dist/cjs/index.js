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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAMERA_PRESETS = exports.SHAPE_3D_PAD = exports.IMAGE_3D_PAD = exports.shape3DPad = exports.shape3DPathD = exports.shape3DInfo = exports.shapeSupports3D = exports.applyTextureCrop = exports.getCachedImageTexture = exports.loadImageTexture = exports.createSceneCamera = exports.buildThreeScene = exports.resolveBackdrop = exports.resolveLightRig = exports.resolveSp3D = exports.resolveCamera = exports.resolveScene3D = exports.needs3DBake = exports.needs3DRender = exports.createBake3DRuntime = exports.bakeSp3d = void 0;
__exportStar(require("./types"), exports);
var bake_sp3d_1 = require("./bake-sp3d");
Object.defineProperty(exports, "bakeSp3d", { enumerable: true, get: function () { return bake_sp3d_1.bakeSp3d; } });
var runtime_1 = require("./runtime");
Object.defineProperty(exports, "createBake3DRuntime", { enumerable: true, get: function () { return runtime_1.createBake3DRuntime; } });
Object.defineProperty(exports, "needs3DRender", { enumerable: true, get: function () { return runtime_1.needs3DRender; } });
Object.defineProperty(exports, "needs3DBake", { enumerable: true, get: function () { return runtime_1.needs3DBake; } });
// PowerPoint 效果层 + 共享场景构建器（live WebGLShapeBackend 复用）。
var resolve_1 = require("./resolve");
Object.defineProperty(exports, "resolveScene3D", { enumerable: true, get: function () { return resolve_1.resolveScene3D; } });
Object.defineProperty(exports, "resolveCamera", { enumerable: true, get: function () { return resolve_1.resolveCamera; } });
Object.defineProperty(exports, "resolveSp3D", { enumerable: true, get: function () { return resolve_1.resolveSp3D; } });
Object.defineProperty(exports, "resolveLightRig", { enumerable: true, get: function () { return resolve_1.resolveLightRig; } });
Object.defineProperty(exports, "resolveBackdrop", { enumerable: true, get: function () { return resolve_1.resolveBackdrop; } });
var scene_builder_1 = require("./scene-builder");
Object.defineProperty(exports, "buildThreeScene", { enumerable: true, get: function () { return scene_builder_1.buildThreeScene; } });
Object.defineProperty(exports, "createSceneCamera", { enumerable: true, get: function () { return scene_builder_1.createSceneCamera; } });
Object.defineProperty(exports, "loadImageTexture", { enumerable: true, get: function () { return scene_builder_1.loadImageTexture; } });
Object.defineProperty(exports, "getCachedImageTexture", { enumerable: true, get: function () { return scene_builder_1.getCachedImageTexture; } });
var material_1 = require("./material");
Object.defineProperty(exports, "applyTextureCrop", { enumerable: true, get: function () { return material_1.applyTextureCrop; } });
var shape_path_1 = require("./shape-path");
Object.defineProperty(exports, "shapeSupports3D", { enumerable: true, get: function () { return shape_path_1.shapeSupports3D; } });
Object.defineProperty(exports, "shape3DInfo", { enumerable: true, get: function () { return shape_path_1.shape3DInfo; } });
Object.defineProperty(exports, "shape3DPathD", { enumerable: true, get: function () { return shape_path_1.shape3DPathD; } });
Object.defineProperty(exports, "shape3DPad", { enumerable: true, get: function () { return shape_path_1.shape3DPad; } });
Object.defineProperty(exports, "IMAGE_3D_PAD", { enumerable: true, get: function () { return shape_path_1.IMAGE_3D_PAD; } });
Object.defineProperty(exports, "SHAPE_3D_PAD", { enumerable: true, get: function () { return shape_path_1.SHAPE_3D_PAD; } });
var presets_1 = require("./presets");
Object.defineProperty(exports, "CAMERA_PRESETS", { enumerable: true, get: function () { return presets_1.CAMERA_PRESETS; } });
