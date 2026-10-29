export interface LectureDeviceChoice {
    audioDeviceId: string;
    /** null：这场不打开摄像头，没有出镜。 */
    videoDeviceId: string | null;
}
type CapturePermission = PermissionState | "unknown";
/** 已经能读到名字、或权限已是允许/拒绝时，不再为了列设备而打开那一路。 */
export declare function captureProbeNeeded(devices: Pick<MediaDeviceInfo, "kind" | "label">[], perm: {
    microphone?: CapturePermission;
    camera?: CapturePermission;
}): {
    mic: boolean;
    camera: boolean;
};
/** 列出麦克风和摄像头。某一路传 false 时不为了名单去打开它。 */
export declare function listCaptureDevices(ask?: {
    mic?: boolean;
    camera?: boolean;
}): Promise<{
    mics: MediaDeviceInfo[];
    cameras: MediaDeviceInfo[];
    cameraOk: boolean;
}>;
export declare function openLectureDeviceDialog(doc: Document): Promise<LectureDeviceChoice | null>;
export interface LectureSaveNotice {
    /** 保存结束。等用户点「知道了」。 */
    saved(result: {
        slides: number;
        withCamera: boolean;
    } | null): Promise<void>;
    failed(message: string): Promise<void>;
}
/**
 * 一停止就出现，盖在随后打开的编辑器上。保存完成后再换成结果。
 * 结束录制的那下 Esc 松开之前，不会把这层关掉。
 */
export declare function openLectureSaveNotice(doc: Document): LectureSaveNotice;
export {};
