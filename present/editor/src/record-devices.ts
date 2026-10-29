// 录制媒体选哪一只麦克风、哪一只摄像头，以及前后翻转。
// 前后翻转是换前置 / 后置，不是左右镜像。仅摄像头插入的画面不镜像。
// 屏幕加摄像头的画中画沿用已保存的镜像，后置摄像头不再镜像。

export type CameraFacing = "user" | "environment";

export function modeUsesCamera(mode: string): boolean {
  return mode === "camera" || mode === "screen-camera";
}

/** 仅屏幕、仅音频在开始前不留画面。录上屏幕之后才显示那段屏幕。 */
export function recordPreviewVisible(input: { mode: string; recording: boolean; hasTake: boolean }): boolean {
  if (input.mode === "audio") return false;
  if (input.recording || input.hasTake) return true;
  return modeUsesCamera(input.mode);
}

export function modeUsesMic(mode: string): boolean {
  return mode === "audio" || mode === "camera" || mode === "screen-camera";
}

/** 还有画面可录时，麦克风可以关掉。仅音频没有别的来源，不能关。 */
export function micCanBeDisabled(mode: string): boolean {
  return mode === "camera" || mode === "screen-camera";
}

/** 点了「翻转」或还没指定某一只时，用前置 / 后置；否则用列表里选中的那一只。 */
export function recordVideoConstraints(input: {
  deviceId: string;
  facing: CameraFacing;
  useFacing: boolean;
}): MediaTrackConstraints {
  if (input.useFacing || !input.deviceId) return { facingMode: input.facing };
  return { deviceId: { exact: input.deviceId } };
}

/** 强制换到另一面。做不到时浏览器会拒绝，而不是悄悄交回原来那一只。 */
export function exactFacingConstraints(facing: CameraFacing): MediaTrackConstraints {
  return { facingMode: { exact: facing } };
}

export function oppositeFacing(facing: CameraFacing): CameraFacing {
  return facing === "user" ? "environment" : "user";
}

/** 有另一只摄像头，或当前镜头同时支持前置和后置时，才显示翻转。 */
export function cameraCanFlip(input: { cameraIds: readonly string[]; facingModes?: readonly string[] }): boolean {
  if (input.cameraIds.filter((id) => id).length >= 2) return true;
  const modes = input.facingModes ?? [];
  return modes.includes("user") && modes.includes("environment");
}

/** 列表里还有另一只时，翻转到下一只。只有一只时返回 null。 */
export function otherCameraId(ids: readonly string[], currentId: string): string | null {
  const list = ids.filter((id) => id);
  if (list.length < 2) return null;
  const idx = list.indexOf(currentId);
  return list[(idx < 0 ? 0 : idx + 1) % list.length] ?? null;
}

export function recordAudioConstraints(deviceId: string, enabled = true): false | true | MediaTrackConstraints {
  if (!enabled) return false;
  if (!deviceId) return true;
  return { deviceId: { exact: deviceId } };
}

/**
 * 仅摄像头：预览和插入的画面一致，不左右镜像。
 * 屏幕加摄像头：前置（或浏览器没报告朝向）沿用画中画镜像；后置不镜像。
 */
export function recordPreviewMirrored(input: {
  mode: string;
  facing: CameraFacing | undefined;
  pipMirror: boolean;
}): boolean {
  if (input.mode !== "screen-camera") return false;
  if (input.facing === "environment") return false;
  return input.pipMirror;
}
