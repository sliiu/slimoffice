"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openHelpDialog = openHelpDialog;
exports.openExternalHelpLink = openExternalHelpLink;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
function modLabel() {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    return /Mac|iPhone|iPad/.test(ua) ? "⌘" : "Ctrl";
}
function shortcutRows() {
    const m = modLabel();
    return [
        { action: (0, i18n_1.t)("help.shortcut.save"), keys: `${m}+S` },
        { action: (0, i18n_1.t)("help.shortcut.undo"), keys: `${m}+Z` },
        { action: (0, i18n_1.t)("help.shortcut.redo"), keys: `${m}+Y` },
        { action: (0, i18n_1.t)("help.shortcut.cut"), keys: `${m}+X` },
        { action: (0, i18n_1.t)("help.shortcut.copy"), keys: `${m}+C` },
        { action: (0, i18n_1.t)("help.shortcut.paste"), keys: `${m}+V` },
        { action: (0, i18n_1.t)("help.shortcut.duplicate"), keys: `${m}+D` },
        { action: (0, i18n_1.t)("help.shortcut.delete"), keys: "Del" },
        { action: (0, i18n_1.t)("help.shortcut.selectAll"), keys: `${m}+A` },
        { action: (0, i18n_1.t)("help.shortcut.find"), keys: `${m}+F` },
        { action: (0, i18n_1.t)("help.shortcut.replace"), keys: `${m}+H` },
        { action: (0, i18n_1.t)("help.shortcut.group"), keys: `${m}+G` },
        { action: (0, i18n_1.t)("help.shortcut.ungroup"), keys: `${m}+⇧G` },
        { action: (0, i18n_1.t)("help.shortcut.bringForward"), keys: `${m}+]` },
        { action: (0, i18n_1.t)("help.shortcut.sendBackward"), keys: `${m}+[` },
        { action: (0, i18n_1.t)("help.shortcut.slideshow"), keys: "F5" },
        { action: (0, i18n_1.t)("help.shortcut.slideshowCurrent"), keys: "⇧F5" },
    ];
}
function openHelpDialog(doc, links = {}) {
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    let modalDismiss;
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(480px,92vw);max-height:min(85vh,640px);display:flex;flex-direction:column;gap:12px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("help.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa);line-height:1.45";
    hint.textContent = (0, i18n_1.t)("help.hint");
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
    const addLink = (label, url) => {
        if (!url)
            return;
        const a = doc.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label;
        a.style.color = "var(--primary,#3b82f6)";
        linkRow.appendChild(a);
    };
    addLink((0, i18n_1.t)("help.openDocs"), links.docsUrl);
    addLink((0, i18n_1.t)("help.openFeedback"), links.feedbackUrl);
    addLink((0, i18n_1.t)("help.openTraining"), links.trainingUrl);
    addLink((0, i18n_1.t)("help.openTerms"), links.termsUrl);
    addLink((0, i18n_1.t)("help.openPrivacy"), links.privacyUrl);
    if (linkRow.childNodes.length)
        modal.appendChild(linkRow);
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end";
    const close = doc.createElement("button");
    close.type = "button";
    close.textContent = (0, i18n_1.t)("help.close");
    close.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    const dismiss = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    close.addEventListener("click", dismiss);
    footer.appendChild(close);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({ doc, overlay, panel: modal, onCancel: dismiss });
    doc.body.appendChild(overlay);
}
function openExternalHelpLink(url, doc, missingKey) {
    if (!url?.trim()) {
        const toast = doc.createElement("div");
        toast.textContent = (0, i18n_1.t)(missingKey);
        toast.style.cssText =
            "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--popover);color:var(--foreground);border:1px solid var(--border);padding:10px 16px;border-radius:var(--radius-md,8px);font-size:13px;z-index:var(--z-toast, 1400);box-shadow:var(--shadow-lg)";
        doc.body.appendChild(toast);
        window.setTimeout(() => toast.remove(), 2800);
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}
