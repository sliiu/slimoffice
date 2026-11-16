export declare class ZipBombError extends Error {
    constructor();
}
export interface OfficeArchive {
    files: Map<string, Uint8Array>;
    getText(path: string): string | undefined;
}
export declare function loadArchive(input: Uint8Array): OfficeArchive;
