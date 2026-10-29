import type { MediaManifestEntry } from "./media-table.js";
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
export declare function assembleDeck(parts: DeckParts, resolveBytes: (ref: string) => Uint8Array | undefined): Uint8Array;
