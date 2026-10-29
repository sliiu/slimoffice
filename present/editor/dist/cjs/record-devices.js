"use strict";
// 录制媒体选哪一只麦克风、哪一只摄像头，以及前后翻转。
// 前后翻转是换前置 / 后置，不是左右镜像。仅摄像头插入的画面不镜像。
// 屏幕加摄像头的画中画沿用已保存的镜像，后置摄像头不再镜像。
Object.defineProperty(exports, "__esModule", { value: true });
exports.modeUsesCamera = modeUsesCamera;
exports.recordPreviewVisible = recordPreviewVisible;
exports.modeUsesMic = modeUsesMic;
exports.micCanBeDisabled = micCanBeDisabled;
exports.recordVideoConstraints = recordVideoConstraints;
exports.exactFacingConstraints = exactFacingConstraints;
exports.oppositeFacing = oppositeFacing;
exports.cameraCanFlip = cameraCanFlip;
exports.otherCameraId = otherCameraId;
exports.recordAudioConstraints = recordAudioConstraints;
exports.recordPreviewMirrored = recordPreviewMirrored;
function modeUsesCamera(mode) {
    return mode === "camera" || mode === "screen-camera";
}
/** 仅屏幕、仅音频在开始前不留画面。录上屏幕之后才显示那段屏幕。 */
function recordPreviewVisible(input) {
    if (input.mode === "audio")
        return false;
    if (input.recording || input.hasTake)
        return true;
    return modeUsesCamera(input.mode);
}
function modeUsesMic(mode) {
    return mode === "audio" || mode === "camera" || mode === "screen-camera";
}
/** 还有画面可录时，麦克风可以关掉。仅音频没有别的来源，不能关。 */
function micCanBeDisabled(mode) {
    return mode === "camera" || mode === "screen-camera";
}
/** 点了「翻转」或还没指定某一只时，用前置 / 后置；否则用列表里选中的那一只。 */
function recordVideoConstraints(input) {
    if (input.useFacing || !input.deviceId)
        return { facingMode: input.facing };
    return { deviceId: { exact: input.deviceId } };
}
/** 强制换到另一面。做不到时浏览器会拒绝，而不是悄悄交回原来那一只。 */
function exactFacingConstraints(facing) {
    return { facingMode: { exact: facing } };
}
function oppositeFacing(facing) {
    return facing === "user" ? "environment" : "user";
}
/** 有另一只摄像头，或当前镜头同时支持前置和后置时，才显示翻转。 */
function cameraCanFlip(input) {
    if (input.cameraIds.filter((id) => id).length >= 2)
        return true;
    const modes = input.facingModes ?? [];
    return modes.includes("user") && modes.includes("environment");
}
/** 列表里还有另一只时，翻转到下一只。只有一只时返回 null。 */
function otherCameraId(ids, currentId) {
    const list = ids.filter((id) => id);
    if (list.length < 2)
        return null;
    const idx = list.indexOf(currentId);
    return list[(idx < 0 ? 0 : idx + 1) % list.length] ?? null;
}
function recordAudioConstraints(deviceId, enabled = true) {
    if (!enabled)
        return false;
    if (!deviceId)
        return true;
    return { deviceId: { exact: deviceId } };
}
/**
 * 仅摄像头：预览和插入的画面一致，不左右镜像。
 * 屏幕加摄像头：前置（或浏览器没报告朝向）沿用画中画镜像；后置不镜像。
 */
function recordPreviewMirrored(input) {
    if (input.mode !== "screen-camera")
        return false;
    if (input.facing === "environment")
        return false;
    return input.pipMirror;
}
