/** User media library (images / audio / video) shared across decks. */

export type MediaLibraryKind = "image" | "video" | "audio";

export const MEDIA_LIBRARY_DEFAULT_CATEGORY_ID = "cat_default";
export const MEDIA_LIBRARY_MAX_ITEM_BYTES = 80 * 1024 * 1024;
export const MEDIA_LIBRARY_ID_RE = /^[a-zA-Z0-9_-]{4,64}$/;

export interface MediaLibraryCategory {
  id: string;
  name: string;
  order: number;
}

export interface MediaLibraryItem {
  id: string;
  categoryId: string;
  kind: MediaLibraryKind;
  name: string;
  mime: string;
  /** SHA-256 of plaintext bytes. */
  hash: string;
  /** Stored blob size (ciphertext when cloud-backed). */
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  createdAt: number;
  updatedAt: number;
}

export interface MediaLibraryIndex {
  v: 1;
  categories: MediaLibraryCategory[];
  items: MediaLibraryItem[];
}

export interface MediaLibraryInsertResult {
  kind: MediaLibraryKind;
  dataUrl: string;
  name: string;
  mime: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface MediaLibraryAdapter {
  listCategories(): Promise<MediaLibraryCategory[]>;
  listItems(categoryId?: string): Promise<MediaLibraryItem[]>;
  createCategory(name: string): Promise<MediaLibraryCategory>;
  renameCategory(id: string, name: string): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  addFiles(files: File[], categoryId: string): Promise<MediaLibraryItem[]>;
  renameItem(id: string, name: string): Promise<void>;
  moveItem(id: string, categoryId: string): Promise<void>;
  deleteItem(id: string): Promise<void>;
  getItemSrc(id: string): Promise<string>;
}

export interface LiveMediaTrack {
  shapeId: string;
  /** Host `currentTime` in seconds. */
  time: number;
  paused: boolean;
  rate: number;
  /** Host `Date.now()` when sampled. */
  ts: number;
}

export function emptyMediaLibraryIndex(): MediaLibraryIndex {
  return {
    v: 1,
    categories: [
      { id: MEDIA_LIBRARY_DEFAULT_CATEGORY_ID, name: "Uncategorized", order: 0 },
    ],
    items: [],
  };
}

export function kindFromMime(mime: string): MediaLibraryKind | null {
  const m = (mime || "").split(";")[0]!.trim().toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return null;
}

export function isAllowedLibraryMime(mime: string): boolean {
  return kindFromMime(mime) !== null;
}

export function sanitizeLibraryName(raw: string, fallback = "Untitled"): string {
  const name = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 160);
  return name || fallback;
}

export function newLibraryId(prefix: "cat" | "lib"): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function assertLibraryId(id: string): void {
  if (!MEDIA_LIBRARY_ID_RE.test(id)) throw new Error("INVALID_LIBRARY_ID");
}

export function normalizeMediaLibraryIndex(raw: unknown): MediaLibraryIndex {
  const empty = emptyMediaLibraryIndex();
  if (!raw || typeof raw !== "object") return empty;
  const rec = raw as Partial<MediaLibraryIndex>;
  const categories: MediaLibraryCategory[] = [];
  const seenCat = new Set<string>();
  if (Array.isArray(rec.categories)) {
    for (const row of rec.categories) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id ?? "");
      if (!MEDIA_LIBRARY_ID_RE.test(id) || seenCat.has(id)) continue;
      seenCat.add(id);
      categories.push({
        id,
        name: sanitizeLibraryName(String(row.name ?? ""), "Untitled"),
        order: Number.isFinite(row.order) ? Number(row.order) : categories.length,
      });
    }
  }
  if (!categories.some((c) => c.id === MEDIA_LIBRARY_DEFAULT_CATEGORY_ID)) {
    categories.unshift(empty.categories[0]!);
  }
  categories.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const items: MediaLibraryItem[] = [];
  const seenItem = new Set<string>();
  if (Array.isArray(rec.items)) {
    for (const row of rec.items) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id ?? "");
      const hash = String(row.hash ?? "").toLowerCase();
      const kind = row.kind === "image" || row.kind === "video" || row.kind === "audio" ? row.kind : null;
      if (!MEDIA_LIBRARY_ID_RE.test(id) || seenItem.has(id) || !kind) continue;
      if (!/^[a-f0-9]{64}$/.test(hash)) continue;
      seenItem.add(id);
      const categoryId = seenCat.has(String(row.categoryId ?? ""))
        ? String(row.categoryId)
        : MEDIA_LIBRARY_DEFAULT_CATEGORY_ID;
      items.push({
        id,
        categoryId,
        kind,
        name: sanitizeLibraryName(String(row.name ?? ""), "Untitled"),
        mime: String(row.mime ?? "application/octet-stream").slice(0, 120),
        hash,
        bytes: Math.max(0, Math.floor(Number(row.bytes) || 0)),
        width: Number.isFinite(row.width) ? Number(row.width) : undefined,
        height: Number.isFinite(row.height) ? Number(row.height) : undefined,
        duration: Number.isFinite(row.duration) ? Number(row.duration) : undefined,
        createdAt: Math.max(0, Math.floor(Number(row.createdAt) || Date.now())),
        updatedAt: Math.max(0, Math.floor(Number(row.updatedAt) || Date.now())),
      });
    }
  }
  return { v: 1, categories, items };
}
