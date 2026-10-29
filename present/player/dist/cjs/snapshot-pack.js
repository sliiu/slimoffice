"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportPresentationPdf = exportPresentationPdf;
exports.snapshotsToZip = snapshotsToZip;
exports.snapshotsToPdf = snapshotsToPdf;
const pdf_1 = require("./pdf");
const snapshot_raster_1 = require("./snapshot-raster");
const zip_store_1 = require("./zip-store");
/** End-to-end PDF export (raster slides → multi-page PDF). Separate from browser print. */
async function exportPresentationPdf(pres, opts = {}) {
    const blobs = await (0, snapshot_raster_1.snapshotAllForPdf)(pres, opts);
    return snapshotsToPdf(blobs, pres.size, { dpi: opts.dpi ?? snapshot_raster_1.PDF_EXPORT_DPI });
}
async function snapshotsToZip(blobs, baseName = "slide") {
    const files = await Promise.all(blobs.map(async (b, i) => ({
        name: `${baseName}-${String(i + 1).padStart(3, "0")}.png`,
        data: new Uint8Array(await b.arrayBuffer()),
    })));
    return new Blob([(0, pdf_1.toAB)((0, zip_store_1.buildStoredZip)(files))], { type: "application/zip" });
}
async function snapshotsToPdf(blobs, size, opts = {}) {
    const pages = await Promise.all(blobs.map((b) => blobToDataUrl(b)));
    const pdf = await (0, pdf_1.dataUrlsToPdf)(pages, size, opts);
    return new Blob([(0, pdf_1.toAB)(pdf)], { type: "application/pdf" });
}
function blobToDataUrl(b) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error ?? new Error("readAsDataURL"));
        r.readAsDataURL(b);
    });
}
