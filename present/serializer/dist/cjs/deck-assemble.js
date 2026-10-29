"use strict";
// 「分离生成」的前端拼接侧：把服务端生成的 OOXML 文本部件 + 本地媒体字节合成 .pptx。
//
// 本模块**刻意不 import 任何渲染逻辑**（pptx-shapes / pptx-write / pptx-roundtrip），
// 只依赖 zip 打包。这样 SaaS 前端 bundle 可以只带 assembleDeck，而把真正的生成逻辑
// （buildDeckParts 及其渲染依赖）留在服务端，不进浏览器。
Object.defineProperty(exports, "__esModule", { value: true });
exports.assembleDeck = assembleDeck;
const zip_write_1 = require("./zip-write");
/**
 * 前端拼接：文本部件原样写入，媒体部件用 resolveBytes(ref) 回查本地字节写入，再 packZip。
 * resolveBytes 返回 undefined（本地找不到该媒体）时写入空字节，避免 rel 悬空导致打不开。
 */
function assembleDeck(parts, resolveBytes) {
    const zip = {};
    for (const [path, xml] of Object.entries(parts.files)) {
        zip[path] = xml;
    }
    for (const entry of parts.media) {
        const bytes = resolveBytes(entry.ref);
        zip[entry.zipPath] = bytes ?? new Uint8Array(0);
    }
    return (0, zip_write_1.packZip)(zip);
}
