import type { Presentation } from "@ppt/core";
import { dataUrlsToPdf, toAB } from "./pdf";
import { PDF_EXPORT_DPI, snapshotAllForPdf, type PdfExportOptions } from "./snapshot-raster";
import { buildStoredZip } from "./zip-store";

/** End-to-end PDF export (raster slides → multi-page PDF). Separate from browser print. */
export async function exportPresentationPdf(pres: Presentation, opts: PdfExportOptions = {}): Promise<Blob> {
  const blobs = await snapshotAllForPdf(pres, opts);
  return snapshotsToPdf(blobs, pres.size, { dpi: opts.dpi ?? PDF_EXPORT_DPI });
}

export async function snapshotsToZip(blobs: Blob[], baseName = "slide"): Promise<Blob> {
  const files = await Promise.all(
    blobs.map(async (b, i) => ({
      name: `${baseName}-${String(i + 1).padStart(3, "0")}.png`,
      data: new Uint8Array(await b.arrayBuffer()),
    })),
  );
  return new Blob([toAB(buildStoredZip(files))], { type: "application/zip" });
}

export async function snapshotsToPdf(
  blobs: Blob[],
  size: { width: number; height: number },
  opts: { dpi?: number } = {},
): Promise<Blob> {
  const pages = await Promise.all(blobs.map((b) => blobToDataUrl(b)));
  const pdf = await dataUrlsToPdf(pages, size, opts);
  return new Blob([toAB(pdf)], { type: "application/pdf" });
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("readAsDataURL"));
    r.readAsDataURL(b);
  });
}
