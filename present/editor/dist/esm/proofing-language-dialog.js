import { bindEditorModal } from "./dialog.js";
import { localeToProofingLangId, PROOFING_LANGUAGES } from "./proofing-language.js";
import { t } from "./i18n/index.js";
import { DIALOG_OVERLAY_CSS } from "./ui-style.js";
export function openProofingLanguageDialog(doc, currentLang, onApply) {
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText =
        DIALOG_OVERLAY_CSS;
    let modalDismiss;
    const dismiss = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(380px,92vw);display:flex;flex-direction:column;gap:12px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = t("proofing.language.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    hint.textContent = t("proofing.language.hint");
    modal.appendChild(hint);
    const sel = doc.createElement("select");
    sel.style.cssText =
        "width:100%;background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px;font:inherit";
    for (const l of PROOFING_LANGUAGES) {
        const o = doc.createElement("option");
        o.value = l.id;
        o.textContent = t(l.labelKey);
        sel.appendChild(o);
    }
    sel.value = PROOFING_LANGUAGES.some((l) => l.id === currentLang) ? currentLang : localeToProofingLangId();
    modal.appendChild(sel);
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px";
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("proofing.language.cancel");
    cancel.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", dismiss);
    const ok = doc.createElement("button");
    ok.type = "button";
    ok.textContent = t("proofing.language.apply");
    ok.style.cssText =
        "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
    const apply = () => {
        onApply(sel.value);
        dismiss();
    };
    ok.addEventListener("click", apply);
    footer.append(cancel, ok);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = bindEditorModal({
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
