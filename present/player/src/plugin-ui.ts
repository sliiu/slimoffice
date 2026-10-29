// PluginUIHost 实现 — 支持位置 / 主题 / headless 三种维度的定制：
//
//   - dockPosition: left/right/top/bottom（dock 沿哪一侧滑入）
//   - themeMode: dark / light / auto（用 prefers-color-scheme）
//   - headless: 完全不创建 dock；addPanel 自动 fallback 为 floating panel
//
// 所有颜色 / 字体 / 圆角都走 CSS 变量；用户可以通过：
//   1) MountOptions.ui.cssVars 在 `.ppt-host` 行内 style 上注入变量
//   2) MountOptions.ui.customCss 直接覆盖任何选择器
//   3) MountOptions.ui.hostClassName 给 host 加 className，方便外部样式表定向
//
// 默认变量在 :where(.ppt-host) 下声明，优先级最低 —— 任何 cssVars 都能覆盖。

import type {
  OverlayOptions,
  PanelOptions,
  PluginUIHost,
  PluginUIOptions,
  ToolbarButtonOptions,
  UIHandle,
} from "./plugins";
import { fillLucideIcon } from "./icons";

const STYLES_ID = "ppt-plugin-ui";

const DEFAULT_DARK_VARS: Record<string, string> = {
  "dock-bg": "rgba(20,20,24,.92)",
  "dock-fg": "#e5e7eb",
  "dock-border": "rgba(255,255,255,.08)",
  "dock-radius": "0",
  "dock-shadow": "0 0 24px rgba(0,0,0,.35)",
  "panel-bg": "transparent",
  "panel-divider": "rgba(255,255,255,.06)",
  "panel-head-bg": "rgba(255,255,255,.02)",
  "panel-head-hover-bg": "rgba(255,255,255,.05)",
  "panel-head-fg": "#cbd5e1",
  "panel-body-fg": "#e5e7eb",
  "toolbar-btn-bg": "rgba(255,255,255,.12)",
  "toolbar-btn-hover-bg": "rgba(255,255,255,.22)",
  "toolbar-btn-fg": "#fff",
  "toolbar-btn-border": "rgba(255,255,255,.18)",
  "accent": "#3b82f6",
  "font": "ui-sans-serif,system-ui,sans-serif",
  "font-size": "13px",
  "toggle-bg": "rgba(20,20,24,.85)",
  "toggle-fg": "#e5e7eb",
};

const DEFAULT_LIGHT_VARS: Record<string, string> = {
  "dock-bg": "rgba(255,255,255,.96)",
  "dock-fg": "#1f2937",
  "dock-border": "rgba(0,0,0,.08)",
  "dock-radius": "0",
  "dock-shadow": "0 0 24px rgba(0,0,0,.12)",
  "panel-bg": "transparent",
  "panel-divider": "rgba(0,0,0,.06)",
  "panel-head-bg": "rgba(0,0,0,.02)",
  "panel-head-hover-bg": "rgba(0,0,0,.05)",
  "panel-head-fg": "#374151",
  "panel-body-fg": "#1f2937",
  "toolbar-btn-bg": "rgba(0,0,0,.06)",
  "toolbar-btn-hover-bg": "rgba(0,0,0,.12)",
  "toolbar-btn-fg": "#1f2937",
  "toolbar-btn-border": "rgba(0,0,0,.12)",
  "accent": "#2563eb",
  "font": "ui-sans-serif,system-ui,sans-serif",
  "font-size": "13px",
  "toggle-bg": "rgba(255,255,255,.92)",
  "toggle-fg": "#1f2937",
};

const STYLES = `
.ppt-host{
  --ppt-dock-bg:${DEFAULT_DARK_VARS["dock-bg"]};
  --ppt-dock-fg:${DEFAULT_DARK_VARS["dock-fg"]};
  --ppt-dock-border:${DEFAULT_DARK_VARS["dock-border"]};
  --ppt-dock-radius:${DEFAULT_DARK_VARS["dock-radius"]};
  --ppt-dock-shadow:${DEFAULT_DARK_VARS["dock-shadow"]};
  --ppt-panel-bg:${DEFAULT_DARK_VARS["panel-bg"]};
  --ppt-panel-divider:${DEFAULT_DARK_VARS["panel-divider"]};
  --ppt-panel-head-bg:${DEFAULT_DARK_VARS["panel-head-bg"]};
  --ppt-panel-head-hover-bg:${DEFAULT_DARK_VARS["panel-head-hover-bg"]};
  --ppt-panel-head-fg:${DEFAULT_DARK_VARS["panel-head-fg"]};
  --ppt-panel-body-fg:${DEFAULT_DARK_VARS["panel-body-fg"]};
  --ppt-toolbar-btn-bg:${DEFAULT_DARK_VARS["toolbar-btn-bg"]};
  --ppt-toolbar-btn-hover-bg:${DEFAULT_DARK_VARS["toolbar-btn-hover-bg"]};
  --ppt-toolbar-btn-fg:${DEFAULT_DARK_VARS["toolbar-btn-fg"]};
  --ppt-toolbar-btn-border:${DEFAULT_DARK_VARS["toolbar-btn-border"]};
  --ppt-accent:${DEFAULT_DARK_VARS["accent"]};
  --ppt-font:${DEFAULT_DARK_VARS["font"]};
  --ppt-font-size:${DEFAULT_DARK_VARS["font-size"]};
  --ppt-toggle-bg:${DEFAULT_DARK_VARS["toggle-bg"]};
  --ppt-toggle-fg:${DEFAULT_DARK_VARS["toggle-fg"]};
  /* 与编辑器 .ppt-scroll 同一套：暗色 --border / --muted-foreground */
  --ppt-scrollbar:#3a3a3a;
  --ppt-scrollbar-hover:#a1a1aa;
}
.ppt-host.theme-light{
  --ppt-dock-bg:${DEFAULT_LIGHT_VARS["dock-bg"]};
  --ppt-dock-fg:${DEFAULT_LIGHT_VARS["dock-fg"]};
  --ppt-dock-border:${DEFAULT_LIGHT_VARS["dock-border"]};
  --ppt-dock-shadow:${DEFAULT_LIGHT_VARS["dock-shadow"]};
  --ppt-panel-divider:${DEFAULT_LIGHT_VARS["panel-divider"]};
  --ppt-panel-head-bg:${DEFAULT_LIGHT_VARS["panel-head-bg"]};
  --ppt-panel-head-hover-bg:${DEFAULT_LIGHT_VARS["panel-head-hover-bg"]};
  --ppt-panel-head-fg:${DEFAULT_LIGHT_VARS["panel-head-fg"]};
  --ppt-panel-body-fg:${DEFAULT_LIGHT_VARS["panel-body-fg"]};
  --ppt-toolbar-btn-bg:${DEFAULT_LIGHT_VARS["toolbar-btn-bg"]};
  --ppt-toolbar-btn-hover-bg:${DEFAULT_LIGHT_VARS["toolbar-btn-hover-bg"]};
  --ppt-toolbar-btn-fg:${DEFAULT_LIGHT_VARS["toolbar-btn-fg"]};
  --ppt-toolbar-btn-border:${DEFAULT_LIGHT_VARS["toolbar-btn-border"]};
  --ppt-accent:${DEFAULT_LIGHT_VARS["accent"]};
  --ppt-toggle-bg:${DEFAULT_LIGHT_VARS["toggle-bg"]};
  --ppt-toggle-fg:${DEFAULT_LIGHT_VARS["toggle-fg"]};
  --ppt-scrollbar:#e4e4e7;
  --ppt-scrollbar-hover:#71717a;
}
@media (prefers-color-scheme: light){
  .ppt-host.theme-auto{
    --ppt-dock-bg:${DEFAULT_LIGHT_VARS["dock-bg"]};
    --ppt-dock-fg:${DEFAULT_LIGHT_VARS["dock-fg"]};
    --ppt-dock-border:${DEFAULT_LIGHT_VARS["dock-border"]};
    --ppt-dock-shadow:${DEFAULT_LIGHT_VARS["dock-shadow"]};
    --ppt-panel-divider:${DEFAULT_LIGHT_VARS["panel-divider"]};
    --ppt-panel-head-bg:${DEFAULT_LIGHT_VARS["panel-head-bg"]};
    --ppt-panel-head-hover-bg:${DEFAULT_LIGHT_VARS["panel-head-hover-bg"]};
    --ppt-panel-head-fg:${DEFAULT_LIGHT_VARS["panel-head-fg"]};
    --ppt-panel-body-fg:${DEFAULT_LIGHT_VARS["panel-body-fg"]};
    --ppt-toolbar-btn-bg:${DEFAULT_LIGHT_VARS["toolbar-btn-bg"]};
    --ppt-toolbar-btn-hover-bg:${DEFAULT_LIGHT_VARS["toolbar-btn-hover-bg"]};
    --ppt-toolbar-btn-fg:${DEFAULT_LIGHT_VARS["toolbar-btn-fg"]};
    --ppt-toolbar-btn-border:${DEFAULT_LIGHT_VARS["toolbar-btn-border"]};
    --ppt-accent:${DEFAULT_LIGHT_VARS["accent"]};
    --ppt-toggle-bg:${DEFAULT_LIGHT_VARS["toggle-bg"]};
    --ppt-toggle-fg:${DEFAULT_LIGHT_VARS["toggle-fg"]};
    --ppt-scrollbar:#e4e4e7;
    --ppt-scrollbar-hover:#71717a;
  }
}

.ppt-plugin-dock{
  position:absolute;
  box-sizing:border-box;
  background:var(--ppt-dock-bg);
  color:var(--ppt-dock-fg);
  border:1px solid var(--ppt-dock-border);
  border-radius:var(--ppt-dock-radius);
  box-shadow:var(--ppt-dock-shadow);
  display:flex;flex-direction:column;
  font-family:var(--ppt-font);
  font-size:var(--ppt-font-size);
  line-height:1.45;
  z-index:5;
  backdrop-filter:blur(6px);
  transition:transform .25s ease;
}
/* 位置变体 */
.ppt-plugin-dock.pos-right{right:0;top:0;bottom:0;height:100%;width:var(--ppt-dock-size,320px);transform:translateX(100%);border-left:1px solid var(--ppt-dock-border);}
.ppt-plugin-dock.pos-right.open{transform:translateX(0);}
.ppt-plugin-dock.pos-left{left:0;top:0;bottom:0;height:100%;width:var(--ppt-dock-size,320px);transform:translateX(-100%);border-right:1px solid var(--ppt-dock-border);}
.ppt-plugin-dock.pos-left.open{transform:translateX(0);}
.ppt-plugin-dock.pos-top{left:0;right:0;top:0;height:var(--ppt-dock-size,200px);transform:translateY(-100%);border-bottom:1px solid var(--ppt-dock-border);}
.ppt-plugin-dock.pos-top.open{transform:translateY(0);}
.ppt-plugin-dock.pos-bottom{left:0;right:0;bottom:0;height:var(--ppt-dock-size,200px);transform:translateY(100%);border-top:1px solid var(--ppt-dock-border);}
.ppt-plugin-dock.pos-bottom.open{transform:translateY(0);}

.ppt-plugin-dock-toggle{
  position:absolute;z-index:6;padding:0;
  background:var(--ppt-toggle-bg);color:var(--ppt-toggle-fg);
  border:1px solid var(--ppt-dock-border);cursor:pointer;font-size:14px;line-height:1;
  display:flex;align-items:center;justify-content:center;
}
.ppt-plugin-dock-toggle.pos-right{right:0;top:50%;transform:translateY(-50%);width:24px;height:60px;border-radius:6px 0 0 6px;border-right:none;}
.ppt-plugin-dock-toggle.pos-left{left:0;top:50%;transform:translateY(-50%);width:24px;height:60px;border-radius:0 6px 6px 0;border-left:none;}
.ppt-plugin-dock-toggle.pos-top{top:0;left:50%;transform:translateX(-50%);width:60px;height:24px;border-radius:0 0 6px 6px;border-top:none;}
.ppt-plugin-dock-toggle.pos-bottom{bottom:0;left:50%;transform:translateX(-50%);width:60px;height:24px;border-radius:6px 6px 0 0;border-bottom:none;}

.ppt-plugin-dock-body{flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:auto;padding:0;background:var(--ppt-panel-bg);}
.ppt-plugin-panel{flex:1 1 0;min-height:0;display:flex;flex-direction:column;border-bottom:1px solid var(--ppt-panel-divider);}
.ppt-plugin-panel.closed{flex:0 0 auto;}
.ppt-plugin-panel-head{
  flex:0 0 auto;
  display:flex;align-items:center;gap:8px;
  padding:10px 14px;cursor:pointer;
  user-select:none;font-weight:600;font-size:12px;
  color:var(--ppt-panel-head-fg);background:var(--ppt-panel-head-bg);
}
.ppt-plugin-panel-head:hover{background:var(--ppt-panel-head-hover-bg);}
.ppt-plugin-panel-head .chev{display:inline-flex;align-items:center;color:currentColor;transition:transform .15s;}
.ppt-plugin-panel.closed .ppt-plugin-panel-head .chev{transform:rotate(-90deg);}
.ppt-plugin-panel-body{flex:1 1 0;min-height:0;overflow:auto;padding:10px 14px 14px;color:var(--ppt-panel-body-fg);}
/* 与 packages/ui 的 .ppt-scroll 同一套，避免放映缩略图用系统 15px 滚动条。 */
.ppt-plugin-panel-body{
  scrollbar-color:var(--ppt-scrollbar) transparent;
  scrollbar-width:thin;
  scrollbar-gutter:stable;
}
.ppt-plugin-panel-body::-webkit-scrollbar{width:10px;height:10px;background:transparent;}
.ppt-plugin-panel-body::-webkit-scrollbar-track{background:transparent;}
.ppt-plugin-panel-body::-webkit-scrollbar-thumb{
  background-color:var(--ppt-scrollbar);
  border:2px solid transparent;
  background-clip:padding-box;
  border-radius:6px;
  min-height:24px;
  min-width:24px;
}
.ppt-plugin-panel-body::-webkit-scrollbar-thumb:hover{background-color:var(--ppt-scrollbar-hover);}
.ppt-plugin-panel-body::-webkit-scrollbar-corner{background:transparent;}
/* 缩略图条用类名做纵向 flex，不要写 inline display。收起规则必须能盖过它。 */
.ppt-thumb-list{display:flex;flex-direction:column;gap:8px;}
/* 面板 body 一旦是纵向 flex（缩略图条），子项默认 flex-shrink:1，会被挤成一条。由 body 自己滚动。 */
.ppt-plugin-panel-body>*{flex-shrink:0;}
/* !important：已发布分享页的脚本会把 body 写成 inline display:flex，普通规则盖不住，收起后只剩 24px 内边距。 */
.ppt-plugin-panel.closed .ppt-plugin-panel-body{display:none!important;}

.ppt-plugin-toolbar-btn{
  background:var(--ppt-toolbar-btn-bg);
  color:var(--ppt-toolbar-btn-fg);
  border:1px solid var(--ppt-toolbar-btn-border);
  padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;
  font-family:var(--ppt-font);
}
.ppt-plugin-toolbar-btn:hover{background:var(--ppt-toolbar-btn-hover-bg);}
.ppt-plugin-overlay-root{
  position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;
}
.ppt-plugin-overlay-root > *{pointer-events:auto;}

/* Headless floating panels — 当没有 dock 时插件 panel 走这个 */
.ppt-plugin-floating-panel{
  position:absolute;top:16px;right:16px;
  background:var(--ppt-dock-bg);color:var(--ppt-dock-fg);
  border:1px solid var(--ppt-dock-border);
  border-radius:8px;box-shadow:var(--ppt-dock-shadow);
  min-width:240px;max-width:360px;
  font-family:var(--ppt-font);font-size:var(--ppt-font-size);
  z-index:5;
}
.ppt-plugin-floating-panel + .ppt-plugin-floating-panel{margin-top:8px;}
`;

interface UIHostDeps {
  doc: Document;
  /** 顶层 host 容器（.ppt-host）。 */
  host: HTMLElement;
  /** 控制栏（.ppt-controls），可能为 null。 */
  controls: HTMLElement | null;
  /** stage（.ppt-stage），插件 overlay 跟它共享 transform。 */
  stage: HTMLElement;
  /** UI 配置。 */
  options: PluginUIOptions;
}

export function createPluginUI(deps: UIHostDeps): {
  ui: PluginUIHost;
  destroy: () => void;
} {
  const { doc, host, controls, stage, options } = deps;
  injectStyles(doc);
  applyHostConfig(host, options);

  const headless = options.headless === true;
  const dockPosition = options.dockPosition ?? "right";

  // dock 容器 — lazy
  let dock: HTMLDivElement | null = null;
  let dockBody: HTMLDivElement | null = null;
  let dockToggle: HTMLButtonElement | null = null;
  let dockOpen = false;
  const panelEntries: Array<{
    id: string;
    order: number;
    panelEl: HTMLDivElement;
    bodyEl: HTMLDivElement;
    rendered: boolean;
    render: PanelOptions["render"];
  }> = [];

  const ensureDock = (): void => {
    if (dock || headless) return;
    dock = doc.createElement("div");
    dock.className = `ppt-plugin-dock pos-${dockPosition}`;
    dockBody = doc.createElement("div");
    dockBody.className = "ppt-plugin-dock-body";
    dock.appendChild(dockBody);
    dockToggle = doc.createElement("button");
    dockToggle.className = `ppt-plugin-dock-toggle pos-${dockPosition}`;
    dockToggle.type = "button";
    dockToggle.title = "Toggle plugin panel";
    const dockIconPair: Record<string, [string, string]> = {
      right: ["chevron-left", "chevron-right"],
      left: ["chevron-right", "chevron-left"],
      top: ["chevron-down", "chevron-up"],
      bottom: ["chevron-up", "chevron-down"],
    };
    const pair0 = dockIconPair[dockPosition] ?? dockIconPair.right!;
    fillLucideIcon(doc, dockToggle, dockOpen ? pair0[1] : pair0[0], 16);
    dockToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setDockOpen(!dockOpen);
    });
    if (options.dockSize !== undefined) {
      dock.style.setProperty("--ppt-dock-size", `${options.dockSize}px`);
    }
    host.appendChild(dock);
    host.appendChild(dockToggle);
  };

  const setDockOpen = (open: boolean): void => {
    if (headless) return;
    if (!dock) {
      if (!open) return;
      ensureDock();
    }
    dockOpen = open;
    dock!.classList.toggle("open", open);
    if (dockToggle) {
      const swap: Record<string, [string, string]> = {
        right: ["chevron-left", "chevron-right"],
        left: ["chevron-right", "chevron-left"],
        top: ["chevron-down", "chevron-up"],
        bottom: ["chevron-up", "chevron-down"],
      };
      const pair = swap[dockPosition] ?? swap.right!;
      fillLucideIcon(doc, dockToggle, open ? pair[1] : pair[0], 16);
    }
    if (open) {
      for (const e of panelEntries) {
        if (e.rendered) continue;
        try {
          e.render(e.bodyEl);
        } catch (err) {
          console.error(`[ppt-player] panel '${e.id}' render threw`, err);
        }
        e.rendered = true;
      }
    }
  };

  const sortPanels = (): void => {
    if (!dockBody) return;
    panelEntries.sort((a, b) => a.order - b.order);
    for (const e of panelEntries) dockBody.appendChild(e.panelEl);
  };

  // overlay 根 — lazy
  let overlayRoot: HTMLDivElement | null = null;
  const ensureOverlayRoot = (): HTMLDivElement => {
    if (overlayRoot) return overlayRoot;
    overlayRoot = doc.createElement("div");
    overlayRoot.className = "ppt-plugin-overlay-root";
    // 持久 overlay：player 翻页会清空 stage 渲染产物，带此属性的层会被保留并 restack
    // 到顶部，让插件 overlay 不随翻页消失。
    overlayRoot.setAttribute("data-ppt-overlay", "");
    stage.appendChild(overlayRoot);
    return overlayRoot;
  };

  const addPanelToDock = (opts: PanelOptions): UIHandle => {
    ensureDock();
    const id = opts.id ?? `panel-${panelEntries.length + 1}`;
    const panelEl = doc.createElement("div");
    panelEl.className = "ppt-plugin-panel";
    const headEl = doc.createElement("div");
    headEl.className = "ppt-plugin-panel-head";
    const chev = doc.createElement("span");
    chev.className = "chev";
    fillLucideIcon(doc, chev, "chevron-down", 14);
    const titleEl = doc.createElement("span");
    titleEl.textContent = opts.title;
    headEl.appendChild(chev);
    headEl.appendChild(titleEl);
    const bodyEl = doc.createElement("div");
    bodyEl.className = "ppt-plugin-panel-body";
    panelEl.appendChild(headEl);
    panelEl.appendChild(bodyEl);
    const initialOpen = opts.initialOpen ?? true;
    if (!initialOpen) panelEl.classList.add("closed");
    headEl.addEventListener("click", () => panelEl.classList.toggle("closed"));

    const entry = {
      id,
      order: opts.order ?? 100,
      panelEl,
      bodyEl,
      rendered: false,
      render: opts.render,
    };
    panelEntries.push(entry);
    sortPanels();

    const initialDockOpen = options.dockInitialOpen;
    if (initialDockOpen === true && !dockOpen) setDockOpen(true);
    else if (initialDockOpen === undefined && !dockOpen && panelEntries.length === 1) {
      setDockOpen(true);
    } else if (dockOpen) {
      try {
        opts.render(bodyEl);
        entry.rendered = true;
      } catch (err) {
        console.error(`[ppt-player] panel '${id}' render threw`, err);
      }
    }

    return {
      remove: () => {
        panelEl.remove();
        const idx = panelEntries.indexOf(entry);
        if (idx >= 0) panelEntries.splice(idx, 1);
      },
    };
  };

  const addPanelHeadless = (opts: PanelOptions): UIHandle => {
    // Headless：在 host 上挂一个浮动面板。
    const panel = doc.createElement("div");
    panel.className = "ppt-plugin-floating-panel";
    const head = doc.createElement("div");
    head.className = "ppt-plugin-panel-head";
    head.textContent = opts.title;
    head.style.borderBottom = "1px solid var(--ppt-panel-divider)";
    const body = doc.createElement("div");
    body.className = "ppt-plugin-panel-body";
    panel.appendChild(head);
    panel.appendChild(body);
    host.appendChild(panel);
    try {
      opts.render(body);
    } catch (err) {
      console.error(`[ppt-player] floating panel '${opts.id ?? opts.title}' render threw`, err);
    }
    return { remove: () => panel.remove() };
  };

  const ui: PluginUIHost = {
    addPanel(opts) {
      return headless ? addPanelHeadless(opts) : addPanelToDock(opts);
    },

    addToolbarButton(opts: ToolbarButtonOptions): UIHandle {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "ppt-plugin-toolbar-btn";
      btn.textContent = opts.label;
      if (opts.tooltip) btn.title = opts.tooltip;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        try {
          opts.onClick(e);
        } catch (err) {
          console.error("[ppt-player] toolbar onClick threw", err);
        }
      });
      if (controls && !headless) {
        if (opts.position === "start") controls.insertBefore(btn, controls.firstChild);
        else {
          const ref = controls.querySelector(".ppt-progress");
          if (ref) controls.insertBefore(btn, ref);
          else controls.appendChild(btn);
        }
      } else {
        const floating = ensureFloatingBar(doc, host);
        floating.appendChild(btn);
      }
      return { remove: () => btn.remove() };
    },

    addOverlay(opts: OverlayOptions): UIHandle {
      const root = ensureOverlayRoot();
      const wrap = doc.createElement("div");
      wrap.style.position = "absolute";
      if (opts.bbox) {
        wrap.style.left = opts.bbox.x + "px";
        wrap.style.top = opts.bbox.y + "px";
        wrap.style.width = opts.bbox.w + "px";
        wrap.style.height = opts.bbox.h + "px";
      } else {
        wrap.style.left = "0";
        wrap.style.top = "0";
        wrap.style.width = "100%";
        wrap.style.height = "100%";
      }
      if (opts.zIndex !== undefined) wrap.style.zIndex = String(opts.zIndex);
      wrap.appendChild(opts.node);
      root.appendChild(wrap);
      return { remove: () => wrap.remove() };
    },

    mount(node: HTMLElement): UIHandle {
      host.appendChild(node);
      return { remove: () => node.remove() };
    },

    setDockOpen,
    toggleDock: () => setDockOpen(!dockOpen),
    isDockOpen: () => dockOpen,
    rootElement: () => host,
    stageElement: () => stage,
  };

  const destroy = (): void => {
    dock?.remove();
    dockToggle?.remove();
    overlayRoot?.remove();
    panelEntries.length = 0;
  };

  return { ui, destroy };
}

function applyHostConfig(host: HTMLElement, opts: PluginUIOptions): void {
  // 主题模式 className
  const mode = opts.themeMode ?? "dark";
  host.classList.remove("theme-dark", "theme-light", "theme-auto");
  host.classList.add(`theme-${mode}`);

  // 用户附加 className
  if (opts.hostClassName) {
    for (const cls of opts.hostClassName.split(/\s+/).filter(Boolean)) {
      host.classList.add(cls);
    }
  }

  // CSS 变量
  if (opts.cssVars) {
    for (const [k, v] of Object.entries(opts.cssVars)) {
      host.style.setProperty(`--ppt-${k}`, v);
    }
  }

  // 自定义 CSS
  if (opts.customCss) {
    const styleEl = host.ownerDocument.createElement("style");
    styleEl.setAttribute("data-ppt-plugin-user-css", "");
    styleEl.textContent = opts.customCss;
    host.appendChild(styleEl);
  }
}

function ensureFloatingBar(doc: Document, host: HTMLElement): HTMLDivElement {
  let bar = host.querySelector<HTMLDivElement>(".ppt-plugin-floating-bar");
  if (bar) return bar;
  bar = doc.createElement("div");
  bar.className = "ppt-plugin-floating-bar";
  Object.assign(bar.style, {
    position: "absolute",
    top: "8px",
    right: "8px",
    display: "flex",
    gap: "6px",
    zIndex: "6",
  });
  host.appendChild(bar);
  return bar;
}

let stylesInjected = false;
function injectStyles(doc: Document): void {
  if (stylesInjected) return;
  if (doc.head.querySelector(`style[data-style="${STYLES_ID}"]`)) {
    stylesInjected = true;
    return;
  }
  const el = doc.createElement("style");
  el.setAttribute("data-style", STYLES_ID);
  el.textContent = STYLES;
  doc.head.appendChild(el);
  stylesInjected = true;
}
