// Stored (no compression) ZIP writer. No DOM — safe for gateway / Node.
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
export function buildStoredZip(files) {
    const enc = new TextEncoder();
    const local = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
        const nameBytes = enc.encode(f.name);
        const crc = crc32(f.data);
        const localHead = new Uint8Array(30 + nameBytes.length);
        const ldv = new DataView(localHead.buffer);
        ldv.setUint32(0, 0x04034b50, true);
        ldv.setUint16(4, 20, true);
        ldv.setUint16(6, 0, true);
        ldv.setUint16(8, 0, true);
        ldv.setUint16(10, 0, true);
        ldv.setUint16(12, 0, true);
        ldv.setUint32(14, crc, true);
        ldv.setUint32(18, f.data.length, true);
        ldv.setUint32(22, f.data.length, true);
        ldv.setUint16(26, nameBytes.length, true);
        ldv.setUint16(28, 0, true);
        localHead.set(nameBytes, 30);
        local.push(localHead, f.data);
        const cd = new Uint8Array(46 + nameBytes.length);
        const cdv = new DataView(cd.buffer);
        cdv.setUint32(0, 0x02014b50, true);
        cdv.setUint16(4, 20, true);
        cdv.setUint16(6, 20, true);
        cdv.setUint16(8, 0, true);
        cdv.setUint16(10, 0, true);
        cdv.setUint16(12, 0, true);
        cdv.setUint16(14, 0, true);
        cdv.setUint32(16, crc, true);
        cdv.setUint32(20, f.data.length, true);
        cdv.setUint32(24, f.data.length, true);
        cdv.setUint16(28, nameBytes.length, true);
        cdv.setUint16(30, 0, true);
        cdv.setUint16(32, 0, true);
        cdv.setUint16(34, 0, true);
        cdv.setUint16(36, 0, true);
        cdv.setUint32(38, 0, true);
        cdv.setUint32(42, offset, true);
        cd.set(nameBytes, 46);
        central.push(cd);
        offset += localHead.length + f.data.length;
    }
    let cdSize = 0;
    for (const c of central)
        cdSize += c.length;
    const eocd = new Uint8Array(22);
    const edv = new DataView(eocd.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, cdSize, true);
    edv.setUint32(16, offset, true);
    return concat([...local, ...central, eocd]);
}
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
