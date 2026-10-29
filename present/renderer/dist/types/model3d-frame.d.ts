import * as THREE from "three";
import type { Model3DShape } from "@sliiu/present-core";
export declare function loadGltfScene(src: string): Promise<THREE.Object3D>;
export declare function applyModel3DCameraPose(cam: THREE.PerspectiveCamera, latDeg: number, lonDeg: number, dist?: number): void;
export declare function applyModel3DCamera(cam: THREE.PerspectiveCamera, s: Model3DShape): void;
export declare function applyModel3DTransform(root: THREE.Object3D, s: Model3DShape): void;
export declare function getModel3DPreviewFrame(s: Model3DShape, onReady?: () => void): HTMLImageElement | null;
export declare function waitForModel3DFrames(timeoutMs?: number): Promise<void>;
