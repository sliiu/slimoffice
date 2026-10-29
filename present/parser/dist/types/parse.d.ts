import type { Presentation, Shape } from "@sliiu/present-core";
import type { Baker } from "./shape-3d.js";
import { loadArchive, type PptxArchive } from "./zip.js";
import { type MediaMode } from "./media.js";
export interface ParseOptions {
    baseId?: string;
    mediaMode?: MediaMode;
    bake3D?: Baker;
}
export type PptxOpenErrorCode = "LEGACY_PPT" | "ENCRYPTED_PPTX";
/** 打不开的文件类型；宿主按 `code` 给本地化提示。 */
export declare class PptxOpenError extends Error {
    readonly code: PptxOpenErrorCode;
    constructor(code: PptxOpenErrorCode, message: string);
}
export declare function parsePptx(input: ArrayBuffer | Uint8Array | Blob | File, opts?: ParseOptions): Promise<Presentation>;
export declare function parseFromArchive(archive: PptxArchive, opts?: ParseOptions): Presentation;
/**
 * 递归遍历 shapes，给每个节点挂上「解析时 fill / stroke 的深拷贝快照」。
 * 这两个字段为非可枚举属性（不会被 JSON.stringify / structuredClone 误带出），
 * round-trip 保存时通过 JSON 比较 `current vs snapshot` 判断「用户是否真的改了
 * fill / stroke」—— 未改动则跳过 spPr 重写，保留原始 schemeClr 等扩展引用。
 */
export declare function attachFillStrokeSnapshots(shapes: unknown): void;
/** `p:video`/`p:audio` 的 stCond delay=0 表示进入幻灯片即播 → shape.autoplay。 */
export declare function applyMediaAutoplayFromTiming(shapes: Shape[], timing: {
    tnLst?: unknown[];
} | undefined): void;
export { loadArchive };
