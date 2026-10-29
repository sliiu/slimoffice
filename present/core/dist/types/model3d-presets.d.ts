/** Built-in stock 3D models for Insert → 3D Model (simplified library). */
export interface Model3DPreset {
    id: string;
    label: string;
    /** Relative path under repo `samples/models/` (playground / tests load via fetch). */
    samplePath: string;
}
export declare const MODEL3D_PRESETS: Model3DPreset[];
