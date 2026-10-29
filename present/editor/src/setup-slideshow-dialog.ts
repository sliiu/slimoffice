import { bindEditorModal } from "./dialog";
import { t } from "./i18n";
import { DIALOG_OVERLAY_CSS } from "./ui-style";

export interface SlideshowSetupState {
  loop: boolean;
  windowed: boolean;
  presenter: boolean;
  useTimings: boolean;
  playNarrations: boolean;
  /** 放映时是否显示嵌入视频的播放控件（HTML5 controls）。默认 true。 */
  showMediaControls: boolean;
}

export function openSetupSlideShowDialog(
  doc: Document,
  state: SlideshowSetupState,
  onApply: (next: SlideshowSetupState) => void,
): void {
  const overlay = doc.createElement("div");
  overlay.className = "local-picker-overlay";
  overlay.style.cssText =
    DIALOG_OVERLAY_CSS;
  let modalDismiss: { release: () => void } | undefined;
  const dismiss = (): void => {
    modalDismiss?.release();
    overlay.remove();
  };

  const modal = doc.createElement("div");
  modal.style.cssText =
    "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);box-shadow:var(--shadow-lg);padding:16px 18px;width:min(420px,92vw);display:flex;flex-direction:column;gap:12px";

  const title = doc.createElement("h3");
  title.style.margin = "0";
  title.textContent = t("setupShow.title");
  modal.appendChild(title);

  const hint = doc.createElement("p");
  hint.style.cssText = "margin:0;font-size:12px;color:var(--muted-foreground,#a1a1aa)";
  hint.textContent = t("setupShow.hint");
  modal.appendChild(hint);

  const draft = { ...state };

  const mkCheck = (label: string, key: keyof SlideshowSetupState): HTMLElement => {
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
  checks.append(
    mkCheck(t("setupShow.loop"), "loop"),
    mkCheck(t("setupShow.windowed"), "windowed"),
    mkCheck(t("setupShow.presenter"), "presenter"),
    mkCheck(t("setupShow.useTimings"), "useTimings"),
    mkCheck(t("setupShow.playNarrations"), "playNarrations"),
    mkCheck(t("setupShow.showMediaControls"), "showMediaControls"),
  );
  modal.appendChild(checks);

  const footer = doc.createElement("div");
  footer.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:4px";
  const cancel = doc.createElement("button");
  cancel.type = "button";
  cancel.textContent = t("setupShow.cancel");
  cancel.style.cssText =
    "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit";
  cancel.addEventListener("click", dismiss);
  const ok = doc.createElement("button");
  ok.type = "button";
  ok.textContent = t("setupShow.apply");
  ok.style.cssText =
    "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:4px;padding:6px 12px;cursor:pointer;font:inherit";
  const apply = (): void => {
    onApply({ ...draft });
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
