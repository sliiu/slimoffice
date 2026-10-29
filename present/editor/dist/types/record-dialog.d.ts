export type RecordMode = "screen" | "camera" | "screen-camera" | "audio";
export declare function loadRecordMode(): RecordMode;
export declare function saveRecordMode(mode: RecordMode): void;
export interface RecordResult {
    kind: "video" | "audio";
    dataUrl: string;
    duration?: number;
    w?: number;
    h?: number;
    /** 第一帧。编辑画布没有播放控件时靠它显示画面。 */
    poster?: string;
}
export declare function pickRecordMime(kind: "video" | "audio"): string;
export declare function openRecordDialog(doc: Document, opts?: {
    initialMode?: RecordMode;
}): Promise<RecordResult | null>;
export declare function isRecordSupported(): boolean;
