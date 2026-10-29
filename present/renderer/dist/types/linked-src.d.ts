/** 浏览器无法加载 `file:` 外链图；画带文件名的占位，避免空白碎图。
 *  Node 下若本地文件仍在，读成 data URL 仅供预览，**不改 IR 的 src**（否则 round-trip 会丢掉 r:link）。
 */
export declare function isFileLinkedSrc(src: string | undefined): boolean;
export declare function linkedImageLabel(src: string): string;
export declare function linkedImagePlaceholderDataUri(src: string, w?: number, h?: number): string;
export declare function displayImageSrc(src: string, w?: number, h?: number): string;
export declare function drawLinkedImagePlaceholder(ctx: CanvasRenderingContext2D, bbox: {
    x: number;
    y: number;
    w: number;
    h: number;
}, src: string): void;
