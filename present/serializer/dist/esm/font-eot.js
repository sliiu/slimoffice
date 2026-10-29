// 最小 EOT 容器：把 sfnt（TTF/OTF）包进 PowerPoint 可识别的 `.fntdata` 外壳。
// 解析侧见 `packages/parser/src/embedded-fonts.ts`（flags=0 时直接取尾部 font 数据）。
const EOT_HEADER_SIZE = 82;
/** Wrap OpenType / TrueType bytes in an uncompressed EOT container. */
export function sfntToEotFntdata(sfnt) {
    const fontDataSize = sfnt.byteLength;
    const eotSize = EOT_HEADER_SIZE + fontDataSize;
    const out = new Uint8Array(eotSize);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, eotSize, true);
    dv.setUint32(4, fontDataSize, true);
    dv.setUint32(8, 0x00020001, true); // version 2.0
    dv.setUint32(12, 0, true); // no compression / XOR
    // PANOSE @16 — leave zeroed
    out[26] = 1; // charset ANSI
    dv.setUint16(28, 400, true); // weight normal
    dv.setUint16(30, 0, true); // fsType installable
    dv.setUint16(34, 0x504c, true); // magic "LP"
    out.set(sfnt, EOT_HEADER_SIZE);
    return out;
}
