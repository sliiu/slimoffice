export interface ImageNaturalSize {
    w: number;
    h: number;
}
/** 从 data URL 嗅探图片自然尺寸；非 data URL / 未知格式返回 undefined。带 LRU-ish 缓存。 */
export declare function imageSizeFromSrc(src: string): ImageNaturalSize | undefined;
/** 从图片字节嗅探自然尺寸。支持 PNG / JPEG / GIF87a/89a / WebP (VP8/VP8L/VP8X)。 */
export declare function sniffImageSize(b: Uint8Array): ImageNaturalSize | undefined;
