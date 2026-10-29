export declare const SCREEN_DPI = 96;
export declare const PDF_POINTS_PER_INCH = 72;
/** Slide design px (96 DPI baseline) → PDF page size in points. */
export declare function slideSizeToPdfPoints(size: {
    width: number;
    height: number;
}): {
    widthPt: number;
    heightPt: number;
};
export interface PdfBuildOptions {
    /** Metadata: raster DPI used when snapshots were taken (does not change page box). */
    dpi?: number;
}
export declare function toAB(u: Uint8Array): ArrayBuffer;
export declare function concat(parts: Uint8Array[]): Uint8Array;
export declare function dataUrlsToPdf(pageDataUrls: string[], size: {
    width: number;
    height: number;
}, _opts?: PdfBuildOptions): Promise<Uint8Array>;
