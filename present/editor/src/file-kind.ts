/** 图片 / 视频 / 音频。扩展名在拖放还没给出 MIME 时兜底。 */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff?|ico)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|mkv)$/i;
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|flac|weba)$/i;

export type MediaKind = "image" | "video" | "audio";

export function mediaKindOf(file: { name: string; type?: string }): MediaKind | null {
  const type = (file.type ?? "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  const name = file.name.trim();
  if (IMAGE_EXT.test(name)) return "image";
  if (VIDEO_EXT.test(name)) return "video";
  if (AUDIO_EXT.test(name)) return "audio";
  return null;
}

/** 多文件时按体积加权，当前这份的 0..1 折进总进度。 */
export function combinedReadRatio(
  completedBytes: number,
  currentRatio: number,
  currentSize: number,
  totalBytes: number,
): number {
  if (totalBytes <= 0) return Number.NaN;
  const current = Number.isFinite(currentRatio) ? Math.min(1, Math.max(0, currentRatio)) : 0;
  return Math.min(1, (completedBytes + current * Math.max(0, currentSize)) / totalBytes);
}

export function progressLabel(base: string, ratio: number): string {
  if (!Number.isFinite(ratio)) return base;
  return `${base} ${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
}
