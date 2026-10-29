import { dataUrlsToPdf, toAB } from "./pdf.js";
import { PDF_EXPORT_DPI, snapshotAllForPdf } from "./snapshot-raster.js";
import { buildStoredZip } from "./zip-store.js";
/** End-to-end PDF export (raster slides → multi-page PDF). Separate from browser print. */
export async function exportPresentationPdf(pres, opts = {}) {
    const blobs = await snapshotAllForPdf(pres, opts);
    return snapshotsToPdf(blobs, pres.size, { dpi: opts.dpi ?? PDF_EXPORT_DPI });
}
export async function snapshotsToZip(blobs, baseName = "slide") {
    const files = await Promise.all(blobs.map(async (b, i) => ({
        name: `${baseName}-${String(i + 1).padStart(3, "0")}.png`,
        data: new Uint8Array(await b.arrayBuffer()),
    })));
    return new Blob([toAB(buildStoredZip(files))], { type: "application/zip" });
}
export async function snapshotsToPdf(blobs, size, opts = {}) {
    const pages = await Promise.all(blobs.map((b) => blobToDataUrl(b)));
    const pdf = await dataUrlsToPdf(pages, size, opts);
    return new Blob([toAB(pdf)], { type: "application/pdf" });
}
function blobToDataUrl(b) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error ?? new Error("readAsDataURL"));
        r.readAsDataURL(b);
    });
}
