"use strict";
// 图片自然尺寸嗅探（PNG / JPEG / GIF / WebP）。
//
// 用途：fillToXml 在导出 ImagePaint fit="cover"/"contain" 时需要图片的
// 宽高比来换算 <a:srcRect>（cover 裁剪）或 <a:stretch><a:fillRect>（contain
// 信箱边），否则 PowerPoint 打开 from-scratch 导出的 pptx 时背景图会被拉伸
// 变形（OOXML 没有 cover/contain 语义，只有 srcRect + stretch）。
//
// 只读文件头，不做完整解码；解析失败一律返回 undefined（调用方降级为
// 现状的纯 stretch 行为，不阻断导出）。
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageSizeFromSrc = imageSizeFromSrc;
exports.sniffImageSize = sniffImageSize;
const zip_write_1 = require("./zip-write");
const sizeCache = new Map();
/** 从 data URL 嗅探图片自然尺寸；非 data URL / 未知格式返回 undefined。带 LRU-ish 缓存。 */
function imageSizeFromSrc(src) {
    if (!src.startsWith("data:"))
        return undefined;
    if (sizeCache.has(src))
        return sizeCache.get(src);
    const decoded = (0, zip_write_1.dataUrlToBytes)(src);
    const size = decoded ? sniffImageSize(decoded.bytes) : undefined;
    // 防止长会话里缓存无限膨胀（key 是完整 dataURL，可能很大）。
    if (sizeCache.size > 64)
        sizeCache.clear();
    sizeCache.set(src, size);
    return size;
}
/** 从图片字节嗅探自然尺寸。支持 PNG / JPEG / GIF87a/89a / WebP (VP8/VP8L/VP8X)。 */
function sniffImageSize(b) {
    if (b.length < 16)
        return undefined;
    // PNG: 8 字节签名 + IHDR（width/height 为大端 u32，偏移 16/20）
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
        if (b.length < 24)
            return undefined;
        const w = readU32BE(b, 16);
        const h = readU32BE(b, 20);
        return valid(w, h);
    }
    // JPEG: 扫 SOF0..SOF15 marker（跳过 EXIF 等 APPn 段）
    if (b[0] === 0xff && b[1] === 0xd8) {
        let off = 2;
        while (off + 9 < b.length) {
            if (b[off] !== 0xff) {
                off++;
                continue;
            }
            const marker = b[off + 1];
            // 填充字节 / 独立 marker（无长度段）
            if (marker === 0xff) {
                off++;
                continue;
            }
            if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
                off += 2;
                continue;
            }
            const segLen = (b[off + 2] << 8) | b[off + 3];
            // SOF0-3, 5-7, 9-11, 13-15（跳过 DHT=0xc4 / DAC=0xcc）
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                const h = (b[off + 5] << 8) | b[off + 6];
                const w = (b[off + 7] << 8) | b[off + 8];
                return valid(w, h);
            }
            if (segLen < 2)
                return undefined;
            off += 2 + segLen;
        }
        return undefined;
    }
    // GIF: "GIF87a"/"GIF89a" + 小端 u16 宽高
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
        const w = b[6] | (b[7] << 8);
        const h = b[8] | (b[9] << 8);
        return valid(w, h);
    }
    // WebP: "RIFF"...."WEBP" + VP8 / VP8L / VP8X 子块
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
        if (b.length < 30)
            return undefined;
        const fourcc = String.fromCharCode(b[12], b[13], b[14], b[15]);
        if (fourcc === "VP8 ") {
            // lossy：帧头在 chunk payload 偏移 6，宽高为 14-bit 小端
            const w = (b[26] | (b[27] << 8)) & 0x3fff;
            const h = (b[28] | (b[29] << 8)) & 0x3fff;
            return valid(w, h);
        }
        if (fourcc === "VP8L") {
            // lossless：signature 0x2f 后 28 bit 打包 (w-1, h-1)
            if (b[20] !== 0x2f)
                return undefined;
            const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
            const w = (bits & 0x3fff) + 1;
            const h = ((bits >> 14) & 0x3fff) + 1;
            return valid(w, h);
        }
        if (fourcc === "VP8X") {
            // extended：canvas 尺寸为 24-bit 小端 (w-1, h-1)，偏移 24
            const w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1;
            const h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1;
            return valid(w, h);
        }
        return undefined;
    }
    return undefined;
}
function readU32BE(b, off) {
    return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}
function valid(w, h) {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
        return undefined;
    return { w, h };
}
