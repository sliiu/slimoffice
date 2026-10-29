import type { PptxArchive } from "./zip.js";
export type MediaMode = "blob" | "data";
export declare class MediaResolver {
    private cache;
    private archive;
    private mode;
    constructor(archive: PptxArchive, mode?: MediaMode);
    resolve(path: string): string | undefined;
    resolveRaw(cacheKey: string, bytes: Uint8Array, mime: string): string;
    private toUrl;
    dispose(): void;
}
