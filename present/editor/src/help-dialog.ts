import { bindEditorModal } from "./dialog";
import { t } from "./i18n";
import { DIALOG_OVERLAY_CSS } from "./ui-style";

export interface HelpLinks {
  docsUrl?: string;
  feedbackUrl?: string;
  trainingUrl?: string;
  termsUrl?: string;
  privacyUrl?: string;
}

function modLabel(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /Mac|iPhone|iPad/.test(ua) ? "⌘" : "Ctrl";
}

function shortcutRows(): Array<{ action: string; keys: string }> {
  const m = modLabel();
  return [
    { action: t("help.shortcut.save"), keys: `${m}+S` },
    { action: t("help.shortcut.undo"), keys: `${m}+Z` },
    { action: t("help.shortcut.redo"), keys: `${m}+Y` },
    { action: t("help.shortcut.cut"), keys: `${m}+X` },
    { action: t("help.shortcut.copy"), keys: `${m}+C` },
    { action: t("help.shortcut.paste"), keys: `${m}+V` },
    { action: t("help.shortcut.duplicate"), keys: `${m}+D` },
    { action: t("help.shortcut.delete"), keys: "Del" },
    { action: t("help.shortcut.selectAll"), keys: `${m}+A` },
    { action: t("help.shortcut.find"), keys: `${m}+F` },
    { action: t("help.shortcut.replace"), keys: `${m}+H` },
    { action: t("help.shortcut.group"), keys: `${m}+G` },
    { action: t("help.shortcut.ungroup"), keys: `${m}+⇧G` },
    { action: t("help.shortcut.bringForward"), keys: `${m}+]` },
    { action: t("help.shortcut.sendBackward"), keys: `${m}+[` },
    { action: t("help.shortcut.slideshow"), keys: "F5" },
    { action: t("help.shortcut.slideshowCurrent"), keys: "⇧F5" },
  ];
}

export function openHelpDialog(doc: Document, links: HelpLinks = {}): void {
  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText =
    DIALOG_OVERLAY_CSS;
  let modalDismiss: { release: () => void } | undefined;

  const modal = doc.createElement("div");
  modal.style.cssText =
    "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(480px,92vw);max-height:min(85vh,640px);display:flex;flex-direction:column;gap:12px";

  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.textContent = t("help.title");
  modal.appendChild(title);

  const hint = doc.createElement("p");
  hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
  hint.textContent = t("help.hint");
  modal.appendChild(hint);

  const table = doc.createElement("div");
  table.style.cssText =
    "overflow:auto;max-height:min(50vh,360px);display:grid;grid-template-columns:1fr auto;gap:4px 16px;padding-right:8px;font-size:13px;line-height:1.5";
  for (const row of shortcutRows()) {
    const action = doc.createElement("div");
    action.textContent = row.action;
    const keys = doc.createElement("div");
    keys.textContent = row.keys;
    keys.style.cssText = "font-family:ui-monospace,monospace;color:var(--muted-foreground,#a1a1aa);text-align:right";
    table.append(action, keys);
  }
  modal.appendChild(table);

  const linkRow = doc.createElement("div");
  linkRow.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;font-size:12px";
  const addLink = (label: string, url: string | undefined): void => {
    if (!url) return;
    const a = doc.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = label;
    a.style.color = "var(--primary,#3b82f6)";
    linkRow.appendChild(a);
  };
  addLink(t("help.openDocs"), links.docsUrl);
  addLink(t("help.openFeedback"), links.feedbackUrl);
  addLink(t("help.openTraining"), links.trainingUrl);
  addLink(t("help.openTerms"), links.termsUrl);
  addLink(t("help.openPrivacy"), links.privacyUrl);
  if (linkRow.childNodes.length) modal.appendChild(linkRow);

  const footer = doc.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end";
  const close = doc.createElement("button");
  close.type = "button";
  close.textContent = t("help.close");
  close.style.cssText =
    "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
  const dismiss = (): void => {
    modalDismiss?.release();
    overlay.remove();
  };
  close.addEventListener("click", dismiss);
  footer.appendChild(close);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  modalDismiss = bindEditorModal({ doc, overlay, panel: modal, onCancel: dismiss });
  doc.body.appendChild(overlay);
}

export function openExternalHelpLink(url: string | undefined, doc: Document, missingKey: "help.missingFeedback" | "help.missingTraining"): void {
  if (!url?.trim()) {
    const toast = doc.createElement("div");
    toast.textContent = t(missingKey);
    toast.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--popover);color:var(--foreground);border:1px solid var(--border);padding:10px 16px;border-radius:var(--radius-md,8px);font-size:13px;z-index:var(--z-toast, 1400);box-shadow:var(--shadow-lg)";
    doc.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2800);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
