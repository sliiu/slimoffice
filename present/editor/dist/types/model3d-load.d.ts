import type { Model3DPreset } from "@sliiu/present-core";
export type Model3DMime = "model/gltf-binary" | "model/gltf+json";
/** Detect glTF binary vs JSON from file bytes. */
export declare function detectModel3DMime(bytes: Uint8Array, fileName?: string): Model3DMime | null;
export declare function model3DDataUrlFromBytes(bytes: Uint8Array, mime: Model3DMime): string;
/** Ensure a user/model data URL uses a glTF MIME type understood by serializer + Three.js. */
export declare function normalizeModel3DDataUrl(dataUrl: string, fileName?: string): string;
/** Fetch a remote `.glb` / `.gltf` and return an embeddable data URL. */
export declare function loadModel3DFromUrl(url: string): Promise<{
    glbSrc: string;
    label: string;
}>;
/** Read a user-selected `.glb` / `.gltf` file as a normalized data URL. */
export declare function loadModel3DFromFile(file: File): Promise<{
    glbSrc: string;
    label: string;
}>;
/** Fetch a `.glb` URL and return a `data:model/gltf-binary;base64,...` URL. */
export declare function fetchGlbAsDataUrl(url: string): Promise<string>;
/** Read a user-selected `.glb` / `.gltf` file as a data URL. */
export declare function readModel3DFileAsDataUrl(file: File): Promise<string>;
export declare function model3DPresetAssetUrl(baseUrl: string, preset: Model3DPreset): string;
export declare function loadModel3DPresetAsDataUrl(preset: Model3DPreset, baseUrl?: string): Promise<string>;
export declare const MODEL3D_CUSTOM_PRESET_ID = "custom";
/** Byte length of a glTF data URL (for inspector labels). */
export declare function model3DDataUrlByteSize(glbSrc: string | undefined): number | null;
