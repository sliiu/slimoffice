export type CameraFacing = "user" | "environment";
export declare function modeUsesCamera(mode: string): boolean;
/** 仅屏幕、仅音频在开始前不留画面。录上屏幕之后才显示那段屏幕。 */
export declare function recordPreviewVisible(input: {
    mode: string;
    recording: boolean;
    hasTake: boolean;
}): boolean;
export declare function modeUsesMic(mode: string): boolean;
/** 还有画面可录时，麦克风可以关掉。仅音频没有别的来源，不能关。 */
export declare function micCanBeDisabled(mode: string): boolean;
/** 点了「翻转」或还没指定某一只时，用前置 / 后置；否则用列表里选中的那一只。 */
export declare function recordVideoConstraints(input: {
    deviceId: string;
    facing: CameraFacing;
    useFacing: boolean;
}): MediaTrackConstraints;
/** 强制换到另一面。做不到时浏览器会拒绝，而不是悄悄交回原来那一只。 */
export declare function exactFacingConstraints(facing: CameraFacing): MediaTrackConstraints;
export declare function oppositeFacing(facing: CameraFacing): CameraFacing;
/** 有另一只摄像头，或当前镜头同时支持前置和后置时，才显示翻转。 */
export declare function cameraCanFlip(input: {
    cameraIds: readonly string[];
    facingModes?: readonly string[];
}): boolean;
/** 列表里还有另一只时，翻转到下一只。只有一只时返回 null。 */
export declare function otherCameraId(ids: readonly string[], currentId: string): string | null;
export declare function recordAudioConstraints(deviceId: string, enabled?: boolean): false | true | MediaTrackConstraints;
/**
 * 仅摄像头：预览和插入的画面一致，不左右镜像。
 * 屏幕加摄像头：前置（或浏览器没报告朝向）沿用画中画镜像；后置不镜像。
 */
export declare function recordPreviewMirrored(input: {
    mode: string;
    facing: CameraFacing | undefined;
    pipMirror: boolean;
}): boolean;
