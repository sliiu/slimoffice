"use strict";
/** OLE embedding preview extraction — images and PDF from ppt/embeddings. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOle10NativeStream = parseOle10NativeStream;
exports.readCfbStream = readCfbStream;
exports.extractOlePreviewPayload = extractOlePreviewPayload;
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
function isCfb(bytes) {
    if (bytes.length < 8)
        return false;
    for (let i = 0; i < 8; i++)
        if (bytes[i] !== CFB_MAGIC[i])
            return false;
    return true;
}
function bytesEqAt(bytes, off, sig) {
    if (off + sig.length > bytes.length)
        return false;
    for (let i = 0; i < sig.length; i++)
        if (bytes[off + i] !== sig[i])
            return false;
    return true;
}
function detectPayloadAt(bytes, start) {
    if (bytesEqAt(bytes, start, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return { kind: "image", mime: "image/png", bytes: slicePng(bytes, start) };
    }
    if (bytesEqAt(bytes, start, [0xff, 0xd8, 0xff])) {
        return { kind: "image", mime: "image/jpeg", bytes: sliceJpeg(bytes, start) };
    }
    if (bytesEqAt(bytes, start, [0x47, 0x49, 0x46, 0x38])) {
        return { kind: "image", mime: "image/gif", bytes: sliceThrough(bytes, start) };
    }
    if (bytesEqAt(bytes, start, [0x25, 0x50, 0x44, 0x46])) {
        return { kind: "pdf", mime: "application/pdf", bytes: slicePdf(bytes, start) };
    }
    return null;
}
function sliceThrough(bytes, start) {
    return bytes.subarray(start);
}
function slicePng(bytes, start) {
    const endSig = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    for (let i = start + 8; i < bytes.length - endSig.length; i++) {
        if (bytesEqAt(bytes, i, endSig))
            return bytes.subarray(start, i + endSig.length);
    }
    return bytes.subarray(start);
}
function sliceJpeg(bytes, start) {
    for (let i = start + 2; i < bytes.length - 1; i++) {
        if (bytes[i] === 0xff && bytes[i + 1] === 0xd9)
            return bytes.subarray(start, i + 2);
    }
    return bytes.subarray(start);
}
function slicePdf(bytes, start) {
    const pat = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
    let end = bytes.length;
    for (let i = start; i < bytes.length - pat.length; i++) {
        if (bytesEqAt(bytes, i, pat)) {
            end = i + pat.length;
            while (end < bytes.length && (bytes[end] === 0x0a || bytes[end] === 0x0d || bytes[end] === 0x20))
                end++;
        }
    }
    return bytes.subarray(start, end);
}
function scanForEmbeddedPayload(bytes) {
    const maxScan = Math.min(bytes.length, 8 * 1024 * 1024);
    for (let i = 0; i < maxScan - 8; i++) {
        const hit = detectPayloadAt(bytes, i);
        if (hit)
            return hit;
    }
    return null;
}
/** Parse `\x01Ole10Native` stream payload → embedded file bytes. */
function parseOle10NativeStream(stream) {
    if (stream.length < 12)
        return null;
    const dv = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
    let off = 0;
    const total = dv.getUint32(0, true);
    if (total > 0 && total + 4 <= stream.length)
        off = 4;
    // flags WORD
    if (off + 2 > stream.length)
        return null;
    off += 2;
    // label (ANSI null-terminated)
    while (off < stream.length && stream[off] !== 0)
        off++;
    if (off >= stream.length)
        return null;
    off++;
    // temp path (ANSI null-terminated)
    while (off < stream.length && stream[off] !== 0)
        off++;
    if (off >= stream.length)
        return null;
    off++;
    // 4 unknown bytes (often zero)
    off += 4;
    if (off + 4 > stream.length)
        return null;
    const dataSize = dv.getUint32(off, true);
    off += 4;
    if (dataSize <= 0 || off + dataSize > stream.length)
        return null;
    return stream.subarray(off, off + dataSize);
}
function utf16NameEquals(entryName, want) {
    const dv = new DataView(entryName.buffer, entryName.byteOffset, entryName.byteLength);
    let s = "";
    for (let i = 0; i < 32; i++) {
        const c = dv.getUint16(i * 2, true);
        if (c === 0)
            break;
        s += String.fromCharCode(c);
    }
    return s === want;
}
/** Minimal MS-CFB reader — enough to pull `\x01Ole10Native` from oleObject.bin. */
function readCfbStream(bytes, streamName) {
    if (!isCfb(bytes) || bytes.length < 512)
        return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const sectorShift = dv.getUint16(0x1e, true);
    const sectorSize = sectorShift < 32 ? 1 << sectorShift : 512;
    const dirStart = dv.getUint32(0x30, true);
    if (dirStart === 0xffffffff)
        return null;
    const readSector = (sid) => {
        if (sid === 0xffffffff)
            return null;
        const off = (sid + 1) * sectorSize;
        if (off + sectorSize > bytes.length)
            return null;
        return bytes.subarray(off, off + sectorSize);
    };
    const fat = [];
    const fatSectors = dv.getUint32(0x2c, true);
    let fatIdx = dv.getUint32(0x4c, true);
    for (let i = 0; i < fatSectors && fatIdx !== 0xffffffff; i++) {
        const sec = readSector(fatIdx);
        if (!sec)
            break;
        const n = sectorSize / 4;
        for (let j = 0; j < n; j++)
            fat.push(new DataView(sec.buffer, sec.byteOffset, sec.byteLength).getUint32(j * 4, true));
        fatIdx = fat[fatIdx] ?? 0xffffffff;
    }
    const readChain = (startSid) => {
        const parts = [];
        let sid = startSid;
        const seen = new Set();
        while (sid !== 0xfffffffe && sid !== 0xffffffff && !seen.has(sid)) {
            seen.add(sid);
            const sec = readSector(sid);
            if (!sec)
                break;
            parts.push(sec);
            sid = fat[sid] ?? 0xfffffffe;
        }
        const total = parts.reduce((n, p) => n + p.length, 0);
        const out = new Uint8Array(total);
        let o = 0;
        for (const p of parts) {
            out.set(p, o);
            o += p.length;
        }
        return out;
    };
    let dirSid = dirStart;
    const seenDir = new Set();
    while (dirSid !== 0xfffffffe && dirSid !== 0xffffffff && !seenDir.has(dirSid)) {
        seenDir.add(dirSid);
        const sec = readSector(dirSid);
        if (!sec)
            break;
        const entries = sectorSize / 128;
        for (let e = 0; e < entries; e++) {
            const base = e * 128;
            const name = sec.subarray(base, base + 64);
            if (!utf16NameEquals(name, streamName))
                continue;
            const esize = new DataView(sec.buffer, sec.byteOffset + base, 128).getUint32(0x78, true);
            const start = new DataView(sec.buffer, sec.byteOffset + base, 128).getUint32(0x74, true);
            if (start === 0xffffffff || esize === 0)
                return new Uint8Array(0);
            const data = readChain(start);
            return data.subarray(0, esize);
        }
        dirSid = fat[dirSid] ?? 0xfffffffe;
    }
    return null;
}
function extHint(fileName, progId) {
    const ext = fileName?.split(".").pop()?.toLowerCase();
    if (ext === "pdf" || progId?.includes("Acrobat"))
        return "pdf";
    if (ext && ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff"].includes(ext))
        return "image";
    return undefined;
}
/**
 * Extract previewable image/PDF bytes from an OLE embedding part.
 * Handles raw files, OLE compound containers, and Ole10Native streams.
 */
function extractOlePreviewPayload(bytes, fileName, progId) {
    const hint = extHint(fileName, progId);
    const direct = detectPayloadAt(bytes, 0);
    if (direct) {
        if (!hint || direct.kind === hint)
            return direct;
        return direct;
    }
    if (isCfb(bytes)) {
        const native = readCfbStream(bytes, "\x01Ole10Native");
        if (native) {
            const embedded = parseOle10NativeStream(native);
            if (embedded) {
                const fromNative = detectPayloadAt(embedded, 0) ?? scanForEmbeddedPayload(embedded);
                if (fromNative)
                    return fromNative;
            }
            const fromStream = detectPayloadAt(native, 0) ?? scanForEmbeddedPayload(native);
            if (fromStream)
                return fromStream;
        }
        const contents = readCfbStream(bytes, "CONTENTS");
        if (contents) {
            const fromContents = detectPayloadAt(contents, 0) ?? scanForEmbeddedPayload(contents);
            if (fromContents)
                return fromContents;
        }
    }
    const scanned = scanForEmbeddedPayload(bytes);
    if (scanned) {
        if (!hint || scanned.kind === hint)
            return scanned;
        return scanned;
    }
    return null;
}
