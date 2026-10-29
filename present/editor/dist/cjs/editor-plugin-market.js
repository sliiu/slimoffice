"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openEditorPluginMarketPopover = openEditorPluginMarketPopover;
// 编辑期插件市场 — View tab 勾选启用/停用 `EditorPlugin`（与放映插件 popover 对称）。
const plugin_chooser_1 = require("./plugin-chooser");
const ui_style_1 = require("./ui-style");
function openEditorPluginMarketPopover(doc, anchor, opts) {
    doc.querySelectorAll("[data-ppt-editor-plugins]").forEach((n) => n.remove());
    (0, ui_style_1.ensureUiStyles)(doc);
    // 先记住锚点位置再关「更多」，否则按钮被收回主栏后 getBoundingClientRect 会漂走。
    const anchorRect = anchor.getBoundingClientRect();
    (0, ui_style_1.closeRibbonMoreDialogs)(doc);
    const overlay = doc.createElement("div");
    overlay.dataset.pptEditorPlugins = "1";
    overlay.style.cssText =
        `position:fixed;inset:0;z-index:${ui_style_1.Z_RIBBON_POPOVER};background:transparent`;
    const panel = doc.createElement("div");
    panel.className = ui_style_1.SCROLL_CLASS;
    panel.style.cssText = [
        "position:absolute",
        "background:var(--popover)",
        "color:var(--foreground)",
        "border:1px solid var(--border)",
        "border-radius:var(--radius-md,8px)",
        "box-shadow:var(--shadow-lg, 0 8px 30px rgba(0,0,0,0.45))",
        "padding:8px",
        "min-width:280px",
        "max-width:360px",
        "max-height:60vh",
        "overflow:auto",
        "font:12px var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
        "user-select:none",
    ].join(";");
    const head = doc.createElement("div");
    head.textContent = opts.title;
    head.style.cssText =
        "font-size:11px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.4px;padding:4px 6px 8px";
    panel.appendChild(head);
    if (!opts.labels && opts.entries.length === 0) {
        const empty = doc.createElement("div");
        empty.textContent = opts.emptyText;
        empty.style.cssText = "padding:8px 6px;color:var(--muted-foreground);font-style:italic";
        panel.appendChild(empty);
    }
    else {
        (0, plugin_chooser_1.appendPluginChooser)(panel, {
            entries: opts.entries,
            enabled: opts.enabled,
            onChange: (next) => {
                opts.enabled = next;
                opts.onChange(next);
            },
            labels: opts.labels,
            onImport: opts.onImport,
            onDelete: opts.onDelete,
        });
    }
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    panel.style.left = "0px";
    panel.style.top = "0px";
    const pw = panel.getBoundingClientRect().width;
    const ph = panel.getBoundingClientRect().height;
    const vw = doc.defaultView?.innerWidth ?? 1200;
    const vh = doc.defaultView?.innerHeight ?? 800;
    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;
    if (left + pw > vw - 8)
        left = Math.max(8, vw - pw - 8);
    if (top + ph > vh - 8)
        top = Math.max(8, vh - ph - 8);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    const close = () => {
        overlay.remove();
        doc.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
    };
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay)
            close();
    });
    doc.addEventListener("keydown", onKey, true);
}
