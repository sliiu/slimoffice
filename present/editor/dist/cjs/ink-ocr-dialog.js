"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openInkOcrModelDialog = openInkOcrModelDialog;
exports.openInkOcrDialog = openInkOcrDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const ink_ocr_1 = require("./ink-ocr");
function formatMb(bytes, decimals = 0) {
    return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
}
function primaryBtnCss() {
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
function secondaryBtnCss() {
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
function openInkOcrModelDialog(doc, handlers) {
    return (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("dialog.inkOcrModel.title"),
        width: 460,
        okLabel: "",
        buildBody: (body, ctx) => {
            const auto = handlers.autoStart === true;
            const desc = doc.createElement("p");
            desc.textContent = auto
                ? (0, i18n_1.t)("dialog.inkOcrModel.descReturning")
                : (0, i18n_1.t)("dialog.inkOcrModel.desc", { size: formatMb(handlers.approxBytes) });
            desc.style.cssText = "margin:0 0 10px;font-size:13px;line-height:1.5;color:var(--foreground)";
            body.appendChild(desc);
            const note = doc.createElement("p");
            note.textContent = (0, i18n_1.t)("dialog.inkOcrModel.note");
            note.style.cssText = "margin:0 0 14px;font-size:11px;line-height:1.5;color:var(--muted-foreground)";
            // On a returning session the model is usually HTTP-cached, so the offline note
            // is less relevant; hide it to keep the auto-start dialog minimal.
            if (auto)
                note.style.display = "none";
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
            cancelBtn.textContent = (0, i18n_1.t)("dialog.cancel");
            cancelBtn.style.cssText = secondaryBtnCss();
            cancelBtn.addEventListener("click", () => ctx.close(false));
            const okBtn = doc.createElement("button");
            okBtn.type = "button";
            okBtn.textContent = (0, i18n_1.t)("dialog.inkOcrModel.download");
            okBtn.style.cssText = primaryBtnCss();
            row.append(cancelBtn);
            if (!auto)
                row.append(okBtn);
            body.appendChild(row);
            let started = false;
            const start = () => {
                if (started)
                    return;
                started = true;
                okBtn.disabled = true;
                okBtn.style.opacity = "0.5";
                okBtn.style.cursor = "default";
                progWrap.style.display = "block";
                status.textContent = (0, i18n_1.t)("dialog.inkOcrModel.starting");
                void (async () => {
                    try {
                        await handlers.load((p) => {
                            const pct = p.total > 0 ? Math.round(p.fraction * 100) : 0;
                            fill.style.width = `${pct}%`;
                            if (p.total > 0 && p.loaded >= p.total) {
                                status.textContent = (0, i18n_1.t)("dialog.inkOcrModel.initializing");
                            }
                            else if (p.total > 0) {
                                status.textContent = (0, i18n_1.t)("dialog.inkOcrModel.progress", {
                                    done: formatMb(p.loaded, 1),
                                    total: formatMb(p.total),
                                    pct,
                                });
                            }
                            else {
                                status.textContent = (0, i18n_1.t)("dialog.inkOcrModel.progressUnknown", { done: formatMb(p.loaded, 1) });
                            }
                        });
                        ctx.close(true);
                    }
                    catch {
                        started = false;
                        okBtn.disabled = false;
                        okBtn.style.opacity = "1";
                        okBtn.style.cursor = "pointer";
                        okBtn.textContent = (0, i18n_1.t)("dialog.inkOcrModel.retry");
                        // In auto-start mode the download button was not rendered — surface it now
                        // so the user can retry after a failure.
                        if (!okBtn.isConnected)
                            row.append(okBtn);
                        fill.style.width = "0%";
                        status.textContent = (0, i18n_1.t)("dialog.inkOcrModel.error");
                    }
                })();
            };
            okBtn.addEventListener("click", start);
            if (auto)
                start();
        },
    });
}
const CONFIDENCE_COLOR = {
    high: "#16a34a",
    medium: "#ca8a04",
    low: "#dc2626",
};
function openInkOcrDialog(doc, ocr, options = {}) {
    return (0, dialog_1.showDialog)(doc, {
        title: (0, i18n_1.t)("dialog.inkOcr.title"),
        width: 440,
        okLabel: (0, i18n_1.t)("dialog.inkOcr.apply"),
        buildBody: (body) => {
            let current = ocr;
            // Recreated on every render(); the getResult closure reads the live ref.
            let textarea = null;
            // ---- AI 识别按钮（可选，显式触发）----
            if (options.recognizeWithAi) {
                const aiRow = doc.createElement("div");
                aiRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap";
                const aiBtn = doc.createElement("button");
                aiBtn.type = "button";
                aiBtn.textContent = (0, i18n_1.t)("dialog.inkOcr.tryAi");
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
                aiNote.textContent = (0, i18n_1.t)("dialog.inkOcr.aiHint");
                aiBtn.addEventListener("click", () => {
                    const run = options.recognizeWithAi;
                    if (!run || aiBtn.disabled)
                        return;
                    aiBtn.disabled = true;
                    aiBtn.style.opacity = "0.5";
                    aiBtn.style.cursor = "default";
                    aiNote.textContent = (0, i18n_1.t)("dialog.inkOcr.aiWorking");
                    void (async () => {
                        try {
                            const res = await run();
                            if (res && res.text.trim()) {
                                current = res;
                                render(current);
                                aiNote.textContent = (0, i18n_1.t)("dialog.inkOcr.aiHint");
                            }
                            else {
                                aiNote.textContent = (0, i18n_1.t)("dialog.inkOcr.aiEmpty");
                            }
                        }
                        catch {
                            aiNote.textContent = (0, i18n_1.t)("dialog.inkOcr.aiFailed");
                        }
                        finally {
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
            function render(o) {
                resultHost.textContent = "";
                const meta = doc.createElement("div");
                meta.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 12px;margin-bottom:10px;font-size:12px";
                const strokes = doc.createElement("span");
                strokes.textContent = (0, i18n_1.t)(o.scope === "selected" ? "dialog.inkOcr.strokesSelected" : "dialog.inkOcr.strokesAll", { n: String(o.strokeCount) });
                const engine = doc.createElement("span");
                engine.style.color = "var(--muted-foreground)";
                engine.textContent = (0, i18n_1.t)(o.engine === "vision"
                    ? "dialog.inkOcr.engineVision"
                    : o.engine === "paddle"
                        ? "dialog.inkOcr.enginePaddle"
                        : "dialog.inkOcr.engineTesseract");
                meta.append(strokes, engine);
                resultHost.appendChild(meta);
                if (o.previewDataUrl) {
                    const previewLbl = doc.createElement("p");
                    previewLbl.textContent = (0, i18n_1.t)("dialog.inkOcr.preview");
                    previewLbl.style.cssText = "margin:0 0 6px;font-size:11px;color:var(--muted-foreground)";
                    const img = doc.createElement("img");
                    img.src = o.previewDataUrl;
                    img.alt = (0, i18n_1.t)("dialog.inkOcr.preview");
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
                    const level = (0, ink_ocr_1.inkOcrConfidenceLevel)(o.confidence);
                    const badge = doc.createElement("div");
                    badge.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px";
                    const dot = doc.createElement("span");
                    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${CONFIDENCE_COLOR[level]}`;
                    const conf = doc.createElement("span");
                    conf.textContent = (0, i18n_1.t)("dialog.inkOcr.confidence", { n: Math.round(o.confidence) });
                    conf.style.color = CONFIDENCE_COLOR[level];
                    badge.append(dot, conf);
                    resultHost.appendChild(badge);
                    if (level === "low") {
                        const warn = doc.createElement("p");
                        warn.textContent = (0, i18n_1.t)("dialog.inkOcr.lowConfidence");
                        warn.style.cssText = "margin:0 0 10px;font-size:11px;color:var(--muted-foreground)";
                        resultHost.appendChild(warn);
                    }
                }
                if (!o.text.trim()) {
                    const empty = doc.createElement("p");
                    empty.textContent = (0, i18n_1.t)("dialog.inkOcr.emptyHint");
                    empty.style.cssText = "margin:0 0 8px;font-size:11px;color:var(--muted-foreground)";
                    resultHost.appendChild(empty);
                }
                const langNote = doc.createElement("p");
                langNote.textContent = (0, i18n_1.t)("dialog.inkOcr.langNote", { lang: o.lang });
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
                if (!text)
                    return null;
                return { text };
            };
        },
    });
}
