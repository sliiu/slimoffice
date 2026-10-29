import { bindEditorModal } from "./dialog";
import type { Presentation } from "@ppt/core";
import { t } from "./i18n";
import { auditPresentationDesign, type DesignSuggestion, type DesignSuggestionCategory } from "./design-audit";
import { DIALOG_OVERLAY_CSS } from "./ui-style";

export interface DesignerAiFinding {
  slideIdx: number;
  severity: string;
  category: string;
  issue: string;
  suggestion: string;
}

export interface DesignerAiResult {
  overall: string;
  score: number;
  findings: DesignerAiFinding[];
  pendingFixes?: number;
  onApplySafeFixes?: () => { applied: number; skipped: number };
}

export interface DesignerDialogOptions {
  pres: Presentation;
  onJumpToSlide: (idx: number) => void;
  aiAvailable?: boolean;
  onRunAiReview?: (signal: AbortSignal) => Promise<DesignerAiResult | null>;
  onAfterApplyFixes?: () => void;
}

function categoryLabel(cat: DesignSuggestionCategory): string {
  switch (cat) {
    case "contrast":
      return t("designer.category.contrast");
    case "layout":
      return t("designer.category.layout");
    case "imagery":
      return t("designer.category.imagery");
    case "typography":
      return t("designer.category.typography");
    case "consistency":
      return t("designer.category.consistency");
    case "empty":
      return t("designer.category.empty");
    case "density":
      return t("designer.category.density");
    case "placeholder":
      return t("designer.category.placeholder");
  }
}

function severityColor(sev: DesignSuggestion["severity"]): string {
  switch (sev) {
    case "error":
      return "var(--destructive)";
    case "warn":
      return "var(--warning)";
    case "info":
      return "var(--primary)";
  }
}

function renderSuggestionRow(
  doc: Document,
  s: DesignSuggestion,
  onJump: (idx: number) => void,
): HTMLElement {
  const row = doc.createElement("div");
  row.style.cssText =
    "border:1px solid var(--border,#3a3a3a);border-radius:var(--radius-md,6px);padding:8px 10px;background:var(--secondary)";
  const head = doc.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px";
  const badge = doc.createElement("span");
  badge.style.cssText =
    "font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:4px";
  badge.style.background = `color-mix(in srgb, ${severityColor(s.severity)} 18%, transparent)`;
  badge.style.color = severityColor(s.severity);
  badge.textContent = categoryLabel(s.category);
  const meta = doc.createElement("span");
  meta.style.flex = "1";
  meta.style.fontSize = "11px";
  meta.style.color = "var(--muted-foreground,#a1a1aa)";
  meta.textContent =
    s.slideIndex !== undefined ? t("designer.slideN", { n: s.slideIndex + 1 }) : t("designer.deckWide");
  head.append(badge, meta);
  if (s.slideIndex !== undefined) {
    const jump = doc.createElement("button");
    jump.type = "button";
    jump.textContent = t("designer.goTo");
    jump.style.cssText =
      "background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit;font-size:11px;color:inherit";
    jump.addEventListener("click", () => onJump(s.slideIndex!));
    head.appendChild(jump);
  }
  row.appendChild(head);
  const title = doc.createElement("div");
  title.style.cssText = "font-size:13px;font-weight:600;margin-bottom:2px";
  title.textContent = s.title;
  row.appendChild(title);
  const detail = doc.createElement("div");
  detail.style.fontSize = "12px";
  detail.textContent = s.detail;
  row.appendChild(detail);
  if (s.action) {
    const action = doc.createElement("div");
    action.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa);margin-top:4px";
    action.textContent = `→ ${s.action}`;
    row.appendChild(action);
  }
  return row;
}

export function openDesignerDialog(doc: Document, opts: DesignerDialogOptions): void {
  const report = auditPresentationDesign(opts.pres);
  let aiResult: DesignerAiResult | null = null;
  let aiAbort: AbortController | null = null;

  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText =
    DIALOG_OVERLAY_CSS;
  let modalDismiss: { release: () => void } | undefined;
  const close = (): void => {
    modalDismiss?.release();
    aiAbort?.abort();
    overlay.remove();
  };

  const modal = doc.createElement("div");
  modal.style.cssText =
    "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(560px,92vw);max-height:82vh;overflow:hidden;display:flex;flex-direction:column;gap:10px";

  const head = doc.createElement("div");
  head.style.cssText = "display:flex;align-items:center;gap:10px;flex-shrink:0";
  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.style.flex = "1";
  title.textContent = t("designer.title");
  const scoreBadge = doc.createElement("span");
  scoreBadge.style.cssText =
    "font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;background:color-mix(in srgb, var(--primary) 14%, transparent);color:var(--primary)";
  scoreBadge.textContent = t("designer.score", { score: report.score });
  head.append(title, scoreBadge);
  modal.appendChild(head);

  const summary = doc.createElement("p");
  summary.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);flex-shrink:0";
  summary.textContent = report.summary;
  modal.appendChild(summary);

  const list = doc.createElement("div");
  list.className = "ppt-scroll";
  list.style.cssText =
    "flex:0 0 auto;overflow:auto;display:flex;flex-direction:column;gap:6px;max-height:calc(82vh - 148px)";

  const renderList = (): void => {
    list.replaceChildren();
    if (report.suggestions.length === 0) {
      const ok = doc.createElement("p");
      ok.style.cssText = "margin:8px 0;color:var(--success);font-size:13px";
      ok.textContent = t("designer.noIssues");
      list.appendChild(ok);
    } else {
      const order = { error: 0, warn: 1, info: 2 } as const;
      const sorted = [...report.suggestions].sort(
        (a, b) => order[a.severity] - order[b.severity] || (a.slideIndex ?? -1) - (b.slideIndex ?? -1),
      );
      for (const s of sorted) {
        list.appendChild(
          renderSuggestionRow(doc, s, (idx) => {
            opts.onJumpToSlide(idx);
            close();
          }),
        );
      }
    }

    if (aiResult) {
      const aiBlock = doc.createElement("div");
      aiBlock.style.cssText = "margin-top:12px;padding-top:10px;border-top:1px solid var(--border,#3a3a3a)";
      const aiHead = doc.createElement("div");
      aiHead.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:6px";
      const aiTitle = doc.createElement("span");
      aiTitle.style.fontWeight = "600";
      aiTitle.textContent = t("designer.aiSection");
      const aiScore = doc.createElement("span");
      aiScore.style.cssText = "font-size:11px;padding:2px 6px;border-radius:4px;background:color-mix(in srgb, var(--primary) 18%, transparent);color:var(--primary-soft)";
      aiScore.textContent = `${aiResult.score}/10`;
      aiHead.append(aiTitle, aiScore);
      aiBlock.appendChild(aiHead);
      const overall = doc.createElement("p");
      overall.style.cssText = "margin:0 0 8px;font-size:12px;line-height:1.45";
      overall.textContent = aiResult.overall;
      aiBlock.appendChild(overall);
      for (const f of aiResult.findings) {
        const row = doc.createElement("div");
        row.style.cssText =
          "border:1px solid var(--border,#3a3a3a);border-radius:6px;padding:8px;margin-bottom:6px;background:var(--background)";
        const loc = doc.createElement("div");
        loc.style.cssText = "font-size:10px;color:var(--muted-foreground);margin-bottom:4px";
        loc.textContent = `#${f.slideIdx + 1} · ${f.severity} · ${f.category}`;
        const issue = doc.createElement("div");
        issue.style.fontSize = "12px";
        issue.textContent = f.issue;
        const sug = doc.createElement("div");
        sug.style.cssText = "font-size:11px;color:var(--muted-foreground);margin-top:3px";
        sug.textContent = `→ ${f.suggestion}`;
        const jumpRow = doc.createElement("div");
        jumpRow.style.marginTop = "4px";
        const jump = doc.createElement("button");
        jump.type = "button";
        jump.textContent = t("designer.goTo");
        jump.style.cssText =
          "background:transparent;border:1px solid var(--border);border-radius:4px;padding:2px 8px;cursor:pointer;font:inherit;font-size:11px;color:inherit";
        jump.addEventListener("click", () => {
          opts.onJumpToSlide(f.slideIdx);
          close();
        });
        jumpRow.appendChild(jump);
        row.append(loc, issue, sug, jumpRow);
        aiBlock.appendChild(row);
      }
      list.appendChild(aiBlock);
    }
  };
  renderList();
  modal.appendChild(list);

  const footer = doc.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;flex-shrink:0";

  const applyBtn = doc.createElement("button");
  applyBtn.type = "button";
  applyBtn.style.cssText =
    "display:none;background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
  applyBtn.addEventListener("click", () => {
    if (!aiResult?.onApplySafeFixes) return;
    const r = aiResult.onApplySafeFixes();
    summary.textContent = t("designer.fixesApplied", { applied: r.applied, skipped: r.skipped });
    applyBtn.style.display = "none";
    aiResult.pendingFixes = 0;
    opts.onAfterApplyFixes?.();
  });

  if (opts.onRunAiReview) {
    const aiBtn = doc.createElement("button");
    aiBtn.type = "button";
    aiBtn.textContent = opts.aiAvailable ? t("designer.runAi") : t("designer.runAiDisabled");
    aiBtn.disabled = !opts.aiAvailable;
    aiBtn.title = opts.aiAvailable ? t("designer.runAiHint") : t("designer.runAiNoSettings");
    aiBtn.style.cssText =
      "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    if (!opts.aiAvailable) aiBtn.style.opacity = "0.5";
    aiBtn.addEventListener("click", async () => {
      if (!opts.aiAvailable || !opts.onRunAiReview) return;
      aiAbort?.abort();
      aiAbort = new AbortController();
      aiBtn.disabled = true;
      aiBtn.textContent = t("designer.runAiLoading");
      try {
        aiResult = await opts.onRunAiReview(aiAbort.signal);
        renderList();
        if (aiResult?.pendingFixes && aiResult.pendingFixes > 0 && aiResult.onApplySafeFixes) {
          applyBtn.style.display = "";
          applyBtn.textContent = t("designer.applyFixes", { n: aiResult.pendingFixes });
        } else {
          applyBtn.style.display = "none";
          applyBtn.textContent = "";
        }
      } catch (e) {
        if (!aiAbort.signal.aborted) {
          summary.textContent = t("designer.aiError", { msg: (e as Error).message });
        }
      } finally {
        aiBtn.disabled = !opts.aiAvailable;
        aiBtn.textContent = opts.aiAvailable ? t("designer.runAiAgain") : t("designer.runAiDisabled");
      }
    });
    footer.appendChild(aiBtn);
  }

  footer.appendChild(applyBtn);

  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = t("designer.close");
  closeBtn.style.cssText =
    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
  closeBtn.addEventListener("click", close);
  footer.appendChild(closeBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  modalDismiss = bindEditorModal({ doc, overlay, panel: modal, onCancel: close });
  doc.body.appendChild(overlay);
}
