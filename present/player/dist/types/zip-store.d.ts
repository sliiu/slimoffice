export interface ZipFile {
    name: string;
    data: Uint8Array;
}
export declare function buildStoredZip(files: ZipFile[]): Uint8Array;
