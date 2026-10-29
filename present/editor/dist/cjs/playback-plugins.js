"use strict";
// 播放插件选择 —— 编辑器视图中让用户挑选「放映时加载哪些插件」。
//
// 设计要点：
//   1. 这是一个纯 UI 描述（不依赖 @sliiu/present-player / Plugin 对象本身），
//      让编辑器包不需要对 player 产生硬依赖；宿主负责把 `PlaybackPluginEntry`
//      列表传给编辑器，再把编辑器返回的 id 列表映射回真正的 Plugin。
//   2. 列表面板做成 anchored popover：从顶栏一个按钮触发，列出所有插件 +
//      勾选框 + 描述。点击勾选立即回写到回调。
//   3. 同时也通过 EditorHandle 暴露 `getSelectedPlugins()`，让宿主在「开始放映」
//      时拿到当前选择。
Object.defineProperty(exports, "__esModule", { value: true });
exports.openPlaybackPluginPopover = openPlaybackPluginPopover;
const plugin_chooser_1 = require("./plugin-chooser");
const ui_style_1 = require("./ui-style");
function openPlaybackPluginPopover(doc, anchor, opts) {
    // 关掉已经开着的同类 popover，避免叠加。
    doc.querySelectorAll("[data-ppt-playback-plugins]").forEach((n) => n.remove());
    (0, ui_style_1.ensureUiStyles)(doc);
    const anchorRect = anchor.getBoundingClientRect();
    (0, ui_style_1.closeRibbonMoreDialogs)(doc);
    const overlay = doc.createElement("div");
    overlay.dataset.pptPlaybackPlugins = "1";
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
    head.style.cssText = "font-size:11px;color:var(--muted-foreground);text-transform:uppercase;letter-spacing:.4px;padding:4px 6px 8px";
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
            enabled: opts.selected,
            onChange: (next) => {
                opts.selected = next;
                opts.onChange(next);
            },
            labels: opts.labels,
            onImport: opts.onImport,
            onDelete: opts.onDelete,
        });
    }
    overlay.appendChild(panel);
    doc.body.appendChild(overlay);
    // 定位：锚点按钮下方对齐（用关闭「更多」前缓存的 rect）。
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
