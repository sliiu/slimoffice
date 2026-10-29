/** User media library (images / audio / video) shared across decks. */
export type MediaLibraryKind = "image" | "video" | "audio";
export declare const MEDIA_LIBRARY_DEFAULT_CATEGORY_ID = "cat_default";
export declare const MEDIA_LIBRARY_MAX_ITEM_BYTES: number;
export declare const MEDIA_LIBRARY_ID_RE: RegExp;
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
export declare function emptyMediaLibraryIndex(): MediaLibraryIndex;
export declare function kindFromMime(mime: string): MediaLibraryKind | null;
export declare function isAllowedLibraryMime(mime: string): boolean;
export declare function sanitizeLibraryName(raw: string, fallback?: string): string;
export declare function newLibraryId(prefix: "cat" | "lib"): string;
export declare function assertLibraryId(id: string): void;
export declare function normalizeMediaLibraryIndex(raw: unknown): MediaLibraryIndex;
