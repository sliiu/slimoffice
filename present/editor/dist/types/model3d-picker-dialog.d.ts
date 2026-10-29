export interface Model3DPickerResult {
    presetId: string;
    glbSrc: string;
    label: string;
}
export interface Model3DPickerOptions {
    /** Base URL for built-in preset files (e.g. `/` with `public/samples/models/`). */
    assetsBaseUrl?: string;
}
export declare function openModel3DPickerDialog(doc: Document, opts?: Model3DPickerOptions): Promise<Model3DPickerResult | null>;
