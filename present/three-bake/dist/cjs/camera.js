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
exports.setupCamera = setupCamera;
const THREE = __importStar(require("three"));
// 相机方位约定（与几何 / UV 协调）：
//   - ExtrudeGeometry / slab 把 Shape 的 (0..baseW, 0..baseH) 作为顶点 (x,y,0)，
//     rectFrontUVGenerator 把 Shape.y=0 → uv.v=0、y=baseH → uv.v=1；texture.flipY=true
//     使 uv.v=1 取图像最顶行 → "图像顶部" 位于 three.js 世界 +Y。
//   - PowerPoint 的 perspectiveAbove / perspectiveRelaxedModerately 等 "Above" 类语义是
//     相机在物体上方俯视，"图像顶部应远离相机"（梯形上窄下宽）。要让 lat=-15° 这样的
//     负值产生这种效果，相机必须落在世界 -Y 方向（远离图像顶部、贴近底部），即
//     eye.y = +D·sin(lat)（lat<0 → eye.y<0）。
//   - `<a:backdrop>` 把场景平面从默认 +Z 旋到 norm，并用 up 覆盖相机 up。identity / 全 0
//     在 resolveBackdrop 已滤掉，这里只处理非默认。
function setupCamera(cam, target, distance, backdrop) {
    const { lat, lon, rev, fov, isOrtho } = cam;
    const latRad = THREE.MathUtils.degToRad(lat);
    const lonRad = THREE.MathUtils.degToRad(lon);
    const revRad = THREE.MathUtils.degToRad(rev);
    const lookAt = backdrop
        ? new THREE.Vector3(target.x + backdrop.target.x, target.y + backdrop.target.y, target.z + backdrop.target.z)
        : target.clone();
    const eye = new THREE.Vector3();
    eye.x = distance * Math.cos(latRad) * Math.sin(lonRad);
    eye.y = distance * Math.sin(latRad);
    eye.z = distance * Math.cos(latRad) * Math.cos(lonRad);
    eye.add(lookAt);
    const basisQ = backdrop?.forward &&
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(backdrop.forward.x, backdrop.forward.y, backdrop.forward.z));
    if (basisQ) {
        eye.sub(lookAt).applyQuaternion(basisQ).add(lookAt);
    }
    const up = new THREE.Vector3(0, -1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), revRad);
    if (basisQ)
        up.applyQuaternion(basisQ);
    if (backdrop?.up)
        up.set(backdrop.up.x, backdrop.up.y, backdrop.up.z);
    let camera;
    if (isOrtho) {
        const half = distance * 0.6;
        const ortho = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, distance * 10);
        ortho.position.copy(eye);
        ortho.up.copy(up);
        ortho.lookAt(lookAt);
        ortho.updateProjectionMatrix();
        camera = ortho;
    }
    else {
        const persp = new THREE.PerspectiveCamera(fov, 1, 0.1, distance * 10);
        persp.position.copy(eye);
        persp.up.copy(up);
        persp.lookAt(lookAt);
        persp.updateProjectionMatrix();
        camera = persp;
    }
    if (cam.zoom !== undefined && cam.zoom > 0) {
        camera.zoom = cam.zoom;
        camera.updateProjectionMatrix();
    }
    return { camera, isOrtho };
}
