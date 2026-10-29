export type PipSizePreset = "s" | "m" | "l";
export type PipCorner = "br" | "bl" | "tr" | "tl";
export declare const PIP_CORNER_CYCLE: PipCorner[];
export declare function cyclePipSize(current: PipSizePreset): PipSizePreset;
export declare function cyclePipCorner(current: PipCorner): PipCorner;
export declare const PIP_WIDTH_PX: Record<PipSizePreset, number>;
export declare const DEFAULT_PIP_PREFERENCES: Required<Pick<PipPreferences, "size" | "corner" | "mirror" | "cameraVisible" | "micMuted">>;
export interface PipPreferences {
    x?: number;
    y?: number;
    size?: PipSizePreset;
    corner?: PipCorner;
    mirror?: boolean;
    cameraVisible?: boolean;
    micMuted?: boolean;
}
export declare function loadPipPreferences(): PipPreferences;
export declare function savePipPreferences(prefs: PipPreferences): void;
export declare function resetPipPreferences(): void;
export interface RecordShowOverlayHandle {
    destroy(): void;
    /** Live camera stream when enabled (for optional compositing). */
    getCameraStream(): MediaStream | null;
    isCameraVisible(): boolean;
}
export interface RecordShowOverlayOptions {
    audioStream?: MediaStream | null;
    /**
     * 已经打开的摄像头。传入后不再另开一路，隐藏只收起预览，不关掉正在录的画面。
     * 传 null 且 openCamera 为 false 时不打开摄像头。
     */
    cameraStream?: MediaStream | null;
    /** 缺省：没有 cameraStream 时自己打开摄像头。false 则这场没有预览。 */
    openCamera?: boolean;
    /** Allow dragging the camera PIP panel (default true). */
    draggable?: boolean;
    /** Mirror front-facing camera (default true). */
    mirrorCamera?: boolean;
    /** 结束这场录制放映。按钮和 Esc 都走这里。 */
    onStop?: () => void;
}
/** Default fixed overlay position for a PIP corner (slide-show overlay). */
export declare function defaultPipOverlayPosition(corner: PipCorner, panelW: number, panelH: number, pad?: number, viewportW?: number, viewportH?: number): {
    x: number;
    y: number;
};
/** Clamp overlay position inside the viewport with padding. */
export declare function clampOverlayPosition(x: number, y: number, w: number, h: number, pad?: number): {
    x: number;
    y: number;
};
/**
 * Floating camera PIP + microphone level during Record Slide Show / narration capture.
 */
export declare function mountRecordShowOverlay(doc: Document, opts?: RecordShowOverlayOptions): Promise<RecordShowOverlayHandle>;
