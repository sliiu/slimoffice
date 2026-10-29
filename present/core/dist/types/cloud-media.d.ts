import type { Presentation } from "./slide.js";
/** Version-scoped media reference stored in Presentation src/poster. */
export declare const PPT_MEDIA_PREFIX = "ppt-media://";
export declare function isPptMediaSrc(src: string): boolean;
export declare function pptMediaPath(versionId: string, hash: string): string;
export declare const MEDIA_HASH_RE: RegExp;
export declare const PPT_MEDIA_PATH_RE: RegExp;
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
export declare function newCloudVersionId(): string;
export declare function sha256Hex(data: Uint8Array): Promise<string>;
export declare function dataUrlToBytes(src: string): Promise<{
    mime: string;
    bytes: Uint8Array;
} | null>;
export declare function bytesToDataUrl(mime: string, bytes: Uint8Array): string;
/**
 * Replace inline `data:` media with version-scoped `ppt-media://{versionId}/{hash}` paths.
 * Identical bytes share one hash (and one blob); each version still gets its own path.
 */
export declare function packPresentationMedia(pres: Presentation, versionId: string): Promise<{
    pres: Presentation;
    media: PackedMediaBlob[];
}>;
export declare function unpackPresentationMedia(pres: Presentation, media: PackedMediaRef[], loadBytes: (hash: string) => Promise<Uint8Array>): Promise<Presentation>;
