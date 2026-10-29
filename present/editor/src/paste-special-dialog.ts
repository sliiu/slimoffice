import { t } from "./i18n";
import { Z_RIBBON_POPOVER } from "./ui-style";

export type PasteSpecialMode = "default" | "inPlace" | "plain";

/** 选择性粘贴：与 ribbon 分栏菜单同一套 `ppt-ribbon-menu` 浮层。 */
export function openPasteSpecialDialog(
  doc: Document,
  onPick: (mode: PasteSpecialMode) => void,
  anchor?: HTMLElement,
): void {
  doc.querySelectorAll<HTMLElement>("[data-ppt-paste-special-menu]").forEach((n) => n.remove());

  const overlay = doc.createElement("div");
  overlay.dataset.pptPasteSpecialMenu = "1";
  overlay.style.cssText =
    `position:fixed;inset:0;z-index:${Z_RIBBON_POPOVER};background:transparent`;

  const panel = doc.createElement("div");
  panel.className = "ppt-ribbon-menu";
  panel.style.cssText = [
    "position:absolute",
    "pointer-events:auto",
    "background:var(--secondary)",
    "color:var(--foreground)",
    "border:1px solid var(--border)",
    "border-radius:6px",
    "box-shadow:0 8px 24px rgba(0,0,0,0.5)",
    "padding:4px",
    "min-width:160px",
    "font:12px system-ui,sans-serif",
    "user-select:none",
  ].join(";");

  const modes: Array<{ id: PasteSpecialMode; label: string }> = [
    { id: "default", label: t("pasteSpecial.default") },
    { id: "inPlace", label: t("pasteSpecial.inPlace") },
    { id: "plain", label: t("pasteSpecial.plain") },
  ];

  const close = (): void => {
    overlay.remove();
    doc.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  for (const m of modes) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "ppt-ribbon-menu-item";
    b.textContent = m.label;
    b.addEventListener("pointerenter", () => b.classList.add("is-hover"));
    b.addEventListener("pointerleave", () => b.classList.remove("is-hover"));
    b.addEventListener("click", () => {
      onPick(m.id);
      close();
    });
    panel.appendChild(b);
  }

  overlay.appendChild(panel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  doc.addEventListener("keydown", onKey);
  doc.body.appendChild(overlay);

  const vw = doc.defaultView?.innerWidth ?? 1200;
  const vh = doc.defaultView?.innerHeight ?? 800;
  const pw = panel.getBoundingClientRect().width;
  const ph = panel.getBoundingClientRect().height;
  let left: number;
  let top: number;
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    left = r.left;
    top = r.bottom + 4;
  } else {
    left = Math.max(8, (vw - pw) / 2);
    top = Math.max(8, (vh - ph) / 2);
  }
  if (left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
  if (top + ph > vh - 8) top = Math.max(8, vh - ph - 8);
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}
