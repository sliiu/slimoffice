import type { PptxArchive } from "./zip";

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  webp: "image/webp",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
  tif: "image/tiff",
  tiff: "image/tiff",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
};

export type MediaMode = "blob" | "data";

export class MediaResolver {
  private cache = new Map<string, string>();
  private archive: PptxArchive;
  private mode: MediaMode;

  constructor(archive: PptxArchive, mode: MediaMode = "blob") {
    this.archive = archive;
    this.mode = mode;
  }

  resolve(path: string): string | undefined {
    if (/^https?:\/\//i.test(path) || /^file:/i.test(path)) return path;
    if (this.cache.has(path)) return this.cache.get(path);
    const bytes = this.archive.getBytes(path);
    if (!bytes) return undefined;
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    const mime = EXT_MIME[ext] ?? "application/octet-stream";
    const url = this.toUrl(bytes, mime);
    this.cache.set(path, url);
    return url;
  }

  resolveRaw(cacheKey: string, bytes: Uint8Array, mime: string): string {
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const url = this.toUrl(bytes, mime);
    this.cache.set(cacheKey, url);
    return url;
  }

  private toUrl(bytes: Uint8Array, mime: string): string {
    if (this.mode === "data") {
      return `data:${mime};base64,${bytesToBase64(bytes)}`;
    }
    if (typeof window !== "undefined" && typeof URL.createObjectURL === "function") {
      const buf: BlobPart = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blob = new Blob([buf], { type: mime });
      return URL.createObjectURL(blob);
    }
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  }

  dispose(): void {
    for (const url of this.cache.values()) {
      if (url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(url);
      }
    }
    this.cache.clear();
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  if (typeof btoa !== "undefined") return btoa(bin);
  const g = globalThis as unknown as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } };
  if (g.Buffer) return g.Buffer.from(bin, "binary").toString("base64");
  throw new Error("base64 encoder unavailable");
}
