import { bindEditorModal } from "./dialog";
import { t } from "./i18n";
import { copyTextToClipboard } from "./insert-meta";
import {
  exportNarrationReadinessText,
  exportNarrationRehearseBreakdownText,
  exportNarrationSessionCompactText,
  exportNarrationSessionText,
  formatNarrationReadinessLine,
  isLargeRecording,
} from "./record-meta";
import { DIALOG_OVERLAY_CSS, createDevOnlyActionSelect } from "./ui-style";
import {
  downloadBlob,
  ensureExportRecordingBlob,
  formatRecordingDuration,
  formatRecordingFileSize,
  isAudioRecordingBlob,
  suggestedRecordingFilename,
} from "./video-export";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Shown after Record Slide Show — download narration or insert as audio on the deck. */
export function openNarrationCompleteDialog(
  doc: Document,
  blob: Blob,
  onInsert: (dataUrl: string, duration?: number) => void,
  opts?: {
    rehearse?: { slideCount: number; totalSeconds: number };
  },
): void {
  const isAudio = isAudioRecordingBlob(blob);
  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText =
    DIALOG_OVERLAY_CSS;
  let modalDismiss: { release: () => void } | undefined;

  const modal = doc.createElement("div");
  modal.style.cssText =
    "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(440px,92vw);display:flex;flex-direction:column;gap:10px";

  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.textContent = t("narrationComplete.title");
  modal.appendChild(title);

  const summary = doc.createElement("p");
  summary.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
  summary.textContent = t("narrationComplete.summary", {
    size: (blob.size / (1024 * 1024)).toFixed(1),
  });
  modal.appendChild(summary);

  if (opts?.rehearse && opts.rehearse.slideCount > 0) {
    const rehearseEl = doc.createElement("p");
    rehearseEl.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    rehearseEl.textContent = t("narrationComplete.rehearseSummary", {
      slides: opts.rehearse.slideCount,
      time: formatRecordingDuration(opts.rehearse.totalSeconds),
    });
    modal.appendChild(rehearseEl);
  }

  const durationEl = doc.createElement("p");
  durationEl.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
  modal.appendChild(durationEl);

  const readinessLine = doc.createElement("p");
  readinessLine.style.cssText = "margin:0;font-size:11px;color:var(--muted-foreground,#a1a1aa);line-height:1.35";
  readinessLine.textContent = formatNarrationReadinessLine({ bytes: blob.size, rehearse: opts?.rehearse });
  modal.appendChild(readinessLine);

  const status = doc.createElement("div");
  status.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa);min-height:14px";
  modal.appendChild(status);

  const preview = isAudio ? doc.createElement("audio") : doc.createElement("video");
  preview.controls = true;
  preview.style.width = "100%";
  const url = URL.createObjectURL(blob);
  preview.src = url;
  let mediaDuration: number | undefined;
  preview.addEventListener("loadedmetadata", () => {
    const media = preview as HTMLMediaElement;
    if (media.duration && Number.isFinite(media.duration)) {
      mediaDuration = media.duration;
      durationEl.textContent = t("narrationComplete.duration", {
        time: formatRecordingDuration(media.duration),
      });
      readinessLine.textContent = formatNarrationReadinessLine({
        bytes: blob.size,
        durationSec: mediaDuration,
        rehearse: opts?.rehearse,
      });
    }
  });

  const footer = doc.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap";

  const close = (): void => {
    modalDismiss?.release();
    URL.revokeObjectURL(url);
    overlay.remove();
  };

  const dumpCopy = async (text: string): Promise<void> => {
    if (!(await copyTextToClipboard(text))) throw new Error("copy failed");
  };
  const dumpActions = [
    {
      label: t("narrationComplete.copySummary"),
      run: () =>
        dumpCopy(
          exportNarrationSessionText({
            bytes: blob.size,
            durationSec: mediaDuration,
            mime: blob.type,
            rehearse: opts?.rehearse,
          }),
        ),
    },
    {
      label: t("narrationComplete.copyCompact"),
      run: () =>
        dumpCopy(
          exportNarrationSessionCompactText({
            bytes: blob.size,
            durationSec: mediaDuration,
            mime: blob.type,
            rehearse: opts?.rehearse,
          }),
        ),
    },
    {
      label: t("narrationComplete.copyReadiness"),
      run: () =>
        dumpCopy(
          exportNarrationReadinessText({
            bytes: blob.size,
            durationSec: mediaDuration,
            mime: blob.type,
            rehearse: opts?.rehearse,
          }),
        ),
    },
  ];
  if (opts?.rehearse && opts.rehearse.slideCount > 0) {
    dumpActions.push({
      label: t("narrationComplete.copyRehearseBreakdown"),
      run: () => dumpCopy(exportNarrationRehearseBreakdownText(opts?.rehearse)),
    });
  }

  const downloadBtn = doc.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.textContent = isAudio
    ? t("narrationComplete.downloadAudio")
    : t("narrationComplete.download");
  downloadBtn.style.cssText =
    "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
  downloadBtn.addEventListener("click", async () => {
    downloadBtn.disabled = true;
    const prev = status.textContent;
    status.textContent = isAudio ? t("record.convertingM4a") : t("record.convertingMp4");
    try {
      const { blob: out, ext } = await ensureExportRecordingBlob(blob);
      downloadBlob(doc, out, suggestedRecordingFilename("narration", ext));
      if (ext === "webm" || ext === "ogg") {
        status.textContent = isAudio ? t("record.m4aFallback") : t("record.mp4Fallback");
      } else status.textContent = prev;
    } catch (e) {
      status.textContent = t("record.error", { msg: (e as Error).message });
    } finally {
      downloadBtn.disabled = false;
    }
  });

  const insertBtn = doc.createElement("button");
  insertBtn.type = "button";
  insertBtn.textContent = t("narrationComplete.insert");
  insertBtn.style.cssText =
    "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
  insertBtn.addEventListener("click", async () => {
    insertBtn.disabled = true;
    try {
      if (isLargeRecording(blob.size)) {
        const ok = globalThis.confirm?.(
          t("record.largeConfirm", { size: formatRecordingFileSize(blob.size) }),
        );
        if (ok === false) {
          insertBtn.disabled = false;
          return;
        }
      }
      const dataUrl = await blobToDataUrl(blob);
      const duration = await new Promise<number | undefined>((resolve) => {
        const a = doc.createElement("audio");
        a.preload = "metadata";
        a.onloadedmetadata = () => resolve(a.duration);
        a.onerror = () => resolve(undefined);
        a.src = dataUrl;
      });
      onInsert(dataUrl, duration);
      close();
    } catch {
      insertBtn.disabled = false;
    }
  });

  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = t("narrationComplete.close");
  dismiss.style.cssText =
    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
  dismiss.addEventListener("click", close);

  footer.append(
    createDevOnlyActionSelect(doc, t("developer.dumpMenu"), dumpActions),
    downloadBtn,
    insertBtn,
    dismiss,
  );
  modal.append(preview, footer);
  overlay.appendChild(modal);
  modalDismiss = bindEditorModal({ doc, overlay, panel: modal, onCancel: close });
  doc.body.appendChild(overlay);
}
