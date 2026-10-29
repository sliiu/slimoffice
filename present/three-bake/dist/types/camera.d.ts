import * as THREE from "three";
import type { ResolvedBackdrop, ResolvedCamera } from "./resolve.js";
export interface CameraResult {
    camera: THREE.Camera;
    isOrtho: boolean;
}
export declare function setupCamera(cam: ResolvedCamera, target: THREE.Vector3, distance: number, backdrop?: ResolvedBackdrop): CameraResult;
