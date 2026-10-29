// 「分离生成」的前端拼接侧：把服务端生成的 OOXML 文本部件 + 本地媒体字节合成 .pptx。
//
// 本模块**刻意不 import 任何渲染逻辑**（pptx-shapes / pptx-write / pptx-roundtrip），
// 只依赖 zip 打包。这样 SaaS 前端 bundle 可以只带 assembleDeck，而把真正的生成逻辑
// （buildDeckParts 及其渲染依赖）留在服务端，不进浏览器。

import { packZip, type ZipFiles } from "./zip-write";
import type { MediaManifestEntry } from "./media-table";

/**
 * 服务端 buildDeckParts 的产物：
 * - files：路径 → OOXML 文本（slide/master/layout/theme/rels/[Content_Types].xml…）
 * - media：需要前端本地补入字节的 ppt/media/* 清单（ref 为前端可回查的引用 token）
 */
export interface DeckParts {
  files: Record<string, string>;
  media: MediaManifestEntry[];
}

/**
 * 前端拼接：文本部件原样写入，媒体部件用 resolveBytes(ref) 回查本地字节写入，再 packZip。
 * resolveBytes 返回 undefined（本地找不到该媒体）时写入空字节，避免 rel 悬空导致打不开。
 */
export function assembleDeck(
  parts: DeckParts,
  resolveBytes: (ref: string) => Uint8Array | undefined,
): Uint8Array {
  const zip: ZipFiles = {};
  for (const [path, xml] of Object.entries(parts.files)) {
    zip[path] = xml;
  }
  for (const entry of parts.media) {
    const bytes = resolveBytes(entry.ref);
    zip[entry.zipPath] = bytes ?? new Uint8Array(0);
  }
  return packZip(zip);
}
