import type { Presentation, Slide } from "@sliiu/present-core";
/** Screen / thumbnail baseline (CSS px treated as 96 DPI). */
export declare const SCREEN_DPI = 96;
/** Default raster DPI for PDF export — sharper than legacy `scale: 2` (~192 DPI). */
export declare const PDF_EXPORT_DPI = 150;
/** High-quality PDF preset (large decks / print). */
export declare const PDF_EXPORT_DPI_HIGH = 200;
export interface SnapshotOptions {
    width?: number;
    /** @deprecated Prefer `dpi` — legacy multiplier on 96 DPI baseline. */
    scale?: number;
    /** Target raster DPI for export (default 96). Overrides `scale` when set. */
    dpi?: number;
    background?: string;
    mimeType?: string;
    quality?: number;
    masters?: import("@sliiu/present-core").SlideMaster[];
}
export interface PdfExportOptions extends SnapshotOptions {
    /** Load `pres.fonts` before rasterizing (default true in browser). */
    embedFonts?: boolean;
}
/** Map slide design px + target DPI → CanvasBackend pixelRatio. */
export declare function snapshotPixelRatio(size: {
    width: number;
}, opts?: SnapshotOptions): number;
export declare function snapshotSlide(slide: Slide, size: {
    width: number;
    height: number;
}, opts?: SnapshotOptions): Promise<Blob>;
export declare function snapshotAll(pres: Presentation, opts?: SnapshotOptions): Promise<Blob[]>;
/** Rasterize all slides for PDF — higher DPI, JPEG tiles, optional embedded-font preload. */
export declare function snapshotAllForPdf(pres: Presentation, opts?: PdfExportOptions): Promise<Blob[]>;
