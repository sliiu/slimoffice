"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openNarrationCompleteDialog = openNarrationCompleteDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const insert_meta_1 = require("./insert-meta");
const record_meta_1 = require("./record-meta");
const ui_style_1 = require("./ui-style");
const video_export_1 = require("./video-export");
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
/** Shown after Record Slide Show — download narration or insert as audio on the deck. */
function openNarrationCompleteDialog(doc, blob, onInsert, opts) {
    const isAudio = (0, video_export_1.isAudioRecordingBlob)(blob);
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    let modalDismiss;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(440px,92vw);display:flex;flex-direction:column;gap:10px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("narrationComplete.title");
    modal.appendChild(title);
    const summary = doc.createElement("p");
    summary.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    summary.textContent = (0, i18n_1.t)("narrationComplete.summary", {
        size: (blob.size / (1024 * 1024)).toFixed(1),
    });
    modal.appendChild(summary);
    if (opts?.rehearse && opts.rehearse.slideCount > 0) {
        const rehearseEl = doc.createElement("p");
        rehearseEl.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
        rehearseEl.textContent = (0, i18n_1.t)("narrationComplete.rehearseSummary", {
            slides: opts.rehearse.slideCount,
            time: (0, video_export_1.formatRecordingDuration)(opts.rehearse.totalSeconds),
        });
        modal.appendChild(rehearseEl);
    }
    const durationEl = doc.createElement("p");
    durationEl.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    modal.appendChild(durationEl);
    const readinessLine = doc.createElement("p");
    readinessLine.style.cssText = "margin:0;font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.35";
    readinessLine.textContent = (0, record_meta_1.formatNarrationReadinessLine)({ bytes: blob.size, rehearse: opts?.rehearse });
    modal.appendChild(readinessLine);
    const status = doc.createElement("div");
    status.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa);min-height:14px";
    modal.appendChild(status);
    const preview = isAudio ? doc.createElement("audio") : doc.createElement("video");
    preview.controls = true;
    preview.style.width = "100%";
    const url = URL.createObjectURL(blob);
    preview.src = url;
    let mediaDuration;
    preview.addEventListener("loadedmetadata", () => {
        const media = preview;
        if (media.duration && Number.isFinite(media.duration)) {
            mediaDuration = media.duration;
            durationEl.textContent = (0, i18n_1.t)("narrationComplete.duration", {
                time: (0, video_export_1.formatRecordingDuration)(media.duration),
            });
            readinessLine.textContent = (0, record_meta_1.formatNarrationReadinessLine)({
                bytes: blob.size,
                durationSec: mediaDuration,
                rehearse: opts?.rehearse,
            });
        }
    });
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";
    const close = () => {
        modalDismiss?.release();
        URL.revokeObjectURL(url);
        overlay.remove();
    };
    const dumpCopy = async (text) => {
        if (!(await (0, insert_meta_1.copyTextToClipboard)(text)))
            throw new Error("copy failed");
    };
    const dumpActions = [
        {
            label: (0, i18n_1.t)("narrationComplete.copySummary"),
            run: () => dumpCopy((0, record_meta_1.exportNarrationSessionText)({
                bytes: blob.size,
                durationSec: mediaDuration,
                mime: blob.type,
                rehearse: opts?.rehearse,
            })),
        },
        {
            label: (0, i18n_1.t)("narrationComplete.copyCompact"),
            run: () => dumpCopy((0, record_meta_1.exportNarrationSessionCompactText)({
                bytes: blob.size,
                durationSec: mediaDuration,
                mime: blob.type,
                rehearse: opts?.rehearse,
            })),
        },
        {
            label: (0, i18n_1.t)("narrationComplete.copyReadiness"),
            run: () => dumpCopy((0, record_meta_1.exportNarrationReadinessText)({
                bytes: blob.size,
                durationSec: mediaDuration,
                mime: blob.type,
                rehearse: opts?.rehearse,
            })),
        },
    ];
    if (opts?.rehearse && opts.rehearse.slideCount > 0) {
        dumpActions.push({
            label: (0, i18n_1.t)("narrationComplete.copyRehearseBreakdown"),
            run: () => dumpCopy((0, record_meta_1.exportNarrationRehearseBreakdownText)(opts?.rehearse)),
        });
    }
    const downloadBtn = doc.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = isAudio
        ? (0, i18n_1.t)("narrationComplete.downloadAudio")
        : (0, i18n_1.t)("narrationComplete.download");
    downloadBtn.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    downloadBtn.addEventListener("click", async () => {
        downloadBtn.disabled = true;
        const prev = status.textContent;
        status.textContent = isAudio ? (0, i18n_1.t)("record.convertingM4a") : (0, i18n_1.t)("record.convertingMp4");
        try {
            const { blob: out, ext } = await (0, video_export_1.ensureExportRecordingBlob)(blob);
            (0, video_export_1.downloadBlob)(doc, out, (0, video_export_1.suggestedRecordingFilename)("narration", ext));
            if (ext === "webm" || ext === "ogg") {
                status.textContent = isAudio ? (0, i18n_1.t)("record.m4aFallback") : (0, i18n_1.t)("record.mp4Fallback");
            }
            else
                status.textContent = prev;
        }
        catch (e) {
            status.textContent = (0, i18n_1.t)("record.error", { msg: e.message });
        }
        finally {
            downloadBtn.disabled = false;
        }
    });
    const insertBtn = doc.createElement("button");
    insertBtn.type = "button";
    insertBtn.textContent = (0, i18n_1.t)("narrationComplete.insert");
    insertBtn.style.cssText =
        "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    insertBtn.addEventListener("click", async () => {
        insertBtn.disabled = true;
        try {
            if ((0, record_meta_1.isLargeRecording)(blob.size)) {
                const ok = globalThis.confirm?.((0, i18n_1.t)("record.largeConfirm", { size: (0, video_export_1.formatRecordingFileSize)(blob.size) }));
                if (ok === false) {
                    insertBtn.disabled = false;
                    return;
                }
            }
            const dataUrl = await blobToDataUrl(blob);
            const duration = await new Promise((resolve) => {
                const a = doc.createElement("audio");
                a.preload = "metadata";
                a.onloadedmetadata = () => resolve(a.duration);
                a.onerror = () => resolve(undefined);
                a.src = dataUrl;
            });
            onInsert(dataUrl, duration);
            close();
        }
        catch {
            insertBtn.disabled = false;
        }
    });
    const dismiss = doc.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = (0, i18n_1.t)("narrationComplete.close");
    dismiss.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
    dismiss.addEventListener("click", close);
    footer.append((0, ui_style_1.createDevOnlyActionSelect)(doc, (0, i18n_1.t)("developer.dumpMenu"), dumpActions), downloadBtn, insertBtn, dismiss);
    modal.append(preview, footer);
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: close });
    doc.body.appendChild(overlay);
}
