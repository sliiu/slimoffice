/** 图片 / 视频 / 音频。扩展名在拖放还没给出 MIME 时兜底。 */
export type MediaKind = "image" | "video" | "audio";
export declare function mediaKindOf(file: {
    name: string;
    type?: string;
}): MediaKind | null;
/** 多文件时按体积加权，当前这份的 0..1 折进总进度。 */
export declare function combinedReadRatio(completedBytes: number, currentRatio: number, currentSize: number, totalBytes: number): number;
export declare function progressLabel(base: string, ratio: number): string;
