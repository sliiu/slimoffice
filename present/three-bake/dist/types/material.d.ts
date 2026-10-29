import * as THREE from "three";
import type { Paint } from "@sliiu/present-core";
export interface MaterialOpts {
    prst?: string;
    fallbackColor?: string;
    imageTexture?: THREE.Texture;
    litTexture?: boolean;
    tint?: number;
}
export declare function pickPrimaryColor(paint: Paint | undefined, fallback: string): string;
export declare function buildMaterial(paint: Paint | undefined, opts?: MaterialOpts): THREE.Material;
export declare function applyTextureCrop(texture: THREE.Texture, cropRect: {
    l: number;
    t: number;
    r: number;
    b: number;
} | undefined): void;
