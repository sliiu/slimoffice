import { bindEditorModal } from "./dialog.js";
import { t } from "./i18n/index.js";
import { DIALOG_OVERLAY_CSS, closeRibbonMoreDialogs } from "./ui-style.js";
export function openLayoutPickerDialog(doc, layouts, current, onPick) {
    closeRibbonMoreDialogs(doc);
    const overlay = doc.createElement("div");
    overlay.className = "local-picker-overlay";
    overlay.style.cssText = DIALOG_OVERLAY_CSS;
    let modalDismiss;
    const dismiss = () => {
        modalDismiss?.release();
        overlay.remove();
    };
    const modal = doc.createElement("div");
    modal.style.cssText =
        "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(420px,92vw);max-height:min(70vh,520px);display:flex;flex-direction:column;gap:10px";
    const title = doc.createElement("h3");
    title.style.margin = "0";
    title.textContent = t("layoutPicker.title");
    modal.appendChild(title);
    const hint = doc.createElement("p");
    hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
    hint.textContent = t("layoutPicker.hint");
    modal.appendChild(hint);
    const list = doc.createElement("div");
    list.className = "ppt-scroll";
    list.style.cssText = "display:flex;flex-direction:column;gap:6px;overflow:auto;flex:1;min-height:0";
    if (layouts.length === 0) {
        const empty = doc.createElement("p");
        empty.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground)";
        empty.textContent = t("layoutPicker.empty");
        list.appendChild(empty);
    }
    else {
        for (const entry of layouts) {
            const selected = current?.masterId === entry.masterId && current?.layoutId === entry.layoutId;
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.style.cssText =
                "text-align:left;background:" +
                    (selected ? "var(--accent,#333333)" : "var(--background,#18181a)") +
                    ";border:1px solid " +
                    (selected ? "var(--primary,#3b82f6)" : "var(--border,#3a3a3a)") +
                    ";border-radius:6px;padding:10px 12px;cursor:pointer;font:inherit;color:inherit";
            const head = doc.createElement("div");
            head.style.fontWeight = "600";
            head.style.fontSize = "13px";
            head.textContent = entry.name;
            const detail = doc.createElement("div");
            detail.style.cssText = "font-size:11px;color:var(--muted-foreground,#a1a1aa);margin-top:4px";
            detail.textContent = entry.type ? t("layoutPicker.type", { type: entry.type }) : entry.layoutId;
            btn.append(head, detail);
            btn.addEventListener("click", () => {
                onPick(entry);
                dismiss();
            });
            list.appendChild(btn);
        }
    }
    modal.appendChild(list);
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end";
    const cancel = doc.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("layoutPicker.cancel");
    cancel.style.cssText =
        "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
    cancel.addEventListener("click", dismiss);
    footer.appendChild(cancel);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    modalDismiss = bindEditorModal({ doc, overlay, panel: modal, onCancel: dismiss });
    doc.body.appendChild(overlay);
}
