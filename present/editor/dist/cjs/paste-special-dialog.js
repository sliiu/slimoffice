"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openPasteSpecialDialog = openPasteSpecialDialog;
const i18n_1 = require("./i18n");
const ui_style_1 = require("./ui-style");
/** 选择性粘贴：与 ribbon 分栏菜单同一套 `ppt-ribbon-menu` 浮层。 */
function openPasteSpecialDialog(doc, onPick, anchor) {
    doc.querySelectorAll("[data-ppt-paste-special-menu]").forEach((n) => n.remove());
    const overlay = doc.createElement("div");
    overlay.dataset.pptPasteSpecialMenu = "1";
    overlay.style.cssText =
        `position:fixed;inset:0;z-index:${ui_style_1.Z_RIBBON_POPOVER};background:transparent`;
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
    const modes = [
        { id: "default", label: (0, i18n_1.t)("pasteSpecial.default") },
        { id: "inPlace", label: (0, i18n_1.t)("pasteSpecial.inPlace") },
        { id: "plain", label: (0, i18n_1.t)("pasteSpecial.plain") },
    ];
    const close = () => {
        overlay.remove();
        doc.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
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
        if (e.target === overlay)
            close();
    });
    doc.addEventListener("keydown", onKey);
    doc.body.appendChild(overlay);
    const vw = doc.defaultView?.innerWidth ?? 1200;
    const vh = doc.defaultView?.innerHeight ?? 800;
    const pw = panel.getBoundingClientRect().width;
    const ph = panel.getBoundingClientRect().height;
    let left;
    let top;
    if (anchor) {
        const r = anchor.getBoundingClientRect();
        left = r.left;
        top = r.bottom + 4;
    }
    else {
        left = Math.max(8, (vw - pw) / 2);
        top = Math.max(8, (vh - ph) / 2);
    }
    if (left + pw > vw - 8)
        left = Math.max(8, vw - pw - 8);
    if (top + ph > vh - 8)
        top = Math.max(8, vh - ph - 8);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}
