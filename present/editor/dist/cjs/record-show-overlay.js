"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PIP_PREFERENCES = exports.PIP_WIDTH_PX = exports.PIP_CORNER_CYCLE = void 0;
exports.cyclePipSize = cyclePipSize;
exports.cyclePipCorner = cyclePipCorner;
exports.loadPipPreferences = loadPipPreferences;
exports.savePipPreferences = savePipPreferences;
exports.resetPipPreferences = resetPipPreferences;
exports.defaultPipOverlayPosition = defaultPipOverlayPosition;
exports.clampOverlayPosition = clampOverlayPosition;
exports.mountRecordShowOverlay = mountRecordShowOverlay;
const i18n_1 = require("./i18n");
const insert_meta_1 = require("./insert-meta");
const ui_style_1 = require("./ui-style");
const record_meta_1 = require("./record-meta");
exports.PIP_CORNER_CYCLE = ["br", "bl", "tl", "tr"];
function cyclePipSize(current) {
    return current === "s" ? "m" : current === "m" ? "l" : "s";
}
function cyclePipCorner(current) {
    const idx = exports.PIP_CORNER_CYCLE.indexOf(current);
    return exports.PIP_CORNER_CYCLE[(idx + 1) % exports.PIP_CORNER_CYCLE.length] ?? "br";
}
exports.PIP_WIDTH_PX = {
    s: 140,
    m: 200,
    l: 280,
};
const PIP_STORAGE_KEY = "pp.record.pip";
exports.DEFAULT_PIP_PREFERENCES = {
    size: "m",
    corner: "br",
    mirror: true,
    cameraVisible: true,
    micMuted: false,
};
function loadPipPreferences() {
    if (typeof localStorage === "undefined")
        return {};
    try {
        const raw = localStorage.getItem(PIP_STORAGE_KEY);
        if (!raw)
            return {};
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
function savePipPreferences(prefs) {
    if (typeof localStorage === "undefined")
        return;
    try {
        localStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(prefs));
    }
    catch {
        // ignore quota errors
    }
}
function resetPipPreferences() {
    savePipPreferences({ ...exports.DEFAULT_PIP_PREFERENCES });
}
/** Default fixed overlay position for a PIP corner (slide-show overlay). */
function defaultPipOverlayPosition(corner, panelW, panelH, pad = 16, viewportW = typeof window !== "undefined" ? window.innerWidth : 1280, viewportH = typeof window !== "undefined" ? window.innerHeight : 720) {
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
function clampOverlayPosition(x, y, w, h, pad = 8) {
    const maxX = Math.max(pad, (typeof window !== "undefined" ? window.innerWidth : 1280) - w - pad);
    const maxY = Math.max(pad, (typeof window !== "undefined" ? window.innerHeight : 720) - h - pad);
    return {
        x: Math.min(maxX, Math.max(pad, x)),
        y: Math.min(maxY, Math.max(pad, y)),
    };
}
function mkIconBtn(doc, label, title) {
    const b = doc.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.style.cssText = ui_style_1.OVERLAY_ICON_BTN_CSS;
    return b;
}
/**
 * Floating camera PIP + microphone level during Record Slide Show / narration capture.
 */
async function mountRecordShowOverlay(doc, opts) {
    const draggable = opts?.draggable !== false;
    const externalCamera = opts?.cameraStream != null;
    const openCamera = opts?.openCamera !== false && opts?.cameraStream !== null;
    const prefs = loadPipPreferences();
    let mirror = prefs.mirror ?? opts?.mirrorCamera !== false;
    let pipSize = prefs.size ?? "m";
    let pipCorner = prefs.corner ?? "br";
    let camVisible = prefs.cameraVisible !== false;
    let camStream = null;
    let micMuted = prefs.micMuted === true;
    let audioTrack = opts?.audioStream?.getAudioTracks()[0] ?? null;
    const root = doc.createElement("div");
    root.style.cssText =
        "position:fixed;inset:0;z-index:var(--z-overlay, 1500);pointer-events:none;overflow:hidden";
    const stopBar = doc.createElement("div");
    stopBar.style.cssText =
        "position:fixed;top:12px;right:12px;display:flex;align-items:center;gap:6px;pointer-events:auto;background:color-mix(in srgb, var(--popover) 88%, transparent);color:var(--muted-foreground);border:1px solid var(--border);border-radius:999px;padding:3px 4px 3px 10px;font:11px var(--font-sans,system-ui,sans-serif)";
    const stopLabel = doc.createElement("span");
    stopLabel.textContent = (0, i18n_1.t)("recordOverlay.recording");
    const stopBtn = doc.createElement("button");
    stopBtn.type = "button";
    stopBtn.textContent = (0, i18n_1.t)("recordOverlay.stop");
    stopBtn.title = (0, i18n_1.t)("recordOverlay.recordingHint");
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
    const mirrorBtn = mkIconBtn(doc, "⇄", (0, i18n_1.t)("recordOverlay.mirror"));
    const camBtn = mkIconBtn(doc, "📷", (0, i18n_1.t)("recordOverlay.hideCamera"));
    const sizeBtn = mkIconBtn(doc, "S", (0, i18n_1.t)("recordOverlay.sizeCycle"));
    const cornerBtn = mkIconBtn(doc, "↘", (0, i18n_1.t)("recordOverlay.cornerCycle"));
    const copyPipBtn = mkIconBtn(doc, "⎘", (0, i18n_1.t)("recordOverlay.copyPip"));
    const copyPipCompactBtn = mkIconBtn(doc, "⎙", (0, i18n_1.t)("recordOverlay.copyPipCompact"));
    const copyWorkspaceCompactBtn = mkIconBtn(doc, "⎒", (0, i18n_1.t)("recordOverlay.copyWorkspaceCompact"));
    const copyPipReadinessBtn = mkIconBtn(doc, "✓", (0, i18n_1.t)("recordOverlay.copyPipReadiness"));
    const copyPipBreakdownBtn = mkIconBtn(doc, "▤", (0, i18n_1.t)("recordOverlay.copyPipBreakdown"));
    const copyPipCornerBreakdownBtn = mkIconBtn(doc, "▦", (0, i18n_1.t)("recordOverlay.copyPipCornerBreakdown"));
    const copyPipSpreadBtn = mkIconBtn(doc, "↔", (0, i18n_1.t)("recordOverlay.copyPipSpread"));
    const largestPipBtn = mkIconBtn(doc, "⤢", (0, i18n_1.t)("recordOverlay.applyLargestPip"));
    const smallestPipBtn = mkIconBtn(doc, "⤡", (0, i18n_1.t)("recordOverlay.applySmallestPip"));
    const largestCornerBtn = mkIconBtn(doc, "⌖", (0, i18n_1.t)("recordOverlay.applyLargestCorner"));
    const resetPipBtn = mkIconBtn(doc, "↺", (0, i18n_1.t)("recordOverlay.resetPip"));
    const micBtn = opts?.audioStream ? mkIconBtn(doc, "🎤", (0, i18n_1.t)("recordOverlay.muteMic")) : null;
    toolbar.append(mirrorBtn, camBtn, sizeBtn, cornerBtn, largestPipBtn, smallestPipBtn, largestCornerBtn, (0, ui_style_1.createDevOnlyToolbar)(doc, copyPipBtn, copyPipCompactBtn, copyPipReadinessBtn, copyPipBreakdownBtn, copyPipCornerBreakdownBtn, copyPipSpreadBtn, copyWorkspaceCompactBtn), resetPipBtn);
    if (micBtn)
        toolbar.appendChild(micBtn);
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
    const currentPipPrefs = () => ({
        ...loadPipPreferences(),
        size: pipSize,
        corner: pipCorner,
        mirror,
        cameraVisible: camVisible,
        micMuted,
    });
    const syncPipStats = () => {
        const prefs = currentPipPrefs();
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        pipStats.textContent = `${(0, record_meta_1.formatPipReadinessLine)(canvasW, canvasH, prefs)} · ${(0, record_meta_1.formatPipCoverageLine)(canvasW, canvasH, prefs)}`;
        pipSpreadStats.textContent = `${(0, record_meta_1.formatPipCoverageSpreadLine)(canvasW, canvasH, pipCorner)} · ${(0, record_meta_1.formatPipCornerCoverageBreakdownLine)(canvasW, canvasH, pipSize)}`;
    };
    const applyPipSize = () => {
        const w = exports.PIP_WIDTH_PX[pipSize];
        video.style.width = `min(${w}px,28vw)`;
        const label = pipSize === "s" ? "S" : pipSize === "l" ? "L" : "M";
        sizeBtn.textContent = label;
        sizeBtn.title =
            pipSize === "s"
                ? (0, i18n_1.t)("recordOverlay.sizeSmall")
                : pipSize === "l"
                    ? (0, i18n_1.t)("recordOverlay.sizeLarge")
                    : (0, i18n_1.t)("recordOverlay.sizeMedium");
        sizeBtn.style.background = pipSize === "m" ? ui_style_1.OVERLAY_ICON_BTN_BG_ACTIVE : ui_style_1.OVERLAY_ICON_BTN_BG;
        savePipPreferences({ ...loadPipPreferences(), size: pipSize, mirror, corner: pipCorner });
        syncPipStats();
    };
    applyPipSize();
    const cornerGlyph = { br: "↘", bl: "↙", tr: "↗", tl: "↖" };
    let dragOffX = 0;
    let dragOffY = 0;
    let dragging = false;
    const placePanel = (x, y, persist = false) => {
        const rect = pipPanel.getBoundingClientRect();
        const clamped = clampOverlayPosition(x, y, rect.width || exports.PIP_WIDTH_PX[pipSize], rect.height || 160);
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
    const syncCornerBtn = () => {
        cornerBtn.textContent = cornerGlyph[pipCorner];
        cornerBtn.title = (0, i18n_1.t)(`recordOverlay.corner.${pipCorner}`);
        cornerBtn.style.background = pipCorner === "br" ? ui_style_1.OVERLAY_ICON_BTN_BG_ACTIVE : ui_style_1.OVERLAY_ICON_BTN_BG;
    };
    syncCornerBtn();
    const snapToCorner = () => {
        const rect = pipPanel.getBoundingClientRect();
        const pos = defaultPipOverlayPosition(pipCorner, rect.width || exports.PIP_WIDTH_PX[pipSize], rect.height || 160);
        placePanel(pos.x, pos.y, true);
    };
    const persistPip = (patch) => {
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
        void (0, insert_meta_1.copyTextToClipboard)((0, record_meta_1.exportPipPreferencesText)(currentPipPrefs(), {
            overlayPosition: { x: rect.left, y: rect.top },
        }));
    });
    copyPipCompactBtn.addEventListener("click", () => {
        const rect = pipPanel.getBoundingClientRect();
        void (0, insert_meta_1.copyTextToClipboard)((0, record_meta_1.exportPipPreferencesCompactText)(currentPipPrefs(), {
            overlayPosition: { x: rect.left, y: rect.top },
        }));
    });
    copyWorkspaceCompactBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        void (0, insert_meta_1.copyTextToClipboard)((0, record_meta_1.exportRecordWorkspaceCompactText)({
            mode: "screen-camera",
            pipPrefs: currentPipPrefs(),
            compositeSize: { w: canvasW, h: canvasH },
        }));
    });
    copyPipReadinessBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        void (0, insert_meta_1.copyTextToClipboard)((0, record_meta_1.exportPipReadinessText)(canvasW, canvasH, currentPipPrefs()));
    });
    copyPipBreakdownBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        void (0, insert_meta_1.copyTextToClipboard)((0, record_meta_1.exportPipSizeCoverageBreakdownText)(canvasW, canvasH, pipCorner));
    });
    copyPipCornerBreakdownBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        void (0, insert_meta_1.copyTextToClipboard)((0, record_meta_1.exportPipCornerCoverageBreakdownText)(canvasW, canvasH, pipSize));
    });
    copyPipSpreadBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        void (0, insert_meta_1.copyTextToClipboard)((0, record_meta_1.exportPipCoverageSpreadText)(canvasW, canvasH, pipCorner));
    });
    largestPipBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        pipSize = (0, record_meta_1.pipSizeWithLargestCoverage)(canvasW, canvasH, pipCorner);
        applyPipSize();
        snapToCorner();
    });
    smallestPipBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        pipSize = (0, record_meta_1.pipSizeWithSmallestCoverage)(canvasW, canvasH, pipCorner);
        applyPipSize();
        snapToCorner();
    });
    largestCornerBtn.addEventListener("click", () => {
        const canvasW = doc.defaultView?.innerWidth ?? 1280;
        const canvasH = doc.defaultView?.innerHeight ?? 720;
        pipCorner = (0, record_meta_1.pipCornerWithLargestCoverage)(canvasW, canvasH, pipSize);
        syncCornerBtn();
        persistPip({ corner: pipCorner });
        snapToCorner();
    });
    resetPipBtn.addEventListener("click", () => {
        resetPipPreferences();
        const defaults = exports.DEFAULT_PIP_PREFERENCES;
        pipSize = defaults.size;
        pipCorner = defaults.corner;
        mirror = defaults.mirror;
        camVisible = defaults.cameraVisible;
        micMuted = defaults.micMuted;
        applyPipSize();
        syncCornerBtn();
        syncMirror();
        mirrorBtn.style.background = mirror ? ui_style_1.OVERLAY_ICON_BTN_BG_ACTIVE : ui_style_1.OVERLAY_ICON_BTN_BG;
        setCameraVisible(camVisible);
        if (micBtn && audioTrack) {
            audioTrack.enabled = !micMuted;
            micBtn.textContent = micMuted ? "🔇" : "🎤";
            micBtn.title = micMuted ? (0, i18n_1.t)("recordOverlay.unmuteMic") : (0, i18n_1.t)("recordOverlay.muteMic");
            micBtn.style.background = micMuted ? ui_style_1.OVERLAY_ICON_BTN_BG_DANGER : ui_style_1.OVERLAY_ICON_BTN_BG;
            micDot.textContent = micMuted ? "🔇" : "🎤";
        }
        snapToCorner();
        syncPipStats();
    });
    doc.body.appendChild(root);
    syncPipStats();
    const syncMirror = () => {
        video.style.transform = mirror ? "scaleX(-1)" : "";
    };
    syncMirror();
    mirrorBtn.addEventListener("click", () => {
        mirror = !mirror;
        syncMirror();
        mirrorBtn.style.background = mirror ? ui_style_1.OVERLAY_ICON_BTN_BG_ACTIVE : ui_style_1.OVERLAY_ICON_BTN_BG;
        persistPip({ mirror });
    });
    mirrorBtn.style.background = mirror ? ui_style_1.OVERLAY_ICON_BTN_BG_ACTIVE : ui_style_1.OVERLAY_ICON_BTN_BG;
    const setCameraVisible = (on) => {
        camVisible = on;
        videoWrap.style.display = on ? "" : "none";
        camBtn.textContent = on ? "📷" : "🚫";
        camBtn.title = on ? (0, i18n_1.t)("recordOverlay.hideCamera") : (0, i18n_1.t)("recordOverlay.showCamera");
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
        }
        else {
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
        const onMove = (clientX, clientY) => {
            placePanel(clientX - dragOffX, clientY - dragOffY);
        };
        videoWrap.addEventListener("pointerdown", (e) => {
            if (e.button !== 0)
                return;
            dragging = true;
            videoWrap.style.cursor = "grabbing";
            const rect = pipPanel.getBoundingClientRect();
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
            videoWrap.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        videoWrap.addEventListener("pointermove", (e) => {
            if (!dragging)
                return;
            onMove(e.clientX, e.clientY);
        });
        const endDrag = (e) => {
            if (!dragging)
                return;
            dragging = false;
            videoWrap.style.cursor = "grab";
            const rect = pipPanel.getBoundingClientRect();
            placePanel(rect.left, rect.top, true);
            try {
                videoWrap.releasePointerCapture(e.pointerId);
            }
            catch {
                // ignore
            }
        };
        videoWrap.addEventListener("pointerup", endDrag);
        videoWrap.addEventListener("pointercancel", endDrag);
    }
    if (typeof prefs.x === "number" && typeof prefs.y === "number") {
        placePanel(prefs.x, prefs.y);
    }
    else {
        snapToCorner();
    }
    let raf = 0;
    let audioCtx = null;
    let analyser = null;
    const stopMeter = () => {
        if (raf)
            cancelAnimationFrame(raf);
        raf = 0;
        audioCtx?.close().catch(() => undefined);
        audioCtx = null;
        analyser = null;
    };
    const startMeter = (stream) => {
        stopMeter();
        const track = stream.getAudioTracks()[0];
        if (!track)
            return;
        try {
            audioCtx = new AudioContext();
            const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            src.connect(analyser);
            const buf = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
                if (!analyser)
                    return;
                analyser.getByteFrequencyData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++)
                    sum += buf[i];
                const level = Math.min(100, (sum / buf.length / 128) * 100);
                micFill.style.width = `${level}%`;
                raf = requestAnimationFrame(tick);
            };
            tick();
        }
        catch {
            // ignore WebAudio failures
        }
    };
    if (opts?.audioStream)
        startMeter(opts.audioStream);
    if (micBtn && audioTrack) {
        if (micMuted) {
            audioTrack.enabled = false;
            micBtn.textContent = "🔇";
            micBtn.title = (0, i18n_1.t)("recordOverlay.unmuteMic");
            micBtn.style.background = ui_style_1.OVERLAY_ICON_BTN_BG_DANGER;
            micDot.textContent = "🔇";
        }
        micBtn.addEventListener("click", () => {
            micMuted = !micMuted;
            audioTrack.enabled = !micMuted;
            micBtn.textContent = micMuted ? "🔇" : "🎤";
            micBtn.title = micMuted ? (0, i18n_1.t)("recordOverlay.unmuteMic") : (0, i18n_1.t)("recordOverlay.muteMic");
            micBtn.style.background = micMuted ? ui_style_1.OVERLAY_ICON_BTN_BG_DANGER : ui_style_1.OVERLAY_ICON_BTN_BG;
            micDot.textContent = micMuted ? "🔇" : "🎤";
            if (micMuted)
                micFill.style.width = "0%";
            persistPip({ micMuted });
        });
    }
    try {
        if (externalCamera && opts?.cameraStream) {
            camStream = opts.cameraStream;
            video.srcObject = camStream;
            await video.play().catch(() => undefined);
            if (!camVisible)
                setCameraVisible(false);
        }
        else if (openCamera && navigator.mediaDevices?.getUserMedia) {
            camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
            video.srcObject = camStream;
            await video.play().catch(() => undefined);
            if (!camVisible) {
                camStream.getVideoTracks().forEach((tr) => {
                    tr.enabled = false;
                });
                setCameraVisible(false);
            }
        }
        else {
            setCameraVisible(false);
        }
    }
    catch {
        setCameraVisible(false);
        toolbar.style.display = "none";
    }
    return {
        destroy() {
            stopMeter();
            if (!externalCamera)
                camStream?.getTracks().forEach((tr) => tr.stop());
            camStream = null;
            root.remove();
        },
        getCameraStream() {
            return camStream;
        },
        isCameraVisible() {
            return camVisible && !!camStream;
        },
    };
}
