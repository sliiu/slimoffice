"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openSetupSlideShowDialog = openSetupSlideShowDialog;
const dialog_1 = require("./dialog");
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
function openSetupSlideShowDialog(doc, state, onApply) {
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        ui_style_1.DIALOG_OVERLAY_CSS;
    let modalDismiss;
    const dismiss = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(420px,92vw);display:flex;flex-direction:column;gap:12px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = (0, i18n_1.t)("setupShow.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    hint.textContent = (0, i18n_1.t)("setupShow.hint");
    modal.appendChild(hint);
    const draft = { ...state };
    const mkCheck = (label, key) => {
        const row = doc.createElement("label");
        row.style.cssText = "display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer";
        const cb = doc.createElement("input");
        cb.type = "checkbox";
        cb.checked = draft[key];
        cb.addEventListener("change", () => {
            draft[key] = cb.checked;
        });
        row.append(cb, doc.createTextNode(label));
        return row;
    };
    const checks = doc.createElement("div");
    checks.style.cssText = "display:flex;flex-direction:column;gap:8px";
    checks.append(mkCheck((0, i18n_1.t)("setupShow.loop"), "loop"), mkCheck((0, i18n_1.t)("setupShow.windowed"), "windowed"), mkCheck((0, i18n_1.t)("setupShow.presenter"), "presenter"), mkCheck((0, i18n_1.t)("setupShow.useTimings"), "useTimings"), mkCheck((0, i18n_1.t)("setupShow.playNarrations"), "playNarrations"), mkCheck((0, i18n_1.t)("setupShow.showMediaControls"), "showMediaControls"));
    modal.appendChild(checks);
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:4px";
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = (0, i18n_1.t)("setupShow.cancel");
    cancel.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", dismiss);
    const ok = doc.createElement("button");
    ok.type = "button";
    ok.textContent = (0, i18n_1.t)("setupShow.apply");
    ok.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
    const apply = () => {
        onApply({ ...draft });
        dismiss();
    };
    ok.addEventListener("click", apply);
    footer.append(cancel, ok);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = (0, dialog_1.bindEditorModal)({
        doc,
        overlay,
        panel: modal,
        onCancel: dismiss,
        onSubmit: () => {
            apply();
        },
    });
    doc.body.appendChild(overlay);
}
