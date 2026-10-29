import * as THREE from "three";
export interface LightRigSpec {
    ambient: number;
    lights: Array<{
        color: number;
        intensity: number;
        pos: [number, number, number];
    }>;
}
export declare function applyLightRig(scene: THREE.Scene, rigName: string | undefined, dir: string | undefined): void;
