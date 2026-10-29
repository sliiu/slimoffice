import { bindEditorModal } from "./dialog";
import { t, type MessageKey } from "./i18n";
import { listCaptureDevices } from "./lecture-devices";
import { computePipDrawRect } from "./record-composite";
import {
  cameraCanFlip,
  exactFacingConstraints,
  modeUsesCamera,
  micCanBeDisabled,
  modeUsesMic,
  recordPreviewVisible,
  oppositeFacing,
  otherCameraId,
  recordAudioConstraints,
  recordPreviewMirrored,
  recordVideoConstraints,
  type CameraFacing,
} from "./record-devices";
import { loadPipPreferences } from "./record-show-overlay";
import {
  exportPipCornerCoverageBreakdownText,
  exportPipCoverageSpreadText,
  exportRecordModeReadinessText,
  exportRecordReadinessText,
  exportRecordingCompactText,
  exportRecordingSummaryText,
  exportRecordSettingsCompactText,
  exportRecordSettingsText,
  exportRecordWorkspaceCompactText,
  exportRecordWorkspaceSummaryText,
  formatPipCornerCoverageBreakdownLine,
  formatPipCoverageSpreadLine,
  formatRecordModePipLine,
  formatRecordReadinessLine,
  formatRecordWorkspaceStatsLine,
  recordModeSupportsPip,
} from "./record-meta";
import { copyTextToClipboard } from "./insert-meta";
import { DIALOG_INPUT_CSS, DIALOG_OVERLAY_CSS, createDevOnlyActionSelect } from "./ui-style";
import {
  downloadBlob,
  ensureExportRecordingBlob,
  formatRecordingDuration,
  formatRecordingFileSize,
  RECORDING_LARGE_BYTES,
} from "./video-export";

export type RecordMode = "screen" | "camera" | "screen-camera" | "audio";

const RECORD_MODE_STORAGE_KEY = "pp.record.mode";

export function loadRecordMode(): RecordMode {
  if (typeof localStorage === "undefined") return "screen";
  const raw = localStorage.getItem(RECORD_MODE_STORAGE_KEY);
  if (raw === "screen" || raw === "camera" || raw === "screen-camera" || raw === "audio") return raw;
  return "screen";
}

export function saveRecordMode(mode: RecordMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(RECORD_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore quota
  }
}

export interface RecordResult {
  kind: "video" | "audio";
  dataUrl: string;
  duration?: number;
  w?: number;
  h?: number;
  /** 第一帧。编辑画布没有播放控件时靠它显示画面。 */
  poster?: string;
}

/** Preferred MediaRecorder mime for tests and UI. */
const VIDEO_RECORD_MIMES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

const AUDIO_RECORD_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

export function pickRecordMime(kind: "video" | "audio"): string {
  for (const m of kind === "video" ? VIDEO_RECORD_MIMES : AUDIO_RECORD_MIMES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return kind === "video" ? "video/webm" : "audio/webm";
}

function recorderMimeCandidates(kind: "video" | "audio"): string[] {
  const list = kind === "video" ? VIDEO_RECORD_MIMES : AUDIO_RECORD_MIMES;
  const supported =
    typeof MediaRecorder !== "undefined"
      ? list.filter((m) => {
          try {
            return MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        })
      : [];
  return [...supported, ""];
}

function isRetryableCaptureError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return (
    name === "NotSupportedError" ||
    name === "OverconstrainedError" ||
    name === "NotFoundError" ||
    name === "TypeError"
  );
}

function hasDisplayCapture(): boolean {
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

function hasUserMedia(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function";
}

function hasCanvasCapture(doc: Document): boolean {
  return typeof doc.createElement("canvas").captureStream === "function";
}

function modeUnsupportedReason(mode: RecordMode, doc: Document): MessageKey | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) return "record.error.env";
  if (typeof isSecureContext === "boolean" && !isSecureContext) return "record.error.insecure";
  if ((mode === "audio" || mode === "camera") && !hasUserMedia()) return "record.error.env";
  if (mode === "screen" || mode === "screen-camera") {
    if (!hasDisplayCapture()) return "record.error.envScreen";
    if (mode === "screen-camera" && (!hasUserMedia() || !hasCanvasCapture(doc))) return "record.error.env";
  }
  return null;
}

function mediaErrorMessage(e: unknown, mode?: RecordMode): string {
  const err = e as { name?: string; message?: string; recordKey?: MessageKey } | null;
  if (err?.recordKey) return t(err.recordKey);
  const name = err?.name ?? "";
  const message = err?.message ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return t("record.error.permission");
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return t("record.error.notFound");
  if (name === "AbortError") return t("record.error.cancelled");
  if (name === "NotReadableError" || name === "TrackStartError") return t("record.error.busy");
  if (name === "SecurityError") return t("record.error.insecure");
  if (name === "NotSupportedError" || name === "TypeError" || /not supported/i.test(message)) {
    if (mode === "screen" || mode === "screen-camera") return t("record.error.envScreen");
    return t("record.error.env");
  }
  return message || t("record.error.unknown");
}

function unsupportedError(key: MessageKey = "record.error.env"): Error {
  const err = new Error(t(key)) as Error & { recordKey: MessageKey };
  err.name = "NotSupportedError";
  err.recordKey = key;
  return err;
}

async function getDisplayStream(): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md?.getDisplayMedia) throw unsupportedError("record.error.envScreen");
  try {
    return await md.getDisplayMedia({ video: true, audio: true });
  } catch (e) {
    if (!isRetryableCaptureError(e)) throw e;
    try {
      return await md.getDisplayMedia({ video: true, audio: false });
    } catch (e2) {
      if (isRetryableCaptureError(e2)) throw unsupportedError("record.error.envScreen");
      throw e2;
    }
  }
}

async function getUserMediaTries(tries: MediaStreamConstraints[]): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) throw unsupportedError("record.error.env");
  let last: unknown;
  const seen = new Set<string>();
  for (const c of tries) {
    const key = JSON.stringify(c);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return await md.getUserMedia(c);
    } catch (e) {
      last = e;
      if (!isRetryableCaptureError(e)) throw e;
    }
  }
  throw last ?? unsupportedError("record.error.env");
}

async function getCameraStream(
  video: MediaTrackConstraints,
  audio: true | false | MediaTrackConstraints,
  opts?: { fallback?: boolean },
): Promise<MediaStream> {
  const tries: MediaStreamConstraints[] = [];
  if (audio !== false) {
    tries.push({ video, audio });
    if (opts?.fallback !== false && audio !== true) tries.push({ video, audio: true });
  }
  tries.push({ video, audio: false });
  if (opts?.fallback !== false) tries.push({ video: true, audio: audio === false ? false : true });
  return getUserMediaTries(tries);
}

function startRecorder(
  stream: MediaStream,
  kind: "video" | "audio",
  onData: (e: BlobEvent) => void,
): { recorder: MediaRecorder; mime: string } {
  const variants: MediaStream[] = [stream];
  if (kind === "video" && stream.getAudioTracks().length > 0) {
    variants.push(new MediaStream(stream.getVideoTracks()));
  }
  let last: unknown;
  for (const candidate of variants) {
    for (const mime of recorderMimeCandidates(kind)) {
      try {
        const recorder = mime ? new MediaRecorder(candidate, { mimeType: mime }) : new MediaRecorder(candidate);
        recorder.ondataavailable = onData;
        recorder.start(1000);
        return { recorder, mime: mime || recorder.mimeType || pickRecordMime(kind) };
      } catch (e) {
        last = e;
      }
    }
  }
  throw last ?? unsupportedError("record.error.notSupported");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  // MediaRecorder 的 type 是 `video/webm;codecs=vp9,opus`。data URL 的媒体类型
  // 里不能出现逗号，否则浏览器把 codecs 后半段当成正文，视频报 SRC_NOT_SUPPORTED。
  const base = (blob.type.split(";")[0] || "").trim();
  const clean = base ? new Blob([blob], { type: base }) : blob;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(clean);
  });
}

function capturePoster(video: HTMLVideoElement): string | undefined {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return undefined;
  const canvas = video.ownerDocument.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  try {
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return undefined;
  }
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((tr) => tr.stop());
}

async function loadVideoMeta(
  doc: Document,
  src: string,
): Promise<{ duration?: number; w?: number; h?: number }> {
  return new Promise((resolve) => {
    const v = doc.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      const duration = v.duration;
      resolve({
        duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
        w: v.videoWidth,
        h: v.videoHeight,
      });
    };
    v.onerror = () => resolve({});
    v.src = src;
  });
}

async function loadAudioMeta(doc: Document, src: string): Promise<{ duration?: number }> {
  return new Promise((resolve) => {
    const a = doc.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      const duration = a.duration;
      resolve({ duration: Number.isFinite(duration) && duration > 0 ? duration : undefined });
    };
    a.onerror = () => resolve({});
    a.src = src;
  });
}

async function compositeScreenCamera(
  doc: Document,
  display: MediaStream,
  camera: MediaStream,
  mirror: boolean,
): Promise<MediaStream> {
  const displayVideo = doc.createElement("video");
  displayVideo.srcObject = display;
  displayVideo.muted = true;
  displayVideo.playsInline = true;
  const camVideo = doc.createElement("video");
  camVideo.srcObject = camera;
  camVideo.muted = true;
  camVideo.playsInline = true;
  await Promise.all([
    displayVideo.play().catch(() => undefined),
    camVideo.play().catch(() => undefined),
  ]);
  await new Promise<void>((r) => {
    if (displayVideo.readyState >= 2) r();
    else displayVideo.onloadeddata = () => r();
  });

  const track = display.getVideoTracks()[0];
  const settings = track?.getSettings();
  const canvas = doc.createElement("canvas");
  canvas.width = settings?.width ?? 1280;
  canvas.height = settings?.height ?? 720;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") throw unsupportedError("record.error.canvas");

  const pipPrefs = loadPipPreferences();
  const pip = computePipDrawRect(canvas.width, canvas.height, pipPrefs);

  let raf = 0;
  const draw = (): void => {
    ctx.drawImage(displayVideo, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(pip.x - 4, pip.y - 4, pip.w + 8, pip.h + 8);
    if (mirror) {
      ctx.save();
      ctx.translate(pip.x + pip.w, pip.y);
      ctx.scale(-1, 1);
      ctx.drawImage(camVideo, 0, 0, pip.w, pip.h);
      ctx.restore();
    } else {
      ctx.drawImage(camVideo, pip.x, pip.y, pip.w, pip.h);
    }
    raf = requestAnimationFrame(draw);
  };
  draw();

  const out = canvas.captureStream(30);
  const audioTracks = [...display.getAudioTracks(), ...camera.getAudioTracks()];
  for (const a of audioTracks) {
    try {
      out.addTrack(a);
    } catch {
      // ignore
    }
  }
  (out as MediaStream & { _inkRaf?: number })._inkRaf = raf;
  return out;
}

function stopCompositeRaf(stream: MediaStream | null): void {
  const raf = (stream as MediaStream & { _inkRaf?: number } | null)?._inkRaf;
  if (raf) cancelAnimationFrame(raf);
}

function chosenVideo(deviceId: string, facing: CameraFacing, useFacing: boolean): MediaTrackConstraints {
  return recordVideoConstraints({ deviceId, facing, useFacing });
}

function streamFacing(stream: MediaStream): CameraFacing | undefined {
  const reported = stream.getVideoTracks()[0]?.getSettings().facingMode;
  return reported === "user" || reported === "environment" ? reported : undefined;
}

async function acquireStream(
  doc: Document,
  mode: RecordMode,
  devices: {
    audioDeviceId: string;
    micEnabled: boolean;
    videoDeviceId: string;
    facing: CameraFacing;
    useFacing: boolean;
  },
): Promise<{ stream: MediaStream; release: () => void }> {
  const audio = recordAudioConstraints(devices.audioDeviceId, devices.micEnabled);
  if (mode === "audio") {
    const stream = await getUserMediaTries([{ audio }, { audio: true }]);
    return { stream, release: () => stopTracks(stream) };
  }
  if (mode === "camera") {
    const stream = await getCameraStream(
      chosenVideo(devices.videoDeviceId, devices.facing, devices.useFacing),
      audio,
      { fallback: !devices.useFacing },
    );
    return { stream, release: () => stopTracks(stream) };
  }
  if (mode === "screen") {
    const stream = await getDisplayStream();
    return { stream, release: () => stopTracks(stream) };
  }
  const display = await getDisplayStream();
  const camera = await getCameraStream(
    chosenVideo(devices.videoDeviceId, devices.facing, devices.useFacing),
    audio,
    { fallback: !devices.useFacing },
  );
  const mirror = recordPreviewMirrored({
    mode,
    facing: streamFacing(camera) ?? devices.facing,
    pipMirror: loadPipPreferences().mirror !== false,
  });
  const out = await compositeScreenCamera(doc, display, camera, mirror);
  return {
    stream: out,
    release: () => {
      stopCompositeRaf(out);
      stopTracks(out);
      stopTracks(display);
      stopTracks(camera);
    },
  };
}

export function openRecordDialog(
  doc: Document,
  opts?: { initialMode?: RecordMode },
): Promise<RecordResult | null> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    let modalDismiss: { release: () => void } | undefined;
    const finish = (value: RecordResult | null): void => {
      if (settled) return;
      settled = true;
      modalDismiss?.release();
      cleanup();
      overlay.remove();
      resolve(value);
    };

    let mode: RecordMode = opts?.initialMode ?? loadRecordMode();
    let liveStream: MediaStream | null = null;
    let releaseStream: (() => void) | null = null;
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let recordBlob: Blob | null = null;
    let recordUrl: string | null = null;
    let recordMime: string | null = null;
    let recordDurationSec: number | undefined;
    let recordWidth: number | undefined;
    let recordHeight: number | undefined;
    let timerId: ReturnType<typeof setInterval> | undefined;
    let startedAt = 0;
    let facing: CameraFacing = "user";
    let useFacing = true;
    let arming = false;
    let fillingDevices = false;
    let micsLoaded = false;
    let camsLoaded = false;
    let livePreview: MediaStream | null = null;
    let previewGen = 0;

    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
      DIALOG_OVERLAY_CSS;

    const modal = doc.createElement("div");
    modal.style.cssText =
      "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(520px,92vw);max-height:85vh;display:flex;flex-direction:column;gap:10px";

    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = t("record.title");
    modal.appendChild(title);

    const modeRow = doc.createElement("div");
    modeRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
    const modes: Array<{ id: RecordMode; label: string }> = [
      { id: "screen", label: t("record.mode.screen") },
      { id: "camera", label: t("record.mode.camera") },
      { id: "screen-camera", label: t("record.mode.screenCamera") },
      { id: "audio", label: t("record.mode.audio") },
    ];
    const modeBtns = new Map<RecordMode, HTMLButtonElement>();
    for (const m of modes) {
      const b = doc.createElement("button");
      b.type = "button";
      b.textContent = m.label;
      b.style.cssText =
        "background:transparent;border:1px solid var(--border);border-radius:4px;padding:4px 10px;cursor:pointer;font:inherit;font-size:12px";
      b.addEventListener("click", () => setMode(m.id));
      modeRow.appendChild(b);
      modeBtns.set(m.id, b);
    }
    modal.appendChild(modeRow);

    const preview = doc.createElement("video");
    preview.style.cssText = "width:100%;max-height:240px;background:#000;border-radius:6px";
    preview.controls = true;
    preview.playsInline = true;
    modal.appendChild(preview);

    const deviceStack = doc.createElement("div");
    deviceStack.style.cssText = "display:flex;flex-direction:column;gap:12px";
    const camBlock = doc.createElement("div");
    camBlock.style.cssText = "display:flex;flex-direction:column;gap:4px";
    const camLabel = doc.createElement("label");
    camLabel.style.cssText = "color:var(--muted-foreground)";
    camLabel.textContent = t("record.devices.camera");
    const camLine = doc.createElement("div");
    camLine.style.cssText = "display:flex;align-items:center;gap:8px";
    const camSel = doc.createElement("select");
    camSel.style.cssText = "flex:1;min-width:0;box-sizing:border-box;" + DIALOG_INPUT_CSS;
    const flipBtn = doc.createElement("button");
    flipBtn.type = "button";
    flipBtn.hidden = true;
    flipBtn.textContent = t("record.devices.front");
    flipBtn.title = t("record.devices.flip");
    flipBtn.style.cssText =
      "flex:none;background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    camLine.append(camSel, flipBtn);
    camBlock.append(camLabel, camLine);
    const micBlock = doc.createElement("div");
    micBlock.style.cssText = "display:flex;flex-direction:column;gap:4px";
    const micHead = doc.createElement("label");
    micHead.style.cssText = "display:flex;align-items:center;gap:8px;color:var(--muted-foreground)";
    const micOn = doc.createElement("input");
    micOn.type = "checkbox";
    micOn.checked = true;
    micHead.append(micOn, doc.createTextNode(t("record.devices.mic")));
    const micSel = doc.createElement("select");
    micSel.style.cssText = "width:100%;box-sizing:border-box;" + DIALOG_INPUT_CSS;
    micBlock.append(micHead, micSel);
    deviceStack.append(camBlock, micBlock);
    modal.appendChild(deviceStack);

    const status = doc.createElement("div");
    status.style.cssText = "font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    status.textContent = t("record.hint");
    modal.appendChild(status);

    const readinessLine = doc.createElement("div");
    readinessLine.style.cssText =
      "font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.35;word-break:break-word";
    modal.appendChild(readinessLine);

    const pipDetailLine = doc.createElement("div");
    pipDetailLine.style.cssText =
      "font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.35;word-break:break-word";
    pipDetailLine.hidden = true;
    modal.appendChild(pipDetailLine);

    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";

    const startBtn = doc.createElement("button");
    startBtn.type = "button";
    startBtn.textContent = t("record.start");
    startBtn.style.cssText =
      "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";

    const stopBtn = doc.createElement("button");
    stopBtn.type = "button";
    stopBtn.textContent = t("record.stop");
    stopBtn.hidden = true;
    stopBtn.style.cssText =
      "background:var(--destructive);color:var(--destructive-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";

    const insertBtn = doc.createElement("button");
    insertBtn.type = "button";
    insertBtn.textContent = t("record.insert");
    insertBtn.hidden = true;
    insertBtn.style.cssText =
      "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";

    const cancelBtn = doc.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = t("record.cancel");
    cancelBtn.style.cssText =
      "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";

    const downloadBtn = doc.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = t("record.download");
    downloadBtn.hidden = true;
    downloadBtn.style.cssText =
      "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";

    const copyBtn = doc.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = t("record.copySummary");
    copyBtn.disabled = true;
    copyBtn.style.cssText =
      "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";

    const copySettingsBtn = doc.createElement("button");
    copySettingsBtn.type = "button";
    copySettingsBtn.textContent = t("record.copySettings");
    copySettingsBtn.style.cssText = copyBtn.style.cssText;
    copySettingsBtn.addEventListener("click", () => {
      void copyTextToClipboard(
        exportRecordSettingsText({
          mode,
          pipPrefs: loadPipPreferences(),
          compositeSize: { w: 1280, h: 720 },
        }),
      );
    });

    const copyWorkspaceBtn = doc.createElement("button");
    copyWorkspaceBtn.type = "button";
    copyWorkspaceBtn.textContent = t("record.copyWorkspace");
    copyWorkspaceBtn.style.cssText = copyBtn.style.cssText;
    copyWorkspaceBtn.addEventListener("click", () => {
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      void copyTextToClipboard(
        exportRecordWorkspaceSummaryText({
          mode,
          pipPrefs,
          compositeSize: pipPrefs ? { w: 1280, h: 720 } : undefined,
          recording:
            recordBlob != null
              ? {
                  mode,
                  bytes: recordBlob.size,
                  mime: recordMime ?? recordBlob.type,
                  durationSec: recordDurationSec,
                  width: recordWidth,
                  height: recordHeight,
                  pipPrefs,
                }
              : undefined,
        }),
      );
    });

    const copyCompactSummaryBtn = doc.createElement("button");
    copyCompactSummaryBtn.type = "button";
    copyCompactSummaryBtn.textContent = t("record.copyCompactSummary");
    copyCompactSummaryBtn.disabled = true;
    copyCompactSummaryBtn.style.cssText = copyBtn.style.cssText;

    const copyCompactSettingsBtn = doc.createElement("button");
    copyCompactSettingsBtn.type = "button";
    copyCompactSettingsBtn.textContent = t("record.copyCompactSettings");
    copyCompactSettingsBtn.style.cssText = copyBtn.style.cssText;
    copyCompactSettingsBtn.addEventListener("click", () => {
      void copyTextToClipboard(
        exportRecordSettingsCompactText({
          mode,
          pipPrefs: loadPipPreferences(),
          compositeSize: { w: 1280, h: 720 },
        }),
      );
    });

    const copyCompactWorkspaceBtn = doc.createElement("button");
    copyCompactWorkspaceBtn.type = "button";
    copyCompactWorkspaceBtn.textContent = t("record.copyCompactWorkspace");
    copyCompactWorkspaceBtn.style.cssText = copyBtn.style.cssText;
    copyCompactWorkspaceBtn.addEventListener("click", () => {
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      void copyTextToClipboard(
        exportRecordWorkspaceCompactText({
          mode,
          pipPrefs,
          compositeSize: pipPrefs ? { w: 1280, h: 720 } : undefined,
          recording:
            recordBlob != null
              ? {
                  mode,
                  bytes: recordBlob.size,
                  mime: recordMime ?? recordBlob.type,
                  durationSec: recordDurationSec,
                  width: recordWidth,
                  height: recordHeight,
                  pipPrefs,
                }
              : undefined,
        }),
      );
    });

    const copyReadinessBtn = doc.createElement("button");
    copyReadinessBtn.type = "button";
    copyReadinessBtn.textContent = t("record.copyReadiness");
    copyReadinessBtn.style.cssText = copyBtn.style.cssText;
    copyReadinessBtn.addEventListener("click", () => {
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      void copyTextToClipboard(
        exportRecordReadinessText({
          mode,
          pipPrefs,
          hasRecording: recordBlob != null,
          recordingBytes: recordBlob?.size,
          compositeSize: pipPrefs ? { w: 1280, h: 720 } : undefined,
        }),
      );
    });

    const copyWorkspaceStatsBtn = doc.createElement("button");
    copyWorkspaceStatsBtn.type = "button";
    copyWorkspaceStatsBtn.textContent = t("record.copyWorkspaceStats");
    copyWorkspaceStatsBtn.style.cssText = copyBtn.style.cssText;
    copyWorkspaceStatsBtn.addEventListener("click", () => {
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      void copyTextToClipboard(
        formatRecordWorkspaceStatsLine({
          mode,
          pipPrefs,
          compositeSize: pipPrefs ? { w: 1280, h: 720 } : undefined,
          recording:
            recordBlob != null
              ? {
                  mode,
                  bytes: recordBlob.size,
                  mime: recordMime ?? recordBlob.type,
                  durationSec: recordDurationSec,
                  width: recordWidth,
                  height: recordHeight,
                  pipPrefs,
                }
              : undefined,
        }),
      );
    });

    const copyModeReadinessBtn = doc.createElement("button");
    copyModeReadinessBtn.type = "button";
    copyModeReadinessBtn.textContent = t("record.copyModeReadiness");
    copyModeReadinessBtn.style.cssText = copyBtn.style.cssText;
    copyModeReadinessBtn.addEventListener("click", () => {
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      void copyTextToClipboard(
        exportRecordModeReadinessText({
          mode,
          pipPrefs,
          compositeSize: pipPrefs ? { w: 1280, h: 720 } : undefined,
        }),
      );
    });

    const copyPipSpreadBtn = doc.createElement("button");
    copyPipSpreadBtn.type = "button";
    copyPipSpreadBtn.textContent = t("record.copyPipSpread");
    copyPipSpreadBtn.style.cssText = copyBtn.style.cssText;
    copyPipSpreadBtn.hidden = true;
    copyPipSpreadBtn.addEventListener("click", () => {
      const pipPrefs = loadPipPreferences();
      void copyTextToClipboard(
        exportPipCoverageSpreadText(1280, 720, pipPrefs.corner ?? "br"),
      );
    });

    const copyPipCornerBreakdownBtn = doc.createElement("button");
    copyPipCornerBreakdownBtn.type = "button";
    copyPipCornerBreakdownBtn.textContent = t("record.copyPipCornerBreakdown");
    copyPipCornerBreakdownBtn.style.cssText = copyBtn.style.cssText;
    copyPipCornerBreakdownBtn.hidden = true;
    copyPipCornerBreakdownBtn.addEventListener("click", () => {
      const pipPrefs = loadPipPreferences();
      void copyTextToClipboard(
        exportPipCornerCoverageBreakdownText(1280, 720, pipPrefs.size ?? "m"),
      );
    });

    const syncReadinessLine = (): void => {
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      const compositeSize = pipPrefs ? { w: 1280, h: 720 } : undefined;
      readinessLine.textContent = [
        formatRecordReadinessLine({
          mode,
          pipPrefs,
          hasRecording: recordBlob != null,
          recordingBytes: recordBlob?.size,
          compositeSize,
        }),
        formatRecordModePipLine(mode),
      ].join(" · ");
      const pipMode = recordModeSupportsPip(mode);
      pipDetailLine.hidden = !pipMode;
      copyPipSpreadBtn.hidden = !pipMode;
      copyPipCornerBreakdownBtn.hidden = !pipMode;
      if (pipMode && compositeSize) {
        const corner = pipPrefs?.corner ?? "br";
        const size = pipPrefs?.size ?? "m";
        pipDetailLine.textContent = [
          formatPipCoverageSpreadLine(compositeSize.w, compositeSize.h, corner),
          formatPipCornerCoverageBreakdownLine(compositeSize.w, compositeSize.h, size),
        ].join(" · ");
      } else {
        pipDetailLine.textContent = "";
      }
    };

    footer.append(
      startBtn,
      stopBtn,
      insertBtn,
      downloadBtn,
      createDevOnlyActionSelect(doc, t("developer.dumpMenu"), [
        { label: t("record.copySummary"), run: () => copyBtn.click() },
        { label: t("record.copyCompactSummary"), run: () => copyCompactSummaryBtn.click() },
        { label: t("record.copySettings"), run: () => copySettingsBtn.click() },
        { label: t("record.copyCompactSettings"), run: () => copyCompactSettingsBtn.click() },
        { label: t("record.copyWorkspace"), run: () => copyWorkspaceBtn.click() },
        { label: t("record.copyCompactWorkspace"), run: () => copyCompactWorkspaceBtn.click() },
        { label: t("record.copyReadiness"), run: () => copyReadinessBtn.click() },
        { label: t("record.copyWorkspaceStats"), run: () => copyWorkspaceStatsBtn.click() },
        { label: t("record.copyModeReadiness"), run: () => copyModeReadinessBtn.click() },
        { label: t("record.copyPipSpread"), run: () => copyPipSpreadBtn.click() },
        { label: t("record.copyPipCornerBreakdown"), run: () => copyPipCornerBreakdownBtn.click() },
      ]),
      cancelBtn,
    );
    modal.appendChild(footer);
    overlay.appendChild(modal);

    const syncModeUi = (): void => {
      for (const [id, b] of modeBtns) {
        const on = id === mode;
        b.style.background = on ? "var(--primary,#3b82f6)" : "transparent";
        b.style.color = on ? "#fff" : "";
      }
      preview.hidden = !recordPreviewVisible({
        mode,
        recording: recorder?.state === "recording",
        hasTake: recordBlob != null,
      });
    };

    const applyEnvGate = (): void => {
      const reason = modeUnsupportedReason(mode, doc);
      startBtn.disabled = !!reason;
      status.textContent = reason ? t(reason) : t("record.hint");
    };

    /** 还没录只留开始；正在录只留停止；录完才出现插入和另存。 */
    const setPhase = (next: "idle" | "recording" | "ready"): void => {
      const recording = next === "recording";
      const ready = next === "ready";
      startBtn.hidden = recording;
      stopBtn.hidden = !recording;
      stopBtn.disabled = !recording;
      insertBtn.hidden = !ready;
      downloadBtn.hidden = !ready;
      insertBtn.disabled = !ready;
      downloadBtn.disabled = !ready;
      copyBtn.disabled = !ready;
      copyCompactSummaryBtn.disabled = !ready;
      syncModeUi();
    };

    const updateFlipLabel = (): void => {
      flipBtn.textContent = facing === "user" ? t("record.devices.front") : t("record.devices.back");
    };

    const syncDeviceRows = (): void => {
      const cam = modeUsesCamera(mode);
      const mic = modeUsesMic(mode);
      camBlock.style.display = cam ? "flex" : "none";
      micBlock.style.display = mic ? "flex" : "none";
      deviceStack.style.display = cam || mic ? "flex" : "none";
      const locked = arming || recorder?.state === "recording";
      const micOptional = micCanBeDisabled(mode);
      micOn.style.display = micOptional ? "" : "none";
      if (!micOptional) micOn.checked = true;
      camSel.disabled = locked;
      micOn.disabled = locked || !micOptional;
      micSel.disabled = locked || (micOptional && !micOn.checked);
      const facingModes = livePreview?.getVideoTracks()[0]?.getCapabilities?.().facingMode;
      flipBtn.hidden =
        !cam ||
        !cameraCanFlip({
          cameraIds: [...camSel.options].map((o) => o.value),
          facingModes: Array.isArray(facingModes) ? facingModes : [],
        });
      flipBtn.disabled = locked || flipBtn.hidden;
    };

    const fillDeviceSelect = (
      sel: HTMLSelectElement,
      devices: MediaDeviceInfo[],
      unnamed: (n: number) => string,
    ): void => {
      const prev = sel.value;
      sel.replaceChildren();
      devices.forEach((d, i) => {
        const opt = sel.ownerDocument.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || unnamed(i + 1);
        sel.appendChild(opt);
      });
      if (devices.length === 0) {
        const opt = sel.ownerDocument.createElement("option");
        opt.value = "";
        opt.textContent = unnamed(1);
        sel.appendChild(opt);
      }
      if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
    };

    const stopLivePreview = (): void => {
      previewGen += 1;
      const stream = livePreview;
      livePreview = null;
      if (stream && preview.srcObject === stream) preview.srcObject = null;
      stopTracks(stream);
      preview.style.transform = "";
    };

    const refreshPreview = async (): Promise<void> => {
      stopLivePreview();
      if (!modeUsesCamera(mode) || arming || recorder?.state === "recording" || recordBlob) {
        if (!recordBlob && recorder?.state !== "recording" && !arming) preview.controls = mode !== "audio";
        return;
      }
      const gen = previewGen;
      try {
        const stream = await getCameraStream(chosenVideo(camSel.value, facing, useFacing), false, {
          fallback: !useFacing,
        });
        if (gen !== previewGen) {
          stopTracks(stream);
          return;
        }
        livePreview = stream;
        preview.removeAttribute("src");
        preview.srcObject = stream;
        preview.muted = true;
        preview.controls = false;
        const reported = streamFacing(stream);
        if (reported) facing = reported;
        updateFlipLabel();
        preview.style.transform = recordPreviewMirrored({
          mode,
          facing: reported ?? facing,
          pipMirror: loadPipPreferences().mirror !== false,
        })
          ? "scaleX(-1)"
          : "";
        const id = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (id && [...camSel.options].some((o) => o.value === id)) {
          fillingDevices = true;
          camSel.value = id;
          fillingDevices = false;
        }
        await preview.play().catch(() => undefined);
        syncDeviceRows();
      } catch (e) {
        if (gen !== previewGen) return;
        status.textContent = t("record.error", { msg: mediaErrorMessage(e, mode) });
      }
    };

    let deviceLoad = 0;
    const syncDevicesAndPreview = async (): Promise<void> => {
      const token = ++deviceLoad;
      syncDeviceRows();
      const askMic = modeUsesMic(mode) && !micsLoaded;
      const askCam = modeUsesCamera(mode) && !camsLoaded;
      if (askMic || askCam) {
        const found = await listCaptureDevices({ mic: askMic, camera: askCam });
        if (token !== deviceLoad) return;
        fillingDevices = true;
        if (askMic) {
          fillDeviceSelect(micSel, found.mics, (n) => t("record.devices.unnamedMic", { n }));
          micsLoaded = true;
        }
        if (askCam) {
          fillDeviceSelect(camSel, found.cameras, (n) => t("record.devices.unnamedCamera", { n }));
          camsLoaded = true;
        }
        fillingDevices = false;
        syncDeviceRows();
      }
      if (token !== deviceLoad) return;
      await refreshPreview();
    };

    const paintPreviewMirror = (): void => {
      preview.style.transform = recordPreviewMirrored({
        mode,
        facing,
        pipMirror: loadPipPreferences().mirror !== false,
      })
        ? "scaleX(-1)"
        : "";
    };

    const flipCamera = async (): Promise<void> => {
      if (flipBtn.disabled || !modeUsesCamera(mode) || arming || recorder?.state === "recording") return;
      const track = livePreview?.getVideoTracks()[0];
      const currentId = track?.getSettings().deviceId || camSel.value;
      const nextId = otherCameraId(
        [...camSel.options].map((o) => o.value),
        currentId,
      );
      if (nextId) {
        useFacing = false;
        fillingDevices = true;
        camSel.value = nextId;
        fillingDevices = false;
        await refreshPreview();
        const reported = livePreview ? streamFacing(livePreview) : undefined;
        if (reported) facing = reported;
        updateFlipLabel();
        paintPreviewMirror();
        return;
      }
      const next = oppositeFacing(facing);
      const offered = track?.getCapabilities?.().facingMode;
      if (track && Array.isArray(offered) && offered.includes(next)) {
        try {
          await track.applyConstraints({ facingMode: next });
          const reported = track.getSettings().facingMode;
          if (reported === next) {
            facing = next;
            useFacing = true;
            updateFlipLabel();
            paintPreviewMirror();
            status.textContent = t("record.hint");
            return;
          }
        } catch {
          // 这只镜头拒了，下面再试一次重新打开。
        }
      }
      const gen = previewGen;
      let stream: MediaStream | null = null;
      let failed: { name?: string } | null = null;
      try {
        stream = await getCameraStream(exactFacingConstraints(next), false, { fallback: false });
      } catch (e) {
        failed = e as { name?: string };
        stream = null;
      }
      const busy = failed?.name === "NotReadableError" || failed?.name === "TrackStartError";
      if (!stream && busy && gen === previewGen) {
        stopLivePreview();
        try {
          stream = await getCameraStream(exactFacingConstraints(next), false, { fallback: false });
        } catch {
          stream = null;
        }
      }
      if (gen !== previewGen) {
        stopTracks(stream);
        return;
      }
      const reported = stream ? streamFacing(stream) : undefined;
      const newId = stream?.getVideoTracks()[0]?.getSettings().deviceId;
      const switched = !!stream && (reported === next || (!!newId && !!currentId && newId !== currentId));
      if (!switched) {
        stopTracks(stream);
        syncDeviceRows();
        status.textContent = flipBtn.hidden ? t("record.hint") : t("record.devices.flipUnsupported");
        if (!livePreview) {
          useFacing = currentId ? false : true;
          if (currentId) {
            fillingDevices = true;
            camSel.value = currentId;
            fillingDevices = false;
          }
          await refreshPreview();
        }
        updateFlipLabel();
        return;
      }
      stopLivePreview();
      facing = reported ?? next;
      useFacing = !newId;
      livePreview = stream;
      preview.removeAttribute("src");
      preview.srcObject = stream;
      preview.muted = true;
      preview.controls = false;
      updateFlipLabel();
      paintPreviewMirror();
      if (newId && [...camSel.options].some((o) => o.value === newId)) {
        fillingDevices = true;
        camSel.value = newId;
        fillingDevices = false;
        useFacing = false;
      }
      status.textContent = t("record.hint");
      await preview.play().catch(() => undefined);
    };

    camSel.addEventListener("change", () => {
      if (fillingDevices) return;
      useFacing = false;
      void refreshPreview();
    });
    micOn.addEventListener("change", () => {
      syncDeviceRows();
    });
    flipBtn.addEventListener("click", () => {
      void flipCamera();
    });

    const setMode = (next: RecordMode): void => {
      if (recorder?.state === "recording") return;
      mode = next;
      saveRecordMode(mode);
      if (!modeUsesCamera(mode)) stopLivePreview();
      syncModeUi();
      applyEnvGate();
      syncReadinessLine();
      void syncDevicesAndPreview();
    };

    const cleanup = (): void => {
      stopLivePreview();
      if (timerId !== undefined) clearInterval(timerId);
      try {
        recorder?.stop();
      } catch {
        // ignore
      }
      releaseStream?.();
      releaseStream = null;
      liveStream = null;
      recorder = null;
      if (recordUrl) URL.revokeObjectURL(recordUrl);
    };

    const formatElapsed = (ms: number): string => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return `${m}:${String(s % 60).padStart(2, "0")}`;
    };

    startBtn.addEventListener("click", async () => {
      try {
        chunks = [];
        recordBlob = null;
        arming = true;
        setPhase("idle");
        syncDeviceRows();
        startBtn.disabled = true;
        stopLivePreview();
        if (recordUrl) {
          URL.revokeObjectURL(recordUrl);
          recordUrl = null;
        }
        const acquired = await acquireStream(doc, mode, {
          audioDeviceId: micSel.value,
          micEnabled: !micCanBeDisabled(mode) || micOn.checked,
          videoDeviceId: camSel.value,
          facing,
          useFacing,
        });
        liveStream = acquired.stream;
        releaseStream = acquired.release;
        // 预览必须静音再 play。getUserMedia 之后用户手势已经过期，带声轨的
        // <video> 不会自动出画；静音只作用于这个元素，不影响 MediaRecorder。
        preview.removeAttribute("src");
        preview.srcObject = mode === "audio" ? null : acquired.stream;
        preview.muted = mode !== "audio";
        preview.controls = false;
        if (mode !== "audio") await preview.play().catch(() => undefined);
        const kind = mode === "audio" ? "audio" : "video";
        const started = startRecorder(acquired.stream, kind, (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        });
        recorder = started.recorder;
        const mime = started.mime;
        recorder.onstop = async () => {
          recordBlob = new Blob(chunks, { type: mime });
          recordMime = mime;
          recordUrl = URL.createObjectURL(recordBlob);
          preview.srcObject = null;
          preview.muted = false;
          preview.controls = true;
          if (mode !== "audio") preview.src = recordUrl;
          preview.style.transform = "";
          setPhase("ready");
          syncDeviceRows();
          startBtn.disabled = !!modeUnsupportedReason(mode, doc);
          const sizeMb = (recordBlob.size / (1024 * 1024)).toFixed(1);
          let durationText = "";
          recordDurationSec = undefined;
          recordWidth = undefined;
          recordHeight = undefined;
          if (recordUrl) {
            const meta =
              mode === "audio"
                ? await loadAudioMeta(doc, recordUrl)
                : await loadVideoMeta(doc, recordUrl);
            if (meta.duration) {
              recordDurationSec = meta.duration;
              durationText = ` · ${formatRecordingDuration(meta.duration)}`;
            }
            if ("w" in meta && typeof meta.w === "number" && meta.w) recordWidth = meta.w;
            if ("h" in meta && typeof meta.h === "number" && meta.h) recordHeight = meta.h;
          }
          status.textContent =
            t("record.ready", { size: sizeMb }) + durationText + ` · ${mime}`;
          if (recordBlob.size > RECORDING_LARGE_BYTES) {
            status.textContent += ` · ${t("record.largeHint", { size: formatRecordingFileSize(recordBlob.size) })}`;
          }
          syncReadinessLine();
          releaseStream?.();
          releaseStream = null;
          liveStream = null;
        };
        startedAt = Date.now();
        arming = false;
        setPhase("recording");
        syncDeviceRows();
        for (const b of modeBtns.values()) b.disabled = true;
        status.textContent = t("record.recording", { time: "0:00" });
        timerId = setInterval(() => {
          status.textContent = t("record.recording", { time: formatElapsed(Date.now() - startedAt) });
        }, 500);
      } catch (e) {
        arming = false;
        status.textContent = t("record.error", { msg: mediaErrorMessage(e, mode) });
        cleanup();
        setPhase("idle");
        syncDeviceRows();
        startBtn.disabled = !!modeUnsupportedReason(mode, doc);
        for (const b of modeBtns.values()) b.disabled = false;
        void refreshPreview();
      }
    });

    stopBtn.addEventListener("click", () => {
      if (recorder?.state === "recording") recorder.stop();
      if (timerId !== undefined) clearInterval(timerId);
      stopBtn.disabled = true;
      for (const b of modeBtns.values()) b.disabled = false;
    });

    insertBtn.addEventListener("click", async () => {
      if (!recordBlob) return;
      if (recordBlob.size > RECORDING_LARGE_BYTES) {
        const ok = globalThis.confirm?.(
          t("record.largeConfirm", { size: formatRecordingFileSize(recordBlob.size) }),
        );
        if (ok === false) return;
      }
      try {
        const dataUrl = await blobToDataUrl(recordBlob);
        const kind = mode === "audio" ? "audio" : "video";
        if (kind === "video") {
          const poster = capturePoster(preview);
          const meta = await loadVideoMeta(doc, dataUrl);
          finish({ kind, dataUrl, ...meta, poster });
        } else {
          const meta = await loadAudioMeta(doc, dataUrl);
          finish({ kind, dataUrl, ...meta });
        }
      } catch (e) {
        status.textContent = t("record.error", { msg: mediaErrorMessage(e) });
      }
    });

    downloadBtn.addEventListener("click", async () => {
      if (!recordBlob) return;
      downloadBtn.disabled = true;
      const prevStatus = status.textContent;
      try {
        status.textContent =
          mode === "audio" ? t("record.convertingM4a") : t("record.convertingMp4");
        const { blob, ext } = await ensureExportRecordingBlob(recordBlob);
        downloadBlob(doc, blob, `recording-${Date.now()}.${ext}`);
        if ((mode !== "audio" && ext === "webm") || (mode === "audio" && ext === "webm")) {
          status.textContent = mode === "audio" ? t("record.m4aFallback") : t("record.mp4Fallback");
        } else status.textContent = prevStatus;
      } catch (e) {
        status.textContent = t("record.error", { msg: mediaErrorMessage(e) });
      } finally {
        downloadBtn.disabled = false;
      }
    });

    copyBtn.addEventListener("click", () => {
      if (!recordBlob) return;
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      void copyTextToClipboard(
        exportRecordingSummaryText({
          mode,
          bytes: recordBlob.size,
          mime: recordMime ?? recordBlob.type,
          durationSec: recordDurationSec,
          width: recordWidth,
          height: recordHeight,
          pipPrefs,
        }),
      );
    });

    copyCompactSummaryBtn.addEventListener("click", () => {
      if (!recordBlob) return;
      const pipPrefs = mode === "screen-camera" ? loadPipPreferences() : undefined;
      void copyTextToClipboard(
        exportRecordingCompactText({
          mode,
          bytes: recordBlob.size,
          mime: recordMime ?? recordBlob.type,
          durationSec: recordDurationSec,
          width: recordWidth,
          height: recordHeight,
          pipPrefs,
        }),
      );
    });

    cancelBtn.addEventListener("click", () => finish(null));
    modalDismiss = bindEditorModal({
      doc,
      overlay,
      panel: modal,
      onCancel: () => finish(null),
      backdropDismiss: () => recorder?.state !== "recording",
    });

    syncModeUi();
    setPhase("idle");
    syncDeviceRows();
    applyEnvGate();
    syncReadinessLine();
    void syncDevicesAndPreview();
    doc.body.appendChild(overlay);
  });
}

export function isRecordSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}
