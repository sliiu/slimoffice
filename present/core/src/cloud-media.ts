import type { Presentation } from "./slide";

/** Version-scoped media reference stored in Presentation src/poster. */
export const PPT_MEDIA_PREFIX = "ppt-media://";

export function isPptMediaSrc(src: string): boolean {
  return src.startsWith(PPT_MEDIA_PREFIX);
}

export function pptMediaPath(versionId: string, hash: string): string {
  return `${PPT_MEDIA_PREFIX}${versionId}/${hash}`;
}

export const MEDIA_HASH_RE = /^[a-f0-9]{64}$/;
export const PPT_MEDIA_PATH_RE = /^ppt-media:\/\/[A-Za-z0-9_-]{8,80}\/[a-f0-9]{64}$/;

export interface PackedMediaBlob {
  /** Version-scoped path written into `src` / `poster`. */
  path: string;
  /** SHA-256 of the raw (decoded) media bytes. */
  hash: string;
  mime: string;
  bytes: Uint8Array;
}

export interface PackedMediaRef {
  path: string;
  hash: string;
  mime: string;
}

export interface CloudDeckPayloadV2 {
  v: 2;
  pres: Presentation;
  savedAt: number;
  media: PackedMediaRef[];
}

export function newCloudVersionId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${Date.now()}-${hex}`;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function dataUrlToBytes(src: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!src.startsWith("data:")) return null;
  try {
    const res = await fetch(src);
    const header = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0]!.trim();
    const mime = header || "application/octet-stream";
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 1) return null;
    return { mime, bytes };
  } catch {
    return null;
  }
}

export function bytesToDataUrl(mime: string, bytes: Uint8Array): string {
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(bytes).toString("base64")
      : bytesToBase64(bytes);
  return `data:${mime || "application/octet-stream"};base64,${b64}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function walkMediaSrcs(root: unknown, visit: (parent: Record<string, unknown>, key: string, value: string) => void): void {
  const seen = new WeakSet<object>();
  const walk = (obj: unknown): void => {
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    if (!obj || typeof obj !== "object") return;
    if (seen.has(obj)) return;
    seen.add(obj);
    const rec = obj as Record<string, unknown>;
    for (const key of Object.keys(rec)) {
      const value = rec[key];
      if ((key === "src" || key === "poster") && typeof value === "string") {
        visit(rec, key, value);
      } else {
        walk(value);
      }
    }
  };
  walk(root);
}

/**
 * Replace inline `data:` media with version-scoped `ppt-media://{versionId}/{hash}` paths.
 * Identical bytes share one hash (and one blob); each version still gets its own path.
 */
export async function packPresentationMedia(
  pres: Presentation,
  versionId: string,
): Promise<{ pres: Presentation; media: PackedMediaBlob[] }> {
  const clone = JSON.parse(JSON.stringify(pres)) as Presentation;
  const byHash = new Map<string, PackedMediaBlob>();
  const dataUrlHash = new Map<string, string>();

  const replacements: Array<{ parent: Record<string, unknown>; key: string; path: string }> = [];

  const visits: Array<{ parent: Record<string, unknown>; key: string; value: string }> = [];
  walkMediaSrcs(clone, (parent, key, value) => {
    visits.push({ parent, key, value });
  });

  for (const { parent, key, value } of visits) {
    if (!value.startsWith("data:")) continue;
    let hash = dataUrlHash.get(value);
    if (!hash) {
      const parsed = await dataUrlToBytes(value);
      if (!parsed) continue;
      hash = await sha256Hex(parsed.bytes);
      dataUrlHash.set(value, hash);
      if (!byHash.has(hash)) {
        const path = pptMediaPath(versionId, hash);
        byHash.set(hash, { path, hash, mime: parsed.mime, bytes: parsed.bytes });
      }
    }
    const packed = byHash.get(hash);
    if (!packed) continue;
    replacements.push({ parent, key, path: packed.path });
  }

  for (const r of replacements) r.parent[r.key] = r.path;
  return { pres: clone, media: [...byHash.values()] };
}

export async function unpackPresentationMedia(
  pres: Presentation,
  media: PackedMediaRef[],
  loadBytes: (hash: string) => Promise<Uint8Array>,
): Promise<Presentation> {
  const clone = JSON.parse(JSON.stringify(pres)) as Presentation;
  const mimeByPath = new Map(media.map((m) => [m.path, m] as const));
  const decoded = new Map<string, string>();

  const visits: Array<{ parent: Record<string, unknown>; key: string; value: string }> = [];
  walkMediaSrcs(clone, (parent, key, value) => {
    visits.push({ parent, key, value });
  });

  const hashes = [...new Set(media.map((m) => m.hash))];
  await Promise.all(
    hashes.map(async (hash) => {
      const ref = media.find((m) => m.hash === hash);
      if (!ref) return;
      const bytes = await loadBytes(hash);
      const dataUrl = bytesToDataUrl(ref.mime, bytes);
      for (const m of media) {
        if (m.hash === hash) decoded.set(m.path, dataUrl);
      }
    }),
  );

  for (const { parent, key, value } of visits) {
    if (!isPptMediaSrc(value)) continue;
    const dataUrl = decoded.get(value);
    if (dataUrl) parent[key] = dataUrl;
    else {
      const ref = mimeByPath.get(value);
      if (ref) {
        const bytes = await loadBytes(ref.hash);
        const dataUrl2 = bytesToDataUrl(ref.mime, bytes);
        decoded.set(value, dataUrl2);
        parent[key] = dataUrl2;
      }
    }
  }

  return clone;
}
