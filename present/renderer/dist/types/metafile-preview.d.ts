export declare const METAFILE_MARKER_SRC: string;
export declare function isMetafileDataUrl(src: string): boolean;
/** EMF 签名在偏移 40（" EMF"）。可放置 WMF 以 0x9AC6CDD7 开头。 */
export declare function isMetafileBytes(bytes: Uint8Array, mime?: string): boolean;
/**
 * 画布该用的地址。
 * 返回空字符串表示图元文件还在转，调用方先留白，完成后再画。
 * 转失败返回虚线占位。普通图片原样返回。
 */
export declare function previewImageSrc(src: string, img: HTMLImageElement | undefined, onReady?: () => void): string;
export declare function waitForMetafilePreviews(): Promise<void>;
