import { showDialog } from "./dialog";
import { t } from "./i18n";
import type { InkOcrResult } from "./ink-ocr";
import { inkOcrConfidenceLevel } from "./ink-ocr";
import type { PaddleLoadProgress } from "./ink-ocr-paddle";

export interface InkOcrDialogResult {
  text: string;
}

export interface InkOcrModelDialogHandlers {
  /** Combined download size in bytes, for the consent copy. */
  approxBytes: number;
  /** Starts the download + init, reporting progress; resolves when the model is ready. */
  load: (onProgress: (p: PaddleLoadProgress) => void) => Promise<void>;
  /**
   * Skip the consent step and begin loading immediately (progress still shown).
   * Set when the user already consented in a previous session.
   */
  autoStart?: boolean;
}

function formatMb(bytes: number, decimals = 0): string {
  return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
}

function primaryBtnCss(): string {
  return [
    "background:var(--primary)",
    "color:var(--primary-foreground)",
    "border:1px solid var(--primary)",
    "border-radius:var(--radius-md)",
    "padding:6px 16px",
    "cursor:pointer",
    "font:inherit",
    "font-weight:500",
  ].join(";");
}

function secondaryBtnCss(): string {
  return [
    "background:transparent",
    "color:var(--foreground)",
    "border:1px solid var(--input)",
    "border-radius:var(--radius-md)",
    "padding:6px 16px",
    "cursor:pointer",
    "font:inherit",
  ].join(";");
}

/**
 * Consent + progress dialog for the one-time on-device model download.
 * Resolves true once the model is loaded, false/null if the user declines.
 */
export function openInkOcrModelDialog(
  doc: Document,
  handlers: InkOcrModelDialogHandlers,
): Promise<boolean | null> {
  return showDialog<boolean>(doc, {
    title: t("dialog.inkOcrModel.title"),
    width: 460,
    okLabel: "",
    buildBody: (body, ctx) => {
      const auto = handlers.autoStart === true;

      const desc = doc.createElement("p");
      desc.textContent = auto
        ? t("dialog.inkOcrModel.descReturning")
        : t("dialog.inkOcrModel.desc", { size: formatMb(handlers.approxBytes) });
      desc.style.cssText = "margin:0 0 10px;font-size:13px;line-height:1.5;color:var(--foreground)";
      body.appendChild(desc);

      const note = doc.createElement("p");
      note.textContent = t("dialog.inkOcrModel.note");
      note.style.cssText = "margin:0 0 14px;font-size:11px;line-height:1.5;color:var(--muted-foreground)";
      // On a returning session the model is usually HTTP-cached, so the offline note
      // is less relevant; hide it to keep the auto-start dialog minimal.
      if (auto) note.style.display = "none";
      body.appendChild(note);

      const progWrap = doc.createElement("div");
      progWrap.style.cssText = "display:none;margin-bottom:14px";
      const bar = doc.createElement("div");
      bar.style.cssText = "height:8px;border-radius:999px;background:var(--secondary);overflow:hidden";
      const fill = doc.createElement("div");
      fill.style.cssText = "height:100%;width:0%;background:var(--primary);transition:width .15s ease";
      bar.appendChild(fill);
      const status = doc.createElement("div");
      status.style.cssText = "margin-top:6px;font-size:11px;color:var(--muted-foreground)";
      progWrap.append(bar, status);
      body.appendChild(progWrap);

      const row = doc.createElement("div");
      row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
      const cancelBtn = doc.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = t("dialog.cancel");
      cancelBtn.style.cssText = secondaryBtnCss();
      cancelBtn.addEventListener("click", () => ctx.close(false));
      const okBtn = doc.createElement("button");
      okBtn.type = "button";
      okBtn.textContent = t("dialog.inkOcrModel.download");
      okBtn.style.cssText = primaryBtnCss();
      row.append(cancelBtn);
      if (!auto) row.append(okBtn);
      body.appendChild(row);

      let started = false;
      const start = (): void => {
        if (started) return;
        started = true;
        okBtn.disabled = true;
        okBtn.style.opacity = "0.5";
        okBtn.style.cursor = "default";
        progWrap.style.display = "block";
        status.textContent = t("dialog.inkOcrModel.starting");
        void (async () => {
          try {
            await handlers.load((p) => {
              const pct = p.total > 0 ? Math.round(p.fraction * 100) : 0;
              fill.style.width = `${pct}%`;
              if (p.total > 0 && p.loaded >= p.total) {
                status.textContent = t("dialog.inkOcrModel.initializing");
              } else if (p.total > 0) {
                status.textContent = t("dialog.inkOcrModel.progress", {
                  done: formatMb(p.loaded, 1),
                  total: formatMb(p.total),
                  pct,
                });
              } else {
                status.textContent = t("dialog.inkOcrModel.progressUnknown", { done: formatMb(p.loaded, 1) });
              }
            });
            ctx.close(true);
          } catch {
            started = false;
            okBtn.disabled = false;
            okBtn.style.opacity = "1";
            okBtn.style.cursor = "pointer";
            okBtn.textContent = t("dialog.inkOcrModel.retry");
            // In auto-start mode the download button was not rendered — surface it now
            // so the user can retry after a failure.
            if (!okBtn.isConnected) row.append(okBtn);
            fill.style.width = "0%";
            status.textContent = t("dialog.inkOcrModel.error");
          }
        })();
      };
      okBtn.addEventListener("click", start);
      if (auto) start();
    },
  });
}

export interface InkOcrDialogOptions {
  /**
   * AI 手写识别（云端视觉模型）。仅当宿主注入时才渲染「AI 识别」按钮 —— AI 是
   * 用户显式触发的可选项，而非默认路径（本地 PaddleOCR 已先跑过）。返回 null /
   * 抛错时保留当前本地结果。
   */
  recognizeWithAi?: () => Promise<InkOcrResult | null>;
}

const CONFIDENCE_COLOR: Record<ReturnType<typeof inkOcrConfidenceLevel>, string> = {
  high: "#16a34a",
  medium: "#ca8a04",
  low: "#dc2626",
};

export function openInkOcrDialog(
  doc: Document,
  ocr: InkOcrResult,
  options: InkOcrDialogOptions = {},
): Promise<InkOcrDialogResult | null> {
  return showDialog<InkOcrDialogResult>(doc, {
    title: t("dialog.inkOcr.title"),
    width: 440,
    okLabel: t("dialog.inkOcr.apply"),
    buildBody: (body) => {
      let current = ocr;
      // Recreated on every render(); the getResult closure reads the live ref.
      let textarea: HTMLTextAreaElement | null = null;

      // ---- AI 识别按钮（可选，显式触发）----
      if (options.recognizeWithAi) {
        const aiRow = doc.createElement("div");
        aiRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap";
        const aiBtn = doc.createElement("button");
        aiBtn.type = "button";
        aiBtn.textContent = t("dialog.inkOcr.tryAi");
        aiBtn.style.cssText = [
          "background:var(--secondary)",
          "color:var(--foreground)",
          "border:1px solid var(--border)",
          "border-radius:6px",
          "padding:6px 14px",
          "cursor:pointer",
          "font:inherit",
        ].join(";");
        const aiNote = doc.createElement("span");
        aiNote.style.cssText = "font-size:11px;color:var(--muted-foreground)";
        aiNote.textContent = t("dialog.inkOcr.aiHint");
        aiBtn.addEventListener("click", () => {
          const run = options.recognizeWithAi;
          if (!run || aiBtn.disabled) return;
          aiBtn.disabled = true;
          aiBtn.style.opacity = "0.5";
          aiBtn.style.cursor = "default";
          aiNote.textContent = t("dialog.inkOcr.aiWorking");
          void (async () => {
            try {
              const res = await run();
              if (res && res.text.trim()) {
                current = res;
                render(current);
                aiNote.textContent = t("dialog.inkOcr.aiHint");
              } else {
                aiNote.textContent = t("dialog.inkOcr.aiEmpty");
              }
            } catch {
              aiNote.textContent = t("dialog.inkOcr.aiFailed");
            } finally {
              aiBtn.disabled = false;
              aiBtn.style.opacity = "1";
              aiBtn.style.cursor = "pointer";
            }
          })();
        });
        aiRow.append(aiBtn, aiNote);
        body.appendChild(aiRow);
      }

      // ---- 结果区（引擎 / 预览 / 置信度 / 文本框），可被 AI 重新识别后原地刷新 ----
      const resultHost = doc.createElement("div");
      body.appendChild(resultHost);

      function render(o: InkOcrResult): void {
        resultHost.textContent = "";

        const meta = doc.createElement("div");
        meta.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 12px;margin-bottom:10px;font-size:12px";
        const strokes = doc.createElement("span");
        strokes.textContent = t(
          o.scope === "selected" ? "dialog.inkOcr.strokesSelected" : "dialog.inkOcr.strokesAll",
          { n: String(o.strokeCount) },
        );
        const engine = doc.createElement("span");
        engine.style.color = "var(--muted-foreground)";
        engine.textContent = t(
          o.engine === "vision"
            ? "dialog.inkOcr.engineVision"
            : o.engine === "paddle"
              ? "dialog.inkOcr.enginePaddle"
              : "dialog.inkOcr.engineTesseract",
        );
        meta.append(strokes, engine);
        resultHost.appendChild(meta);

        if (o.previewDataUrl) {
          const previewLbl = doc.createElement("p");
          previewLbl.textContent = t("dialog.inkOcr.preview");
          previewLbl.style.cssText = "margin:0 0 6px;font-size:11px;color:var(--muted-foreground)";
          const img = doc.createElement("img");
          img.src = o.previewDataUrl;
          img.alt = t("dialog.inkOcr.preview");
          img.style.cssText = [
            "display:block",
            "width:100%",
            "max-height:240px",
            "object-fit:contain",
            "background:#fff",
            "border:1px solid var(--border)",
            "border-radius:6px",
            "margin-bottom:10px",
          ].join(";");
          resultHost.append(previewLbl, img);
        }

        if (o.engine === "tesseract" || o.engine === "paddle") {
          const level = inkOcrConfidenceLevel(o.confidence);
          const badge = doc.createElement("div");
          badge.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px";
          const dot = doc.createElement("span");
          dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${CONFIDENCE_COLOR[level]}`;
          const conf = doc.createElement("span");
          conf.textContent = t("dialog.inkOcr.confidence", { n: Math.round(o.confidence) });
          conf.style.color = CONFIDENCE_COLOR[level];
          badge.append(dot, conf);
          resultHost.appendChild(badge);
          if (level === "low") {
            const warn = doc.createElement("p");
            warn.textContent = t("dialog.inkOcr.lowConfidence");
            warn.style.cssText = "margin:0 0 10px;font-size:11px;color:var(--muted-foreground)";
            resultHost.appendChild(warn);
          }
        }

        if (!o.text.trim()) {
          const empty = doc.createElement("p");
          empty.textContent = t("dialog.inkOcr.emptyHint");
          empty.style.cssText = "margin:0 0 8px;font-size:11px;color:var(--muted-foreground)";
          resultHost.appendChild(empty);
        }

        const langNote = doc.createElement("p");
        langNote.textContent = t("dialog.inkOcr.langNote", { lang: o.lang });
        langNote.style.cssText = "margin:0 0 8px;font-size:11px;color:var(--muted-foreground)";
        resultHost.appendChild(langNote);

        const ta = doc.createElement("textarea");
        ta.value = o.text;
        ta.rows = 4;
        ta.style.cssText = [
          "width:100%",
          "box-sizing:border-box",
          "resize:vertical",
          "min-height:88px",
          "padding:8px 10px",
          "border:1px solid var(--border)",
          "border-radius:6px",
          "background:var(--background)",
          "color:var(--foreground)",
          "font:inherit",
        ].join(";");
        resultHost.appendChild(ta);
        textarea = ta;
        ta.focus();
        ta.select();
      }

      render(current);

      return () => {
        const text = (textarea?.value ?? "").replace(/\s+/g, " ").trim();
        if (!text) return null;
        return { text };
      };
    },
  });
}
