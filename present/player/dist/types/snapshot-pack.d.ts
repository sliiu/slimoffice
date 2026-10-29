import type { Presentation } from "@sliiu/present-core";
import { type PdfExportOptions } from "./snapshot-raster.js";
/** End-to-end PDF export (raster slides → multi-page PDF). Separate from browser print. */
export declare function exportPresentationPdf(pres: Presentation, opts?: PdfExportOptions): Promise<Blob>;
export declare function snapshotsToZip(blobs: Blob[], baseName?: string): Promise<Blob>;
export declare function snapshotsToPdf(blobs: Blob[], size: {
    width: number;
    height: number;
}, opts?: {
    dpi?: number;
}): Promise<Blob>;
