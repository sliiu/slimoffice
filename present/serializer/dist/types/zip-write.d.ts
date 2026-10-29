export interface ZipFiles {
    [path: string]: Uint8Array | string;
}
export declare function packZip(files: ZipFiles): Uint8Array;
export declare function dataUrlToBytes(dataUrl: string): {
    bytes: Uint8Array;
    mime: string;
} | null;
export declare function mimeToExt(mime: string): string;
/** 给 [Content_Types].xml 补 Default；源 PPTX 常没有 svg/webp，WPS 会直接不显示新媒体。 */
export declare function ensureContentTypesDefault(xml: string, ext: string, mime?: string): string;
