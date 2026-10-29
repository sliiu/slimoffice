"use strict";
// Self-contained PDF writer for raster slide exports. Takes one data URL per page
// (PNG or JPEG, as produced by canvas.toBlob) and emits a single-image-per-page PDF.
//
// Page size is derived from slide design pixels at 96 DPI → PDF points (72 pt/in).
// Raster images may be higher resolution (e.g. 150 DPI export); they are scaled to fit
// the page MediaBox via the content stream CTM.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDF_POINTS_PER_INCH = exports.SCREEN_DPI = void 0;
exports.slideSizeToPdfPoints = slideSizeToPdfPoints;
exports.toAB = toAB;
exports.concat = concat;
exports.dataUrlsToPdf = dataUrlsToPdf;
exports.SCREEN_DPI = 96;
exports.PDF_POINTS_PER_INCH = 72;
/** Slide design px (96 DPI baseline) → PDF page size in points. */
function slideSizeToPdfPoints(size) {
    const pxToPt = exports.PDF_POINTS_PER_INCH / exports.SCREEN_DPI;
    return {
        widthPt: size.width * pxToPt,
        heightPt: size.height * pxToPt,
    };
}
function toAB(u) {
    const ab = new ArrayBuffer(u.length);
    new Uint8Array(ab).set(u);
    return ab;
}
function concat(parts) {
    let total = 0;
    for (const p of parts)
        total += p.length;
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
async function dataUrlsToPdf(pageDataUrls, size, _opts = {}) {
    const { widthPt: W, heightPt: H } = slideSizeToPdfPoints(size);
    const enc = new TextEncoder();
    const offsets = [];
    const binParts = [];
    let cursor = 0;
    const push = (s) => {
        const b = enc.encode(s);
        binParts.push(b);
        cursor += b.length;
    };
    const pushBin = (b) => {
        binParts.push(b);
        cursor += b.length;
    };
    const obj = (n, body) => {
        offsets[n] = cursor;
        push(`${n} 0 obj\n${body}\nendobj\n`);
    };
    const objBin = (n, head, bin, tail) => {
        offsets[n] = cursor;
        push(`${n} 0 obj\n${head}`);
        pushBin(bin);
        push(tail);
        push("\nendobj\n");
    };
    push("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
    const N = pageDataUrls.length;
    const catalog = 1;
    const pages = 2;
    const totalObjs = catalog + 1 + N * 3;
    let nextObj = 3;
    const pageIds = [];
    const imageIds = [];
    const contentIds = [];
    for (let i = 0; i < N; i++) {
        pageIds.push(nextObj++);
        contentIds.push(nextObj++);
        imageIds.push(nextObj++);
    }
    obj(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
    const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
    obj(pages, `<< /Type /Pages /Count ${N} /Kids [${kids}] >>`);
    for (let i = 0; i < N; i++) {
        const pid = pageIds[i];
        const cid = contentIds[i];
        const iid = imageIds[i];
        obj(pid, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${cid} 0 R /Resources << /XObject << /Im0 ${iid} 0 R >> >> >>`);
        const content = `q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ\n`;
        const contentBytes = enc.encode(content);
        obj(cid, `<< /Length ${contentBytes.length} >>\nstream\n${content}endstream`);
        const dataUrl = pageDataUrls[i];
        const m = /^data:image\/(jpeg|png);base64,(.+)$/i.exec(dataUrl);
        if (m && m[1].toLowerCase() === "jpeg") {
            const imgBytes = base64ToBytes(m[2]);
            const dim = readJpegSize(imgBytes);
            const head = `<< /Type /XObject /Subtype /Image /Width ${dim.w || W} /Height ${dim.h || H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`;
            objBin(iid, head, imgBytes, "\nendstream");
        }
        else {
            const pngBytes = m ? base64ToBytes(m[2]) : new Uint8Array(0);
            const img = await pngToPdfImage(pngBytes);
            const head = `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${img.w} >> /Length ${img.data.length} >>\nstream\n`;
            objBin(iid, head, img.data, "\nendstream");
        }
    }
    const xrefStart = cursor;
    push(`xref\n0 ${totalObjs + 1}\n`);
    push("0000000000 65535 f \n");
    for (let i = 1; i <= totalObjs; i++) {
        const off = offsets[i] ?? 0;
        push(`${String(off).padStart(10, "0")} 00000 n \n`);
    }
    push(`trailer\n<< /Size ${totalObjs + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
    return concat(binParts);
}
function base64ToBytes(b64) {
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(b64, "base64"));
    }
    if (typeof atob !== "undefined") {
        const s = atob(b64);
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++)
            out[i] = s.charCodeAt(i);
        return out;
    }
    return new Uint8Array(0);
}
// PNG decoder that extracts the raw IDAT (zlib stream) plus geometry/color type.
// Supports color type 2 (RGB) and 6 (RGBA), 8 bpc, non-interlaced — exactly what
// canvas.toBlob('image/png') produces (browsers always emit RGBA, color type 6).
function decodePng(bytes) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++)
        if (bytes[i] !== sig[i])
            return { w: 0, h: 0, idat: new Uint8Array(0), colorType: 2 };
    let off = 8;
    let w = 0;
    let h = 0;
    let colorType = 2;
    const idat = [];
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (off < bytes.length) {
        const len = dv.getUint32(off, false);
        const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
        if (type === "IHDR") {
            w = dv.getUint32(off + 8, false);
            h = dv.getUint32(off + 12, false);
            colorType = bytes[off + 17];
        }
        else if (type === "IDAT") {
            idat.push(bytes.subarray(off + 8, off + 8 + len));
        }
        else if (type === "IEND") {
            break;
        }
        off += 8 + len + 4;
    }
    return { w, h, idat: concat(idat), colorType };
}
// Turns a PNG (as produced by canvas.toBlob) into a 3-channel /DeviceRGB stream
// embeddable in a PDF image XObject (/FlateDecode, PNG-Up predictor).
//
// Color type 2 (plain RGB) is already 3-channel, so its IDAT is re-embedded as-is.
// Color type 6 (RGBA — the browser default) must be converted: a naive re-embed as
// 3-channel DeviceRGB mis-aligns every scanline (4 source bytes/pixel read as 3),
// producing garbled, streaky output. We inflate, unfilter, composite the alpha over
// white (PDF pages are white), then re-filter (Up) and re-deflate as RGB.
async function pngToPdfImage(bytes) {
    const dec = decodePng(bytes);
    if (dec.w === 0 || dec.h === 0)
        return { w: dec.w, h: dec.h, data: dec.idat };
    if (dec.colorType === 2)
        return { w: dec.w, h: dec.h, data: dec.idat };
    const inflated = await inflate(dec.idat);
    const rgb = unfilterToRgb(inflated, dec.w, dec.h, dec.colorType);
    const filtered = applyUpFilter(rgb, dec.w, dec.h);
    const data = await deflate(filtered);
    return { w: dec.w, h: dec.h, data };
}
// Reverse PNG per-scanline filters and emit packed RGB. RGBA input (colorType 6) is
// composited over an opaque white background.
function unfilterToRgb(raw, w, h, colorType) {
    const ch = colorType === 6 ? 4 : 3;
    const stride = w * ch;
    const out = new Uint8Array(w * h * 3);
    const cur = new Uint8Array(stride);
    const prev = new Uint8Array(stride);
    let pos = 0;
    for (let y = 0; y < h; y++) {
        const ft = raw[pos++];
        for (let x = 0; x < stride; x++) {
            const f = raw[pos++];
            const a = x >= ch ? cur[x - ch] : 0;
            const b = prev[x];
            const c = x >= ch ? prev[x - ch] : 0;
            let v;
            if (ft === 1)
                v = f + a;
            else if (ft === 2)
                v = f + b;
            else if (ft === 3)
                v = f + ((a + b) >> 1);
            else if (ft === 4)
                v = f + paeth(a, b, c);
            else
                v = f;
            cur[x] = v & 0xff;
        }
        for (let x = 0; x < w; x++) {
            const si = x * ch;
            const di = (y * w + x) * 3;
            if (ch === 4) {
                const al = cur[si + 3];
                const inv = 255 - al;
                out[di] = ((cur[si] * al + 255 * inv + 127) / 255) | 0;
                out[di + 1] = ((cur[si + 1] * al + 255 * inv + 127) / 255) | 0;
                out[di + 2] = ((cur[si + 2] * al + 255 * inv + 127) / 255) | 0;
            }
            else {
                out[di] = cur[si];
                out[di + 1] = cur[si + 1];
                out[di + 2] = cur[si + 2];
            }
        }
        prev.set(cur);
    }
    return out;
}
function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc)
        return a;
    return pb <= pc ? b : c;
}
// Apply the PNG "Up" filter per row so the stream compresses well under /Predictor 15.
function applyUpFilter(rgb, w, h) {
    const stride = w * 3;
    const out = new Uint8Array(h * (1 + stride));
    let op = 0;
    for (let y = 0; y < h; y++) {
        out[op++] = 2;
        const rowStart = y * stride;
        const prevStart = rowStart - stride;
        for (let x = 0; x < stride; x++) {
            const up = y > 0 ? rgb[prevStart + x] : 0;
            out[op++] = (rgb[rowStart + x] - up) & 0xff;
        }
    }
    return out;
}
// Read pixel dimensions from a JPEG (SOF marker) so the PDF image dict matches.
function readJpegSize(bytes) {
    let off = 2;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    while (off + 9 < bytes.length) {
        if (bytes[off] !== 0xff) {
            off++;
            continue;
        }
        const marker = bytes[off + 1];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
            off += 2;
            continue;
        }
        const len = dv.getUint16(off + 2, false);
        // SOF0..SOF15 (baseline/progressive), excluding DHT(0xc4)/DAC(0xc8)/DAC(0xcc).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const h = dv.getUint16(off + 5, false);
            const w = dv.getUint16(off + 7, false);
            return { w, h };
        }
        off += 2 + len;
    }
    return { w: 0, h: 0 };
}
async function inflate(zlib) {
    const ds = new DecompressionStream("deflate");
    const stream = new Blob([toAB(zlib)]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function deflate(raw) {
    const cs = new CompressionStream("deflate");
    const stream = new Blob([toAB(raw)]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
