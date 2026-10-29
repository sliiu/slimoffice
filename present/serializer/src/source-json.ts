import type { Presentation, PresentationSource, Theme } from "@ppt/core";

/**
 * JSON-safe round-trip archive: `__source.files` 是 Map + Uint8Array，不能走 JSON.stringify。
 * 网关 writePptx 需要这份字节才能 surgical patch；前端把 Map 编成 path → base64。
 */
export interface SerializedPresentationSource {
  presentationPath: string;
  files: Record<string, string>;
  slidePartPaths?: Array<string | null>;
  themeSnapshot?: Theme;
  commentAuthorsPartPath?: string;
  modernAuthorsPartPath?: string;
  commentsModern?: boolean;
  commentsSnapshot?: string;
  commentMetaSnapshot?: string;
  protectionMetaSnapshot?: string;
  editorPluginsMetaSnapshot?: string;
  playbackPluginsMetaSnapshot?: string;
  sectionsMetaSnapshot?: string;
  proofingLangMetaSnapshot?: string;
  tagsPartPath?: string;
  macroEnabled?: boolean;
  vbaProjectPartPath?: string;
  fontsSnapshot?: string;
  photoAlbumSnapshot?: string;
  kinsokuSnapshot?: string;
  viewGuidesSnapshot?: string;
  viewPropsPartPath?: string;
  showPrSnapshot?: string;
  presPropsPartPath?: string;
}

const META_KEYS = [
  "themeSnapshot",
  "commentAuthorsPartPath",
  "modernAuthorsPartPath",
  "commentsModern",
  "commentsSnapshot",
  "commentMetaSnapshot",
  "protectionMetaSnapshot",
  "editorPluginsMetaSnapshot",
  "playbackPluginsMetaSnapshot",
  "sectionsMetaSnapshot",
  "proofingLangMetaSnapshot",
  "tagsPartPath",
  "macroEnabled",
  "vbaProjectPartPath",
  "fontsSnapshot",
  "photoAlbumSnapshot",
  "kinsokuSnapshot",
  "viewGuidesSnapshot",
  "viewPropsPartPath",
  "showPrSnapshot",
  "presPropsPartPath",
] as const satisfies ReadonlyArray<keyof PresentationSource>;

function u8ToB64(bytes: Uint8Array): string {
  const g = globalThis as unknown as {
    Buffer?: { from(u: Uint8Array): { toString(enc: string): string } };
  };
  if (g.Buffer) return g.Buffer.from(bytes).toString("base64");
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

function b64ToU8(b64: string): Uint8Array {
  const g = globalThis as unknown as {
    Buffer?: { from(s: string, enc: string): Uint8Array };
  };
  if (g.Buffer) return new Uint8Array(g.Buffer.from(b64, "base64"));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function copyMeta(
  src: PresentationSource | SerializedPresentationSource,
  dest: PresentationSource | SerializedPresentationSource,
): void {
  for (const k of META_KEYS) {
    const v = src[k];
    if (v !== undefined) (dest as unknown as Record<string, unknown>)[k] = v;
  }
}

/** 从内存 Presentation 抽出可 JSON 传输的 `__source`（无 archive 则 undefined）。 */
export function serializePresentationSource(pres: Presentation): SerializedPresentationSource | undefined {
  const src = pres.__source;
  if (!src?.files?.size || !src.presentationPath) return undefined;
  const files: Record<string, string> = {};
  for (const [path, bytes] of src.files) {
    files[path] = u8ToB64(bytes);
  }
  const out: SerializedPresentationSource = {
    presentationPath: src.presentationPath,
    files,
    slidePartPaths: pres.slides.map((s) => s.__source?.partPath ?? null),
  };
  copyMeta(src, out);
  return out;
}

export function deserializePresentationSource(raw: SerializedPresentationSource): {
  source: PresentationSource;
  slidePartPaths?: Array<string | null>;
} {
  const files = new Map<string, Uint8Array>();
  for (const [path, b64] of Object.entries(raw.files ?? {})) {
    if (typeof b64 !== "string" || !path) continue;
    try {
      files.set(path, b64ToU8(b64));
    } catch {
      // skip corrupt part
    }
  }
  const source: PresentationSource = {
    files,
    presentationPath: raw.presentationPath,
  };
  copyMeta(raw, source);
  return { source, slidePartPaths: raw.slidePartPaths };
}
