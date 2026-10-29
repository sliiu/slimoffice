export declare function extensionForRecordingMime(mime: string, kind: "video" | "audio"): string;
export declare function isMp4RecordingMime(mime: string): boolean;
export declare function isAudioRecordingBlob(blob: Blob): boolean;
/** Warn before inserting very large recordings onto a slide (bytes). */
export declare const RECORDING_LARGE_BYTES: number;
export declare function formatRecordingFileSize(bytes: number): string;
export declare function formatRecordingDuration(seconds: number | undefined): string;
export declare function suggestedRecordingFilename(prefix: string, ext: string): string;
/** WebM / Ogg audio → AAC M4A when possible. */
export declare function ensureMp4AudioBlob(blob: Blob): Promise<{
    blob: Blob;
    ext: string;
}>;
/** Normalize any MediaRecorder blob to MP4/M4A in the browser when possible. */
export declare function ensureExportRecordingBlob(blob: Blob): Promise<{
    blob: Blob;
    ext: string;
}>;
/** WebM → H.264 MP4 when needed; returns native MP4 unchanged. */
export declare function ensureMp4VideoBlob(blob: Blob): Promise<{
    blob: Blob;
    ext: string;
}>;
export declare function downloadBlob(doc: Document, blob: Blob, filename: string): void;
