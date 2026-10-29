export declare class ZipBombError extends Error {
    constructor();
}
export interface PptxArchive {
    files: Map<string, Uint8Array>;
    getText(path: string): string | undefined;
    getBytes(path: string): Uint8Array | undefined;
    has(path: string): boolean;
    list(prefix?: string): string[];
}
export declare function loadArchive(input: ArrayBuffer | Uint8Array | Blob | File): Promise<PptxArchive>;
export declare function joinPath(base: string, target: string): string;
