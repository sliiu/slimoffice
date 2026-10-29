import { bindEditorModal } from "./dialog";
import { t } from "./i18n";
import { DIALOG_OVERLAY_CSS, closeRibbonMoreDialogs } from "./ui-style";

export function openSectionDialog(
  doc: Document,
  opts: { defaultName: string; title?: string; okLabel?: string },
  onSubmit: (name: string) => void,
): void {
  closeRibbonMoreDialogs(doc);
  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText = DIALOG_OVERLAY_CSS;
  let modalDismiss: { release: () => void } | undefined;
  const dismiss = (): void => {
    modalDismiss?.release();
    overlay.remove();
  };

  const modal = doc.createElement("div");
  modal.style.cssText =
    "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(360px,92vw);display:flex;flex-direction:column;gap:10px";

  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.textContent = opts.title ?? t("sectionDialog.title");
  modal.appendChild(title);

  const label = doc.createElement("label");
  label.style.cssText = "font-size:12px;color:var(--muted-foreground)";
  label.textContent = t("sectionDialog.nameLabel");
  const input = doc.createElement("input");
  input.type = "text";
  input.value = opts.defaultName;
  input.style.cssText =
    "width:100%;box-sizing:border-box;background:var(--background);color:inherit;border:1px solid var(--border);border-radius:4px;padding:8px 10px;font:inherit";
  label.appendChild(input);
  modal.appendChild(label);

  const footer = doc.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("sectionDialog.cancel");
  cancel.style.cssText =
    "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
  cancel.addEventListener("click", dismiss);
  const ok = doc.createElement("button");
  ok.type = "button";
  ok.textContent = opts.okLabel ?? t("sectionDialog.ok");
  ok.style.cssText =
    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font:inherit";
  const submit = (): void => {
    const name = input.value.trim() || opts.defaultName;
    onSubmit(name);
    dismiss();
  };
  ok.addEventListener("click", submit);
  footer.append(cancel, ok);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  modalDismiss = bindEditorModal({
    doc,
    overlay,
    panel: modal,
    onCancel: dismiss,
    onSubmit: () => {
      submit();
    },
  });
  doc.body.appendChild(overlay);
  input.focus();
  input.select();
}
