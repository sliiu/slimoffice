import { t } from "./i18n";
import { copyTextToClipboard } from "./insert-meta";
import {
  OVERLAY_ICON_BTN_BG,
  OVERLAY_ICON_BTN_BG_ACTIVE,
  OVERLAY_ICON_BTN_BG_DANGER,
  OVERLAY_ICON_BTN_CSS,
  createDevOnlyToolbar,
} from "./ui-style";
import {
  exportPipCornerCoverageBreakdownText,
  exportPipCoverageSpreadText,
  exportPipPreferencesCompactText,
  exportPipPreferencesText,
  exportPipReadinessText,
  exportPipSizeCoverageBreakdownText,
  exportRecordWorkspaceCompactText,
  formatPipCornerCoverageBreakdownLine,
  formatPipCoverageLine,
  formatPipCoverageSpreadLine,
  formatPipPreferencesCompactLine,
  formatPipReadinessLine,
  pipCornerWithLargestCoverage,
  pipSizeWithLargestCoverage,
  pipSizeWithSmallestCoverage,
} from "./record-meta";

export type PipSizePreset = "s" | "m" | "l";

export type PipCorner = "br" | "bl" | "tr" | "tl";

export const PIP_CORNER_CYCLE: PipCorner[] = ["br", "bl", "tl", "tr"];

export function cyclePipSize(current: PipSizePreset): PipSizePreset {
  return current === "s" ? "m" : current === "m" ? "l" : "s";
}

export function cyclePipCorner(current: PipCorner): PipCorner {
  const idx = PIP_CORNER_CYCLE.indexOf(current);
  return PIP_CORNER_CYCLE[(idx + 1) % PIP_CORNER_CYCLE.length] ?? "br";
}

export const PIP_WIDTH_PX: Record<PipSizePreset, number> = {
  s: 140,
  m: 200,
  l: 280,
};

const PIP_STORAGE_KEY = "pp.record.pip";

export const DEFAULT_PIP_PREFERENCES: Required<
  Pick<PipPreferences, "size" | "corner" | "mirror" | "cameraVisible" | "micMuted">
> = {
  size: "m",
  corner: "br",
  mirror: true,
  cameraVisible: true,
  micMuted: false,
};

export interface PipPreferences {
  x?: number;
  y?: number;
  size?: PipSizePreset;
  corner?: PipCorner;
  mirror?: boolean;
  cameraVisible?: boolean;
  micMuted?: boolean;
}

export function loadPipPreferences(): PipPreferences {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(PIP_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PipPreferences;
  } catch {
    return {};
  }
}

export function savePipPreferences(prefs: PipPreferences): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}

export function resetPipPreferences(): void {
  savePipPreferences({ ...DEFAULT_PIP_PREFERENCES });
}

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
export function defaultPipOverlayPosition(
  corner: PipCorner,
  panelW: number,
  panelH: number,
  pad = 16,
  viewportW = typeof window !== "undefined" ? window.innerWidth : 1280,
  viewportH = typeof window !== "undefined" ? window.innerHeight : 720,
): { x: number; y: number } {
  switch (corner) {
    case "tl":
      return { x: pad, y: pad };
    case "tr":
      return { x: viewportW - panelW - pad, y: pad };
    case "bl":
      return { x: pad, y: viewportH - panelH - pad };
    default:
      return { x: viewportW - panelW - pad, y: viewportH - panelH - pad };
  }
}

/** Clamp overlay position inside the viewport with padding. */
export function clampOverlayPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  pad = 8,
): { x: number; y: number } {
  const maxX = Math.max(pad, (typeof window !== "undefined" ? window.innerWidth : 1280) - w - pad);
  const maxY = Math.max(pad, (typeof window !== "undefined" ? window.innerHeight : 720) - h - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
  };
}

function mkIconBtn(doc: Document, label: string, title: string): HTMLButtonElement {
  const b = doc.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.style.cssText = OVERLAY_ICON_BTN_CSS;
  return b;
}

/**
 * Floating camera PIP + microphone level during Record Slide Show / narration capture.
 */
export async function mountRecordShowOverlay(
  doc: Document,
  opts?: RecordShowOverlayOptions,
): Promise<RecordShowOverlayHandle> {
  const draggable = opts?.draggable !== false;
  const externalCamera = opts?.cameraStream != null;
  const openCamera = opts?.openCamera !== false && opts?.cameraStream !== null;
  const prefs = loadPipPreferences();
  let mirror = prefs.mirror ?? opts?.mirrorCamera !== false;
  let pipSize: PipSizePreset = prefs.size ?? "m";
  let pipCorner: PipCorner = prefs.corner ?? "br";
  let camVisible = prefs.cameraVisible !== false;
  let camStream: MediaStream | null = null;
  let micMuted = prefs.micMuted === true;
  let audioTrack: MediaStreamTrack | null = opts?.audioStream?.getAudioTracks()[0] ?? null;

  const root = doc.createElement("div");
  root.style.cssText =
    "position:fixed;inset:0;z-index:var(--z-overlay, 1500);pointer-events:none;overflow:hidden";

  const stopBar = doc.createElement("div");
  stopBar.style.cssText =
    "position:fixed;top:12px;right:12px;display:flex;align-items:center;gap:6px;pointer-events:auto;background:color-mix(in srgb, var(--popover) 88%, transparent);color:var(--muted-foreground);border:1px solid var(--border);border-radius:999px;padding:3px 4px 3px 10px;font:11px var(--font-sans,system-ui,sans-serif)";
  const stopLabel = doc.createElement("span");
  stopLabel.textContent = t("recordOverlay.recording");
  const stopBtn = doc.createElement("button");
  stopBtn.type = "button";
  stopBtn.textContent = t("recordOverlay.stop");
  stopBtn.title = t("recordOverlay.recordingHint");
  stopBtn.style.cssText =
    "border:0;border-radius:999px;padding:3px 8px;background:var(--destructive, #dc2626);color:#fff;font:inherit;cursor:pointer";
  stopBtn.addEventListener("click", () => opts?.onStop?.());
  stopBar.append(stopLabel, stopBtn);
  root.appendChild(stopBar);

  const micWrap = doc.createElement("div");
  micWrap.style.cssText =
    "position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:6px;background:color-mix(in srgb, var(--popover) 88%, transparent);color:var(--foreground);border:1px solid var(--border);padding:6px 10px;border-radius:var(--radius-md,8px);font:11px var(--font-sans,system-ui,sans-serif);pointer-events:none";
  const micDot = doc.createElement("span");
  micDot.textContent = "🎤";
  const micBar = doc.createElement("div");
  micBar.style.cssText = "width:48px;height:6px;background:var(--border);border-radius:3px;overflow:hidden";
  const micFill = doc.createElement("div");
  micFill.style.cssText = "height:100%;width:0%;background:#22c55e;transition:width .05s";
  micBar.appendChild(micFill);
  micWrap.append(micDot, micBar);
  root.appendChild(micWrap);

  const pipPanel = doc.createElement("div");
  pipPanel.style.cssText =
    "position:fixed;right:16px;bottom:72px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none";
  root.appendChild(pipPanel);

  const toolbar = doc.createElement("div");
  toolbar.style.cssText = "display:flex;gap:4px;pointer-events:auto;flex-wrap:wrap;justify-content:flex-end";
  const mirrorBtn = mkIconBtn(doc, "⇄", t("recordOverlay.mirror"));
  const camBtn = mkIconBtn(doc, "📷", t("recordOverlay.hideCamera"));
  const sizeBtn = mkIconBtn(doc, "S", t("recordOverlay.sizeCycle"));
  const cornerBtn = mkIconBtn(doc, "↘", t("recordOverlay.cornerCycle"));
  const copyPipBtn = mkIconBtn(doc, "⎘", t("recordOverlay.copyPip"));
  const copyPipCompactBtn = mkIconBtn(doc, "⎙", t("recordOverlay.copyPipCompact"));
  const copyWorkspaceCompactBtn = mkIconBtn(doc, "⎒", t("recordOverlay.copyWorkspaceCompact"));
  const copyPipReadinessBtn = mkIconBtn(doc, "✓", t("recordOverlay.copyPipReadiness"));
  const copyPipBreakdownBtn = mkIconBtn(doc, "▤", t("recordOverlay.copyPipBreakdown"));
  const copyPipCornerBreakdownBtn = mkIconBtn(doc, "▦", t("recordOverlay.copyPipCornerBreakdown"));
  const copyPipSpreadBtn = mkIconBtn(doc, "↔", t("recordOverlay.copyPipSpread"));
  const largestPipBtn = mkIconBtn(doc, "⤢", t("recordOverlay.applyLargestPip"));
  const smallestPipBtn = mkIconBtn(doc, "⤡", t("recordOverlay.applySmallestPip"));
  const largestCornerBtn = mkIconBtn(doc, "⌖", t("recordOverlay.applyLargestCorner"));
  const resetPipBtn = mkIconBtn(doc, "↺", t("recordOverlay.resetPip"));
  const micBtn = opts?.audioStream ? mkIconBtn(doc, "🎤", t("recordOverlay.muteMic")) : null;
  toolbar.append(
    mirrorBtn,
    camBtn,
    sizeBtn,
    cornerBtn,
    largestPipBtn,
    smallestPipBtn,
    largestCornerBtn,
    createDevOnlyToolbar(
      doc,
      copyPipBtn,
      copyPipCompactBtn,
      copyPipReadinessBtn,
      copyPipBreakdownBtn,
      copyPipCornerBreakdownBtn,
      copyPipSpreadBtn,
      copyWorkspaceCompactBtn,
    ),
    resetPipBtn,
  );
  if (micBtn) toolbar.appendChild(micBtn);
  pipPanel.appendChild(toolbar);

  const pipStats = doc.createElement("div");
  pipStats.style.cssText =
    "font:10px var(--font-sans,system-ui,sans-serif);color:var(--foreground);background:color-mix(in srgb, var(--popover) 82%, transparent);border:1px solid var(--border);padding:3px 8px;border-radius:var(--radius-sm,6px);pointer-events:none;max-width:min(360px,90vw);line-height:1.35";
  pipPanel.appendChild(pipStats);

  const pipSpreadStats = doc.createElement("div");
  pipSpreadStats.style.cssText =
    "font:10px var(--font-sans,system-ui,sans-serif);color:var(--muted-foreground);background:color-mix(in srgb, var(--popover) 72%, transparent);border:1px solid var(--border);padding:3px 8px;border-radius:var(--radius-sm,6px);pointer-events:none;max-width:min(360px,90vw);line-height:1.35;margin-top:4px";
  pipPanel.appendChild(pipSpreadStats);

  const videoWrap = doc.createElement("div");
  videoWrap.style.cssText =
    "position:relative;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.45);pointer-events:auto;touch-action:none";
  const video = doc.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.style.cssText =
    "width:min(200px,28vw);aspect-ratio:4/3;object-fit:cover;display:block;background:#000;border:2px solid var(--border)";
  videoWrap.appendChild(video);
  pipPanel.appendChild(videoWrap);

  const currentPipPrefs = (): PipPreferences => ({
    ...loadPipPreferences(),
    size: pipSize,
    corner: pipCorner,
    mirror,
    cameraVisible: camVisible,
    micMuted,
  });

  const syncPipStats = (): void => {
    const prefs = currentPipPrefs();
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    pipStats.textContent = `${formatPipReadinessLine(canvasW, canvasH, prefs)} · ${formatPipCoverageLine(canvasW, canvasH, prefs)}`;
    pipSpreadStats.textContent = `${formatPipCoverageSpreadLine(canvasW, canvasH, pipCorner)} · ${formatPipCornerCoverageBreakdownLine(canvasW, canvasH, pipSize)}`;
  };

  const applyPipSize = (): void => {
    const w = PIP_WIDTH_PX[pipSize];
    video.style.width = `min(${w}px,28vw)`;
    const label = pipSize === "s" ? "S" : pipSize === "l" ? "L" : "M";
    sizeBtn.textContent = label;
    sizeBtn.title =
      pipSize === "s"
        ? t("recordOverlay.sizeSmall")
        : pipSize === "l"
          ? t("recordOverlay.sizeLarge")
          : t("recordOverlay.sizeMedium");
    sizeBtn.style.background = pipSize === "m" ? OVERLAY_ICON_BTN_BG_ACTIVE : OVERLAY_ICON_BTN_BG;
    savePipPreferences({ ...loadPipPreferences(), size: pipSize, mirror, corner: pipCorner });
    syncPipStats();
  };
  applyPipSize();

  const cornerGlyph: Record<PipCorner, string> = { br: "↘", bl: "↙", tr: "↗", tl: "↖" };

  let dragOffX = 0;
  let dragOffY = 0;
  let dragging = false;

  const placePanel = (x: number, y: number, persist = false): void => {
    const rect = pipPanel.getBoundingClientRect();
    const clamped = clampOverlayPosition(x, y, rect.width || PIP_WIDTH_PX[pipSize], rect.height || 160);
    pipPanel.style.left = `${clamped.x}px`;
    pipPanel.style.top = `${clamped.y}px`;
    pipPanel.style.right = "auto";
    pipPanel.style.bottom = "auto";
    if (persist) {
      savePipPreferences({
        ...loadPipPreferences(),
        x: clamped.x,
        y: clamped.y,
        size: pipSize,
        mirror,
        corner: pipCorner,
      });
      syncPipStats();
    }
  };

  const syncCornerBtn = (): void => {
    cornerBtn.textContent = cornerGlyph[pipCorner];
    cornerBtn.title = t(`recordOverlay.corner.${pipCorner}` as never);
    cornerBtn.style.background = pipCorner === "br" ? OVERLAY_ICON_BTN_BG_ACTIVE : OVERLAY_ICON_BTN_BG;
  };
  syncCornerBtn();

  const snapToCorner = (): void => {
    const rect = pipPanel.getBoundingClientRect();
    const pos = defaultPipOverlayPosition(
      pipCorner,
      rect.width || PIP_WIDTH_PX[pipSize],
      rect.height || 160,
    );
    placePanel(pos.x, pos.y, true);
  };

  const persistPip = (patch: Partial<PipPreferences>): void => {
    savePipPreferences({ ...loadPipPreferences(), size: pipSize, mirror, corner: pipCorner, ...patch });
    syncPipStats();
  };

  sizeBtn.addEventListener("click", () => {
    pipSize = cyclePipSize(pipSize);
    applyPipSize();
    snapToCorner();
  });

  cornerBtn.addEventListener("click", () => {
    pipCorner = cyclePipCorner(pipCorner);
    syncCornerBtn();
    persistPip({ corner: pipCorner });
    snapToCorner();
  });

  copyPipBtn.addEventListener("click", () => {
    const rect = pipPanel.getBoundingClientRect();
    void copyTextToClipboard(
      exportPipPreferencesText(currentPipPrefs(), {
        overlayPosition: { x: rect.left, y: rect.top },
      }),
    );
  });

  copyPipCompactBtn.addEventListener("click", () => {
    const rect = pipPanel.getBoundingClientRect();
    void copyTextToClipboard(
      exportPipPreferencesCompactText(currentPipPrefs(), {
        overlayPosition: { x: rect.left, y: rect.top },
      }),
    );
  });

  copyWorkspaceCompactBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    void copyTextToClipboard(
      exportRecordWorkspaceCompactText({
        mode: "screen-camera",
        pipPrefs: currentPipPrefs(),
        compositeSize: { w: canvasW, h: canvasH },
      }),
    );
  });

  copyPipReadinessBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    void copyTextToClipboard(exportPipReadinessText(canvasW, canvasH, currentPipPrefs()));
  });

  copyPipBreakdownBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    void copyTextToClipboard(
      exportPipSizeCoverageBreakdownText(canvasW, canvasH, pipCorner),
    );
  });

  copyPipCornerBreakdownBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    void copyTextToClipboard(exportPipCornerCoverageBreakdownText(canvasW, canvasH, pipSize));
  });

  copyPipSpreadBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    void copyTextToClipboard(exportPipCoverageSpreadText(canvasW, canvasH, pipCorner));
  });

  largestPipBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    pipSize = pipSizeWithLargestCoverage(canvasW, canvasH, pipCorner);
    applyPipSize();
    snapToCorner();
  });

  smallestPipBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    pipSize = pipSizeWithSmallestCoverage(canvasW, canvasH, pipCorner);
    applyPipSize();
    snapToCorner();
  });

  largestCornerBtn.addEventListener("click", () => {
    const canvasW = doc.defaultView?.innerWidth ?? 1280;
    const canvasH = doc.defaultView?.innerHeight ?? 720;
    pipCorner = pipCornerWithLargestCoverage(canvasW, canvasH, pipSize);
    syncCornerBtn();
    persistPip({ corner: pipCorner });
    snapToCorner();
  });

  resetPipBtn.addEventListener("click", () => {
    resetPipPreferences();
    const defaults = DEFAULT_PIP_PREFERENCES;
    pipSize = defaults.size;
    pipCorner = defaults.corner;
    mirror = defaults.mirror;
    camVisible = defaults.cameraVisible;
    micMuted = defaults.micMuted;
    applyPipSize();
    syncCornerBtn();
    syncMirror();
    mirrorBtn.style.background = mirror ? OVERLAY_ICON_BTN_BG_ACTIVE : OVERLAY_ICON_BTN_BG;
    setCameraVisible(camVisible);
    if (micBtn && audioTrack) {
      audioTrack.enabled = !micMuted;
      micBtn.textContent = micMuted ? "🔇" : "🎤";
      micBtn.title = micMuted ? t("recordOverlay.unmuteMic") : t("recordOverlay.muteMic");
      micBtn.style.background = micMuted ? OVERLAY_ICON_BTN_BG_DANGER : OVERLAY_ICON_BTN_BG;
      micDot.textContent = micMuted ? "🔇" : "🎤";
    }
    snapToCorner();
    syncPipStats();
  });

  doc.body.appendChild(root);
  syncPipStats();

  const syncMirror = (): void => {
    video.style.transform = mirror ? "scaleX(-1)" : "";
  };
  syncMirror();

  mirrorBtn.addEventListener("click", () => {
    mirror = !mirror;
    syncMirror();
    mirrorBtn.style.background = mirror ? OVERLAY_ICON_BTN_BG_ACTIVE : OVERLAY_ICON_BTN_BG;
    persistPip({ mirror });
  });
  mirrorBtn.style.background = mirror ? OVERLAY_ICON_BTN_BG_ACTIVE : OVERLAY_ICON_BTN_BG;

  const setCameraVisible = (on: boolean): void => {
    camVisible = on;
    videoWrap.style.display = on ? "" : "none";
    camBtn.textContent = on ? "📷" : "🚫";
    camBtn.title = on ? t("recordOverlay.hideCamera") : t("recordOverlay.showCamera");
  };

  camBtn.addEventListener("click", () => {
    if (camVisible) {
      if (!externalCamera) {
        camStream?.getVideoTracks().forEach((tr) => {
          tr.enabled = false;
        });
      }
      setCameraVisible(false);
      persistPip({ cameraVisible: false });
    } else {
      if (!externalCamera) {
        camStream?.getVideoTracks().forEach((tr) => {
          tr.enabled = true;
        });
      }
      setCameraVisible(true);
      persistPip({ cameraVisible: true });
    }
  });

  if (draggable) {
    videoWrap.style.cursor = "grab";
    const onMove = (clientX: number, clientY: number): void => {
      placePanel(clientX - dragOffX, clientY - dragOffY);
    };
    videoWrap.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      videoWrap.style.cursor = "grabbing";
      const rect = pipPanel.getBoundingClientRect();
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      videoWrap.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    videoWrap.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      onMove(e.clientX, e.clientY);
    });
    const endDrag = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      videoWrap.style.cursor = "grab";
      const rect = pipPanel.getBoundingClientRect();
      placePanel(rect.left, rect.top, true);
      try {
        videoWrap.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };
    videoWrap.addEventListener("pointerup", endDrag);
    videoWrap.addEventListener("pointercancel", endDrag);
  }

  if (typeof prefs.x === "number" && typeof prefs.y === "number") {
    placePanel(prefs.x, prefs.y);
  } else {
    snapToCorner();
  }

  let raf = 0;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;

  const stopMeter = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    audioCtx?.close().catch(() => undefined);
    audioCtx = null;
    analyser = null;
  };

  const startMeter = (stream: MediaStream): void => {
    stopMeter();
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    try {
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = (): void => {
        if (!analyser) return;
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i]!;
        const level = Math.min(100, (sum / buf.length / 128) * 100);
        micFill.style.width = `${level}%`;
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // ignore WebAudio failures
    }
  };

  if (opts?.audioStream) startMeter(opts.audioStream);

  if (micBtn && audioTrack) {
    if (micMuted) {
      audioTrack.enabled = false;
      micBtn.textContent = "🔇";
      micBtn.title = t("recordOverlay.unmuteMic");
      micBtn.style.background = OVERLAY_ICON_BTN_BG_DANGER;
      micDot.textContent = "🔇";
    }
    micBtn.addEventListener("click", () => {
      micMuted = !micMuted;
      audioTrack!.enabled = !micMuted;
      micBtn.textContent = micMuted ? "🔇" : "🎤";
      micBtn.title = micMuted ? t("recordOverlay.unmuteMic") : t("recordOverlay.muteMic");
      micBtn.style.background = micMuted ? OVERLAY_ICON_BTN_BG_DANGER : OVERLAY_ICON_BTN_BG;
      micDot.textContent = micMuted ? "🔇" : "🎤";
      if (micMuted) micFill.style.width = "0%";
      persistPip({ micMuted });
    });
  }

  try {
    if (externalCamera && opts?.cameraStream) {
      camStream = opts.cameraStream;
      video.srcObject = camStream;
      await video.play().catch(() => undefined);
      if (!camVisible) setCameraVisible(false);
    } else if (openCamera && navigator.mediaDevices?.getUserMedia) {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      video.srcObject = camStream;
      await video.play().catch(() => undefined);
      if (!camVisible) {
        camStream.getVideoTracks().forEach((tr) => {
          tr.enabled = false;
        });
        setCameraVisible(false);
      }
    } else {
      setCameraVisible(false);
    }
  } catch {
    setCameraVisible(false);
    toolbar.style.display = "none";
  }

  return {
    destroy(): void {
      stopMeter();
      if (!externalCamera) camStream?.getTracks().forEach((tr) => tr.stop());
      camStream = null;
      root.remove();
    },
    getCameraStream(): MediaStream | null {
      return camStream;
    },
    isCameraVisible(): boolean {
      return camVisible && !!camStream;
    },
  };
}
