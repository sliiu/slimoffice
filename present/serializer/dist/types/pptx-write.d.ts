import type { Presentation } from "@sliiu/present-core";
import type { DeckParts } from "./deck-assemble.js";
export { MediaTable, DeckMediaRegistry, SlideMediaTable } from "./media-table.js";
export interface WritePptxOptions {
    title?: string;
    author?: string;
    debugRoundTrip?: boolean;
    forceFromScratch?: boolean;
}
export declare function writePptx(pres: Presentation, opts?: WritePptxOptions): Uint8Array;
/**
 * 「分离生成」入口（服务端专用）：只做 from-scratch 的**纯文本部件生成**。
 * 媒体不解码、不打包，改为返回引用 manifest（zipPath + ref + mime）；zip 拼接由前端
 * assembleDeck 完成（媒体字节全程留在客户端）。
 *
 * 强制 from-scratch —— 服务端拿不到原始归档，round-trip 由客户端本地处理。
 */
export declare function buildDeckParts(pres: Presentation, opts?: WritePptxOptions): DeckParts;
