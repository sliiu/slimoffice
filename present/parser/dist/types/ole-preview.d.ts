/** OLE embedding preview extraction — images and PDF from ppt/embeddings. */
export type OlePreviewKind = "image" | "pdf";
export interface OlePreviewPayload {
    kind: OlePreviewKind;
    mime: string;
    bytes: Uint8Array;
}
/** Parse `\x01Ole10Native` stream payload → embedded file bytes. */
export declare function parseOle10NativeStream(stream: Uint8Array): Uint8Array | null;
/** Minimal MS-CFB reader — enough to pull `\x01Ole10Native` from oleObject.bin. */
export declare function readCfbStream(bytes: Uint8Array, streamName: string): Uint8Array | null;
/**
 * Extract previewable image/PDF bytes from an OLE embedding part.
 * Handles raw files, OLE compound containers, and Ole10Native streams.
 */
export declare function extractOlePreviewPayload(bytes: Uint8Array, fileName?: string, progId?: string): OlePreviewPayload | null;
