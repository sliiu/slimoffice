// 编辑器全局 UI 样式入口。
//
// 现在委托给 @sliiu/present-ui：注入设计 token（CSS 变量）+ 基础组件类 + 统一滚动条
// (.ppt-scroll)。浅/深色由宿主文档的 html.dark 决定，本模块不再强制暗色。
// 历史上这里维护过独立的滚动条 CSS，现已收敛到 @sliiu/present-ui，避免多处重复。
import { ensureUiStyles as ensureBaseUiStyles, SCROLL_CLASS as BASE_SCROLL_CLASS } from "@sliiu/present-ui";
const RIBBON_STYLE_ID = "ppt-editor-ribbon-style";
/** Editor top bar — 48px L|C|R; view bar / command row / status bar below. Legacy group/button classes still style popovers. */
const RIBBON_CSS = `
.ppt-ribbon-host,
.ppt-ribbon-root,
[data-ppt-ribbon-root] {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
  height: 48px;
  min-height: 48px;
  max-height: 48px;
  padding: 0 16px;
  color: var(--foreground);
  font: 12px var(--font-sans, "Geist", "Inter", ui-sans-serif, system-ui, sans-serif);
  user-select: none;
  background: var(--editor-ribbon, #181818);
  border-bottom: 1px solid var(--border, #3a3a3a);
  box-sizing: border-box;
}
.ppt-topbar-cluster {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0;
  box-sizing: border-box;
}
.ppt-topbar-left,
.ppt-topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 0;
}
.ppt-topbar-right { justify-content: flex-end; }
.ppt-topbar-center {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 1 auto;
  min-width: 0;
}
.ppt-topbar-slide-count {
  color: var(--muted-foreground);
  font: 12px var(--font-sans, inherit);
  white-space: nowrap;
}
.ppt-topbar-stash { display: none !important; }
.ppt-topbar-divider,
.ppt-topbar-share-sep {
  width: 1px;
  height: 22px;
  background: var(--editor-control-border, var(--border));
  flex-shrink: 0;
  margin: 0 4px;
}
.ppt-topbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--editor-control-border, var(--border));
  border-radius: var(--radius-header-btn, 6px);
  background: var(--editor-control, var(--secondary));
  color: var(--foreground);
  font: 13px var(--font-sans, inherit);
  cursor: pointer;
  transition: transform 160ms ease-out, background-color 120ms ease, border-color 120ms ease;
}
.ppt-topbar-btn:hover {
  background: var(--accent);
}
.ppt-topbar-btn:active { transform: scale(0.97); }
.ppt-topbar-btn[aria-expanded="true"] {
  background: var(--editor-tab-active, var(--accent));
}
/* Design v1: Share is the only indigo-filled CTA in the top bar.
   The view-bar play control is the other indigo fill. */
.ppt-topbar-btn--share {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #ffffff;
}
/* Two classes so this beats host rules like header button:not(:disabled):hover
   (playground index.html), which otherwise paint --accent over the white label. */
.ppt-topbar-btn.ppt-topbar-btn--share:hover,
.ppt-topbar-btn.ppt-topbar-btn--share[aria-expanded="true"] {
  background: #4338ca;
  border-color: #4338ca;
  color: #ffffff;
}
.ppt-topbar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--editor-control-border, var(--border));
  border-radius: var(--radius-header-btn, 6px);
  background: var(--editor-control, var(--secondary));
  color: var(--foreground);
  cursor: pointer;
  transition: transform 160ms ease-out, background-color 120ms ease;
}
.ppt-topbar-icon-btn:hover:not(:disabled) { background: var(--accent); }
.ppt-topbar-icon-btn:active:not(:disabled) { transform: scale(0.97); }
.ppt-topbar-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
/* View bar · command row · status bar. Density tokens live in @sliiu/present-ui. */
.ppt-view-bar,
.ppt-command-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 0 var(--space-2, 8px);
  box-sizing: border-box;
  background: var(--editor-ribbon, #181818);
  color: var(--foreground);
  font: var(--chrome-bar-font, 12px)/1.2 var(--font-sans, "Geist", "Inter", ui-sans-serif, system-ui, sans-serif);
  user-select: none;
}
.ppt-view-bar {
  justify-content: space-between;
  height: var(--chrome-view-bar-height, 40px);
  border-bottom: 1px solid var(--border, #3a3a3a);
}
.ppt-command-bar {
  height: var(--chrome-command-bar-height, 40px);
  min-height: var(--chrome-command-bar-height, 40px);
  /* 顶部分隔线画在内容盒里，内容盒保持 40px。28px 控件上下各余 6px，正好让出 6px 滚动条。 */
  box-shadow: inset 0 1px 0 var(--border, #3a3a3a);
}
.ppt-editor-root.ppt-reading .ppt-command-bar { display: none; }
.ppt-view-bar-left,
.ppt-view-bar-right,
.ppt-view-bar-center,
.ppt-view-seg,
.ppt-view-zoom {
  display: flex;
  align-items: center;
  gap: var(--chrome-bar-gap, 4px);
  min-width: 0;
}
.ppt-view-bar-center { flex: 0 0 auto; }
.ppt-view-bar-center[hidden] { display: none; }
.ppt-aid-color-pop {
  position: fixed;
  z-index: var(--z-dropdown, 1000);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--popover, #181818);
  color: var(--foreground);
  border: 1px solid var(--border, #3a3a3a);
  border-radius: var(--radius-md, 6px);
  box-shadow: var(--shadow-lg, 0 8px 30px rgba(0,0,0,0.45));
  font: 12px/1.2 var(--font-sans, "Geist", ui-sans-serif, system-ui, sans-serif);
}
.ppt-aid-color-reset {
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  cursor: pointer;
}
.ppt-aid-color-reset:hover { background: var(--accent); }
.ppt-aid-color-opacity { width: 96px; flex: 0 0 96px; }
.ppt-aid-color-opacity-value {
  min-width: 32px;
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}
/* 让缩放从画布列开始：宽度与宿主缩略图列对齐（宿主可覆写变量）。 */
.ppt-view-seg { width: var(--ppt-view-seg-width, 124px); flex: 0 0 auto; }
.ppt-view-bar-btn,
.ppt-view-zoom-value,
.ppt-quick-bar-btn,
.ppt-status-menu-btn,
.ppt-status-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 0 0 auto;
  height: var(--chrome-control-height, 28px);
  padding: 0 var(--space-2, 8px);
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, transform 120ms ease-out;
}
.ppt-view-bar-btn { width: 28px; padding: 0; }
.ppt-view-bar-play {
  display: inline-flex;
  align-items: stretch;
  flex: 0 0 auto;
  height: var(--chrome-control-height, 28px);
  border-radius: 6px;
  background: #4f46e5;
  color: #ffffff;
  overflow: hidden;
}
.ppt-view-bar-play:has(:active) { transform: scale(0.96); }
.ppt-view-bar-play .ppt-view-bar-btn {
  width: auto;
  height: 100%;
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: #ffffff;
}
.ppt-view-bar-play .ppt-view-bar-play-main { width: 28px; }
.ppt-view-bar-play .ppt-view-bar-play-more {
  width: 18px;
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.28);
}
.ppt-view-bar-play .ppt-view-bar-btn svg { color: #ffffff; }
.ppt-view-bar-play .ppt-view-bar-btn:hover:not(:disabled),
.ppt-view-bar-play .ppt-view-bar-btn[aria-expanded="true"] {
  background: #4338ca;
  color: #ffffff;
}
.ppt-view-bar-play .ppt-view-bar-btn:active:not(:disabled) { transform: none; }
@media (prefers-reduced-motion: reduce) {
  .ppt-view-bar-play:has(:active) { transform: none; }
}
.ppt-view-zoom-value {
  min-width: 48px;
  padding: 0 4px;
  color: var(--foreground);
  font-variant-numeric: tabular-nums;
}
.ppt-quick-bar-btn { color: var(--foreground); }
.ppt-quick-bar-btn svg { color: var(--muted-foreground); transition: color 120ms ease; }
.ppt-view-bar-btn svg,
.ppt-quick-bar-btn svg {
  width: var(--chrome-bar-icon, 16px);
  height: var(--chrome-bar-icon, 16px);
}
.ppt-view-bar-btn:hover:not(:disabled),
.ppt-view-zoom-value:hover,
.ppt-quick-bar-btn:hover:not(:disabled),
.ppt-status-menu-btn:hover,
.ppt-status-action-btn:hover {
  background: var(--accent);
  color: var(--foreground);
}
.ppt-quick-bar-btn:hover:not(:disabled) svg { color: var(--foreground); }
.ppt-view-bar-btn:active:not(:disabled),
.ppt-quick-bar-btn:active:not(:disabled) { transform: scale(0.96); }
.ppt-quick-bar-btn:disabled { opacity: 0.4; cursor: default; }
.ppt-view-bar-btn[aria-pressed="true"],
.ppt-quick-bar-btn[aria-pressed="true"],
.ppt-command-list-btn[aria-expanded="true"],
.ppt-status-menu-btn[aria-expanded="true"] {
  background: var(--editor-tab-active, var(--accent));
  color: var(--foreground);
}
.ppt-view-zoom-value[aria-pressed="true"] { color: var(--muted-foreground); }
.ppt-group-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  box-sizing: border-box;
  height: var(--chrome-control-height, 28px);
  padding: 0 8px 0 12px;
  border: 1px solid var(--editor-control-border, var(--border));
  border-radius: 9999px;
  background: var(--editor-control, var(--secondary));
  color: var(--foreground);
  font: 600 var(--chrome-bar-font, 12px)/1 var(--font-sans, inherit);
  cursor: pointer;
  transition: background-color 120ms ease, transform 120ms ease-out;
}
.ppt-group-pill svg { color: var(--muted-foreground); }
.ppt-group-pill:hover,
.ppt-group-pill[aria-expanded="true"] { background: var(--accent); }
.ppt-group-pill:active { transform: scale(0.97); }
.ppt-command-strip {
  display: flex;
  flex: 1 1 auto;
  /* 顶对齐：经典滚动条会吃掉内容盒底部，居中会把按钮抬到分组胶囊之上。 */
  align-items: flex-start;
  min-width: 0;
  height: 100%;
  padding-left: var(--space-2, 8px);
  overflow-x: auto;
  overflow-y: hidden;
  /* scrollbar-width / scrollbar-color 会让 Chromium 改用标准滚动条，thin 占 11px，盖住 28px 按钮。厚度只交给下面的 6px webkit 条。 */
  background:
    linear-gradient(var(--border, #3a3a3a), var(--border, #3a3a3a)) left center / 1px 16px no-repeat,
    linear-gradient(var(--border, #3a3a3a), var(--border, #3a3a3a)) right center / 1px 16px no-repeat;
  animation: ppt-strip-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
/* 列表弹层拿走真面板时，命令条留下的样子只负责占位，点击仍落到条上并关掉弹层。 */
.ppt-command-strip > [data-ppt-strip-hold] { pointer-events: none; }
.ppt-command-strip::-webkit-scrollbar { height: 6px; background: transparent; }
.ppt-command-strip::-webkit-scrollbar-track { background: transparent; }
.ppt-command-strip::-webkit-scrollbar-thumb {
  background-color: var(--border, #3a3a3a);
  border-radius: 6px;
}
.ppt-command-strip::-webkit-scrollbar-thumb:hover { background-color: var(--muted-foreground); }
@supports not selector(::-webkit-scrollbar) {
  .ppt-command-strip {
    scrollbar-width: thin;
    scrollbar-color: var(--border, #3a3a3a) transparent;
  }
}
.ppt-command-list-btn { flex: 0 0 auto; }
.ppt-command-list-btn:disabled { opacity: 0.4; cursor: default; }
.ppt-command-common {
  display: flex;
  align-items: center;
  gap: 2px;
  height: var(--chrome-command-bar-height, 40px);
  min-height: var(--chrome-command-bar-height, 40px);
  flex-shrink: 0;
}
.ppt-command-sep {
  flex: 0 0 auto;
  width: 1px;
  height: 16px;
  margin: 0 6px;
  background: var(--border, #3a3a3a);
}
.ppt-command-strip .ppt-ribbon-panel {
  display: flex;
  flex: 0 0 auto;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  width: max-content;
  min-width: max-content;
  height: var(--chrome-command-bar-height, 40px);
  min-height: var(--chrome-command-bar-height, 40px);
  overflow: visible;
}
.ppt-command-strip .ppt-ribbon-group {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: auto;
  flex: 0 0 auto;
  min-width: max-content;
  height: var(--chrome-command-bar-height, 40px);
  min-height: var(--chrome-command-bar-height, 40px);
  padding: 0 var(--space-2, 8px);
  border-right: none;
  background: linear-gradient(var(--border, #3a3a3a), var(--border, #3a3a3a)) right center / 1px 16px no-repeat;
}
.ppt-command-strip .ppt-ribbon-panel:first-child > .ppt-ribbon-group:first-child { padding-left: 0; }
.ppt-command-strip > :last-child > .ppt-ribbon-group:last-child,
.ppt-command-strip > .ppt-ribbon-group:last-child { background: none; }
.ppt-command-strip .ppt-ribbon-group__rows {
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  align-content: center;
  min-width: max-content;
  gap: var(--chrome-bar-gap, 4px);
}
.ppt-command-strip .ppt-ribbon-group__label,
.ppt-command-strip .ppt-ribbon-group__label[hidden] { display: none; }
.ppt-command-strip .ppt-ribbon-btn,
.ppt-command-strip .ppt-ribbon-icon-btn { font-size: var(--chrome-bar-font, 12px); }
/* 这条命令里已经有纯图标时，其余带图标的按钮收成 24px。没有图标的文字按钮、以及「更多」保留文字。列表弹层不在命令条里，短名称照旧显示。 */
.ppt-command-strip.ppt-command-strip--icon-uniform .ppt-ribbon-btn--named:not(.ppt-ribbon-btn--keep-label) {
  padding: 0;
  min-width: 24px;
  width: 24px;
  height: 24px;
  gap: 0;
}
.ppt-command-strip.ppt-command-strip--icon-uniform .ppt-ribbon-btn--named:not(.ppt-ribbon-btn--keep-label) .ppt-ribbon-btn__label {
  display: none;
}
.ppt-command-strip.ppt-command-strip--icon-uniform .ppt-quick-bar-btn {
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
}
.ppt-command-strip.ppt-command-strip--icon-uniform .ppt-quick-bar-btn > span > span {
  display: none;
}
.ppt-command-strip.ppt-command-strip--icon-uniform .ppt-command-common { gap: 0; }
.ppt-command-strip.ppt-command-strip--icon-uniform .ppt-command-sep { margin: 0 4px; }
.ppt-command-strip .ppt-ribbon-btn svg,
.ppt-command-strip .ppt-ribbon-icon-btn svg {
  width: var(--chrome-bar-icon, 16px);
  height: var(--chrome-bar-icon, 16px);
}
.ppt-status-start,
.ppt-status-end {
  display: flex;
  align-items: center;
  gap: var(--chrome-bar-gap, 4px);
  flex: 0 0 auto;
}
.ppt-status-menu-btn,
.ppt-status-action-btn {
  height: 24px;
  gap: 4px;
  font: 12px/1 var(--font-sans, inherit);
}
.ppt-status-action-btn {
  color: var(--foreground);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ppt-view-bar-btn:focus-visible,
.ppt-view-zoom-value:focus-visible,
.ppt-quick-bar-btn:focus-visible,
.ppt-group-pill:focus-visible,
.ppt-status-menu-btn:focus-visible,
.ppt-status-action-btn:focus-visible,
.ppt-command-strip .ppt-ribbon-btn:focus-visible,
.ppt-command-strip .ppt-ribbon-icon-btn:focus-visible,
.ppt-selection-format-btn:focus-visible,
.ppt-selection-format-label:focus-visible,
.ppt-selection-format-size:focus-visible,
.ppt-selection-format-color:focus-visible,
.ppt-editor-root:focus-visible,
.ppt-notes-area:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: 1px;
}
.ppt-status-action-btn[hidden] { display: none !important; }
.ppt-editor-root.ppt-right-panel-cover .ppt-right-panel-resizer { display: none; }
.ppt-editor-root button,
.ppt-view-bar button,
.ppt-command-bar button,
.ppt-status-bar button {
  touch-action: manipulation;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
@media (pointer: coarse) {
  .ppt-notes-area { font-size: 16px !important; }
}
@media (max-width: 720px) {
  .ppt-status-bar { gap: 4px !important; }
  .ppt-status-cluster {
    position: static !important;
    transform: none !important;
    flex: 1 1 auto;
    min-width: 0;
    max-width: none !important;
    overflow: hidden;
  }
  .ppt-command-bar {
    padding-left: 4px;
    padding-right: 4px;
    gap: 4px;
  }
  .ppt-command-strip { padding-left: 4px; }
}
@media (max-width: 420px) {
  .ppt-group-pill { position: relative; padding: 0 8px; }
  .ppt-group-pill-label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
/* AI 点选模式：选区旁的 AI 输入框。 */
.ppt-ai-inline {
  position: fixed;
  z-index: 31;
  display: none;
  flex-direction: column;
  gap: 6px;
  width: 420px;
  max-width: calc(100vw - 16px);
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--primary, #4F46E5) 45%, var(--border));
  border-radius: 10px;
  background: var(--popover, var(--editor-ribbon, #181818));
  color: var(--foreground);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  font: 13px/1.4 var(--font-sans, system-ui, sans-serif);
}
.ppt-ai-inline-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.ppt-ai-inline-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  color: var(--primary, #4F46E5);
}
.ppt-ai-inline-input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 28px;
  max-height: 120px;
  margin: 0;
  padding: 5px 4px;
  line-height: 18px;
  overflow-y: auto;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: inherit;
  font: inherit;
  box-sizing: border-box;
}
.ppt-ai-inline-input::placeholder { color: var(--muted-foreground); }
.ppt-ai-inline-send,
.ppt-ai-inline-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-self: flex-end;
  padding: 0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 120ms ease, transform 120ms ease-out;
}
.ppt-ai-inline-send {
  background: var(--primary, #4F46E5);
  color: var(--primary-foreground, #fff);
}
.ppt-ai-inline-send:disabled { opacity: 0.4; cursor: default; }
.ppt-ai-inline-close {
  background: transparent;
  color: var(--muted-foreground);
}
.ppt-ai-inline-close:hover { background: var(--accent); color: var(--foreground); }
.ppt-ai-inline-send:not(:disabled):active,
.ppt-ai-inline-close:active { transform: scale(0.97); }
.ppt-ai-inline-send:focus-visible,
.ppt-ai-inline-close:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: 1px;
}
.ppt-ai-inline-status {
  max-height: 160px;
  overflow-y: auto;
  padding: 4px 6px 2px;
  border-top: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ppt-ai-inline-status[hidden] { display: none; }
.ppt-ai-inline-status[data-kind="error"] { color: var(--destructive); }
.ppt-ai-inline-status[data-kind="done"] { color: var(--foreground); }
/* 选区旁短格式条。每次点选都会出现，不做进出动画。 */
.ppt-selection-format {
  position: fixed;
  z-index: 30;
  display: none;
  align-items: center;
  gap: 2px;
  height: 36px;
  padding: 0 4px;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--popover, var(--editor-ribbon, #181818));
  color: var(--foreground);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  user-select: none;
}
.ppt-selection-format-sec {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ppt-selection-format-sec[hidden],
.ppt-selection-format-sep[hidden] { display: none; }
.ppt-selection-format-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--border);
}
.ppt-selection-format-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  transition: background-color 120ms ease, transform 120ms ease-out;
}
.ppt-selection-format-btn:hover { background: var(--accent); }
.ppt-selection-format-btn:active { transform: scale(0.97); }
.ppt-selection-format-btn[aria-pressed="true"] {
  background: var(--editor-tab-active, var(--accent));
}
.ppt-selection-format-label {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  font: 12px/1 var(--font-sans, inherit);
  white-space: nowrap;
  cursor: pointer;
}
.ppt-selection-format-label:hover { background: var(--accent); }
.ppt-selection-format-label:active { transform: scale(0.97); }
.ppt-selection-format-stepper {
  display: inline-flex;
  align-items: stretch;
  height: 28px;
  border: 1px solid var(--editor-control-border, var(--border));
  border-radius: 6px;
  background: var(--editor-control, var(--secondary));
  overflow: hidden;
}
.ppt-selection-format-size {
  width: 30px;
  height: 28px;
  margin: 0;
  padding: 0 2px 0 4px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--foreground);
  font: 12px/1 var(--font-sans, inherit);
  box-sizing: border-box;
  appearance: textfield;
  -moz-appearance: textfield;
  user-select: text;
}
.ppt-selection-format-size::-webkit-outer-spin-button,
.ppt-selection-format-size::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.ppt-selection-format-spin {
  display: flex;
  flex-direction: column;
  width: 16px;
  border-left: 1px solid var(--editor-control-border, var(--border));
}
.ppt-selection-format-spin-btn {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
}
.ppt-selection-format-spin-btn + .ppt-selection-format-spin-btn {
  border-top: 1px solid var(--editor-control-border, var(--border));
}
.ppt-selection-format-spin-btn:hover { background: var(--accent); }
.ppt-selection-format-color {
  width: 28px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--editor-control-border, var(--border));
  border-radius: 6px;
  background: var(--editor-control, var(--secondary));
  cursor: pointer;
  box-sizing: border-box;
}
@media (prefers-reduced-motion: reduce) {
  .ppt-selection-format-btn,
  .ppt-selection-format-label { transition: none; }
  .ppt-selection-format-btn:active,
  .ppt-selection-format-label:active { transform: none; }
}
@media print {
  .ppt-selection-format { display: none !important; }
}
/* 分组切换弹层：常用 + 九组。完整命令由命令条右侧列表按钮展开。 */
.ppt-chrome-popover.ppt-group-popover {
  width: min(440px, 94vw);
  min-width: min(320px, 94vw);
  --ppt-chrome-pad: 8px;
  gap: 4px;
}
.ppt-group-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 2px;
}
.ppt-group-chip {
  height: 32px;
  padding: 0 6px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted-foreground);
  font: 13px/1 var(--font-sans, inherit);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, transform 120ms ease-out;
}
.ppt-group-chip:hover { background: var(--accent); color: var(--popover-foreground); }
.ppt-group-chip:active { transform: scale(0.97); }
.ppt-group-chip[aria-selected="true"] {
  background: var(--accent);
  color: var(--popover-foreground);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--border);
}
.ppt-group-chip[data-group="experimental"],
.ppt-group-chip[data-group="experimental"]:hover,
.ppt-group-chip[data-group="experimental"][aria-selected="true"] {
  color: var(--warning, #d97706);
}
.ppt-group-chip:focus-visible { outline: 2px solid #4F46E5; outline-offset: 1px; }
@media (max-width: 720px) {
  .ppt-chrome-popover.ppt-group-popover {
    width: calc(100vw - 16px);
    min-width: 0;
    max-height: min(520px, calc(100dvh - 16px));
  }
  .ppt-group-grid {
    grid-template-columns: 1fr 1fr;
    min-height: 0;
    overflow-y: auto;
  }
  .ppt-group-chip {
    height: auto;
    min-height: 40px;
    padding: 8px 10px;
    white-space: normal;
    line-height: 1.25;
    text-align: start;
  }
}
@keyframes ppt-strip-in {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .ppt-command-strip { animation: none; }
}
.ppt-topbar-menu-item[role="menuitemradio"] { padding-left: 28px; position: relative; }
.ppt-topbar-menu-item[aria-checked="true"] { font-weight: 600; }
.ppt-topbar-menu-item[aria-checked="true"]::before {
  content: "";
  position: absolute;
  left: 11px;
  top: 50%;
  width: 8px;
  height: 4px;
  border-left: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-70%) rotate(-45deg);
}
.ppt-topbar-popover,
.ppt-topbar-menu {
  position: fixed;
  z-index: var(--z-sticky, 1100);
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  width: min(320px, 94vw);
  max-width: min(360px, 94vw);
  max-height: min(70vh, 560px);
  overflow: auto;
  padding: 8px;
  box-sizing: border-box;
  background: var(--popover);
  color: var(--popover-foreground);
  color-scheme: inherit;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  transform-origin: top left;
  animation: ppt-pop-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ppt-topbar-menu {
  flex-direction: column;
  flex-wrap: nowrap;
  min-width: 12rem;
  max-width: 18rem;
  max-height: min(420px, 70vh);
  padding: 4px;
}
.ppt-topbar-menu[data-ppt-quick-shapes] {
  width: max-content;
  min-width: 8.5rem;
  max-width: 14rem;
}
.ppt-topbar-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: 13px var(--font-sans, inherit);
  cursor: pointer;
}
.ppt-topbar-menu-item:hover { background: var(--accent); color: var(--popover-foreground); }
.ppt-topbar-menu-item:active { transform: scale(0.98); }
@keyframes ppt-pop-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .ppt-topbar-popover,
  .ppt-topbar-menu,
  .ppt-chrome-popover,
  .ppt-chrome-menu {
    animation: none;
  }
}
/* Anchored chrome popovers follow document appearance via --popover (.dark on html). */
.ppt-chrome-popover,
.ppt-chrome-menu {
  position: fixed;
  z-index: var(--z-sticky, 1100);
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  width: min(400px, 94vw);
  min-width: min(360px, 94vw);
  max-height: min(520px, 70vh);
  overflow: hidden;
  --ppt-chrome-pad: 16px;
  padding: var(--ppt-chrome-pad);
  box-sizing: border-box;
  background: var(--popover);
  color: var(--popover-foreground);
  color-scheme: inherit;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  transform-origin: top left;
  animation: ppt-pop-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.ppt-chrome-popover.ppt-chrome-popover--commands {
  width: min(280px, 94vw);
  min-width: min(240px, 94vw);
  --ppt-chrome-pad: 6px;
}
.ppt-chrome-popover.ppt-chrome-popover--tabs {
  width: min(1040px, calc(100vw - 16px));
  min-width: min(560px, calc(100vw - 16px));
  max-height: min(320px, 70vh);
  padding: 0;
  overflow: hidden;
}
.ppt-chrome-tabs {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  gap: 2px;
  overflow-x: auto;
  padding: 0 8px;
  border-bottom: 1px solid var(--border);
  scrollbar-width: thin;
}
.ppt-chrome-tab {
  flex: 0 0 auto;
  margin: 0;
  padding: 12px 12px 10px;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--muted-foreground);
  font: 13px/1.2 var(--font-sans, inherit);
  white-space: nowrap;
  cursor: pointer;
}
.ppt-chrome-tab:hover { color: var(--popover-foreground); }
.ppt-chrome-tab:active { transform: scale(0.98); }
.ppt-chrome-tab[aria-selected="true"] {
  color: var(--popover-foreground);
  font-weight: 600;
  border-bottom-color: var(--popover-foreground);
}
.ppt-chrome-tab:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: -2px;
}
.ppt-chrome-strip {
  display: flex;
  flex: 1 1 auto;
  flex-direction: row;
  align-items: flex-start;
  gap: 0;
  min-height: 76px;
  overflow: auto;
  padding: 8px 10px 10px;
  box-sizing: border-box;
  color: var(--popover-foreground);
  font: 12px/1.3 var(--font-sans, inherit);
}
.ppt-chrome-strip .ppt-ribbon-panel {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  width: max-content;
  min-width: 0;
  overflow: visible;
}
.ppt-chrome-strip .ppt-ribbon-group {
  width: auto;
  flex: 0 0 auto;
  border-right: 1px solid var(--border);
  padding: 2px 8px;
}
.ppt-chrome-strip .ppt-ribbon-group:last-child { border-right: none; }
.ppt-chrome-strip .ppt-ribbon-group__label {
  position: static;
  order: 0;
  text-align: center;
  text-transform: none;
  letter-spacing: 0.02em;
  font: 600 var(--chrome-bar-font, 12px)/1.2 var(--font-sans, inherit);
  color: var(--muted-foreground);
  margin-top: 4px;
  padding: 0;
  background: transparent;
}
.ppt-chrome-strip .ppt-ribbon-group__label[hidden] { display: none; }
.ppt-chrome-strip .ppt-ribbon-btn,
.ppt-chrome-strip .ppt-ribbon-icon-btn,
.ppt-chrome-strip .ppt-ribbon-input,
.ppt-chrome-strip select.ppt-ribbon-input {
  color: var(--popover-foreground);
}
.ppt-chrome-strip .ppt-ribbon-btn:hover:not(:disabled),
.ppt-chrome-strip .ppt-ribbon-icon-btn:hover:not(:disabled) {
  background: var(--accent);
  border-color: transparent;
}
.ppt-chrome-strip .ppt-ribbon-btn--pressed {
  background: var(--accent) !important;
  border-color: transparent !important;
  box-shadow: inset 0 0 0 1px var(--border);
  font-weight: 600;
}
.ppt-chrome-strip .ppt-ribbon-btn:focus-visible,
.ppt-chrome-strip .ppt-ribbon-icon-btn:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: 1px;
}
.ppt-chrome-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.ppt-chrome-rule {
  height: 1px;
  margin: 6px 8px;
  background: var(--border);
  flex-shrink: 0;
}
.ppt-chrome-section {
  font: 600 var(--chrome-bar-font, 12px)/1.3 var(--font-sans, inherit);
  letter-spacing: 0.04em;
  color: var(--muted-foreground);
  margin: 0 0 8px;
}
.ppt-chrome-section--more {
  margin-top: 14px;
  font-weight: 500;
  color: var(--muted-foreground);
}
.ppt-chrome-common-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ppt-chrome-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  min-height: 72px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--background);
  color: var(--popover-foreground);
  font: 600 13px/1.3 var(--font-sans, inherit);
  text-align: left;
  cursor: pointer;
}
.ppt-chrome-card:hover { background: var(--accent); }
.ppt-chrome-card:active { transform: scale(0.98); }
.ppt-chrome-card:focus-visible,
.ppt-chrome-card[aria-selected="true"] {
  outline: 2px solid #4F46E5;
  outline-offset: 1px;
}
.ppt-chrome-card-icon { color: var(--muted-foreground); }
.ppt-chrome-more-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ppt-chrome-more-item,
.ppt-chrome-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--muted-foreground);
  font: 13px/1.3 var(--font-sans, inherit);
  cursor: pointer;
}
.ppt-chrome-more-item:hover,
.ppt-chrome-menu-item:hover { background: var(--accent); color: var(--popover-foreground); }
.ppt-chrome-more-item:active,
.ppt-chrome-menu-item:active { transform: scale(0.98); }
.ppt-chrome-more-item[aria-pressed="true"] {
  background: var(--accent);
  color: var(--popover-foreground);
  font-weight: 600;
  box-shadow: inset 0 0 0 1px var(--border);
}
.ppt-chrome-nav {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: calc(var(--ppt-chrome-pad) * -1) calc(var(--ppt-chrome-pad) * -1) 8px;
  padding: 12px var(--ppt-chrome-pad) 8px;
  background: var(--popover);
  border-bottom: 1px solid var(--border);
}
.ppt-chrome-nav[hidden] { display: none !important; }
.ppt-chrome-back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 28px;
  padding: 0 8px 0 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--popover-foreground);
  font: 13px/1 var(--font-sans, inherit);
  cursor: pointer;
}
.ppt-chrome-back:hover { background: var(--accent); }
.ppt-chrome-back:active { transform: scale(0.98); }
.ppt-chrome-back:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: 1px;
}
.ppt-chrome-nav-title {
  min-width: 0;
  font: 600 13px/1.3 var(--font-sans, inherit);
  color: var(--popover-foreground);
}
.ppt-chrome-drill {
  margin-left: auto;
  color: var(--muted-foreground);
  flex: 0 0 auto;
}
.ppt-chrome-more-item:focus-visible,
.ppt-chrome-menu-item:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: 1px;
}
.ppt-chrome-card--primary {
  grid-column: 1 / -1;
  min-height: 80px;
}
.ppt-chrome-card-sub {
  font: 400 12px/1.3 var(--font-sans, inherit);
  color: var(--muted-foreground);
}
.ppt-chrome-footnote {
  margin: 10px 0 0;
  font: 400 11px/1.4 var(--font-sans, inherit);
  color: var(--muted-foreground);
}
.ppt-command-strip .ppt-chrome-footnote {
  margin: 0;
  align-self: center;
  line-height: 1;
}
.ppt-chrome-share-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1300);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}
.ppt-chrome-share-modal {
  width: min(440px, 94vw);
  padding: 20px;
  border-radius: 20px;
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
  box-sizing: border-box;
}
.ppt-chrome-share-title {
  margin: 0 0 8px;
  font: 600 16px/1.3 var(--font-sans, inherit);
}
.ppt-chrome-share-blurb {
  margin: 0 0 14px;
  font: 400 13px/1.5 var(--font-sans, inherit);
  color: var(--muted-foreground);
}
.ppt-chrome-share-label {
  display: block;
  margin: 0 0 6px;
  font: 500 12px/1.3 var(--font-sans, inherit);
  color: var(--muted-foreground);
}
.ppt-chrome-share-link {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 16px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--popover-foreground);
  font: 13px var(--font-sans, inherit);
}
.ppt-chrome-share-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.ppt-chrome-share-cancel {
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--popover);
  color: var(--popover-foreground);
  font: 13px var(--font-sans, inherit);
  cursor: pointer;
}
.ppt-chrome-share-copy {
  height: 36px;
  padding: 0 14px;
  border: 1px solid #4F46E5;
  border-radius: 8px;
  background: #4F46E5;
  color: #ffffff;
  font: 600 13px var(--font-sans, inherit);
  cursor: pointer;
}
.ppt-chrome-share-copy:hover { background: #4338ca; border-color: #4338ca; }
.ppt-chrome-share-copy:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* 外壳带着 8px 内边距。若整层 overflow:auto，分组标题 sticky top:0 钉在内边距下沿，上一组会从标题上方的缝里穿出去。 */
.ppt-topbar-popover.ppt-command-host {
  overflow: hidden;
  --ppt-command-popover-max: min(70vh, 560px);
  max-height: var(--ppt-command-popover-max);
}
.ppt-command-scroll {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  max-height: calc(var(--ppt-command-popover-max) - 18px);
}
.ppt-command-host .ppt-ribbon-panel {
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  overflow: visible;
}
.ppt-command-host .ppt-ribbon-group {
  width: 100%;
  border-right: none;
  padding: 0;
}
.ppt-command-host .ppt-ribbon-group__label {
  order: -1;
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  text-transform: none;
  letter-spacing: 0.04em;
  font: 600 var(--chrome-bar-font, 12px)/1.3 var(--font-sans, inherit);
  color: var(--muted-foreground);
  margin: 0;
  padding: 10px 8px 4px;
  background: var(--popover);
}
.ppt-command-host .ppt-ribbon-group:first-child .ppt-ribbon-group__label {
  padding-top: 2px;
}
.ppt-command-host .ppt-ribbon-group__label[hidden] {
  display: none;
}
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-group__rows,
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-group__row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  gap: 2px;
}
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-btn {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  width: 100% !important;
  height: auto !important;
  min-height: 32px !important;
  min-width: 0 !important;
  padding: 7px 10px !important;
  box-sizing: border-box;
  border-color: transparent !important;
  border-radius: 8px;
  background: transparent !important;
  color: var(--popover-foreground);
  font: 13px/1.3 var(--font-sans, inherit);
  gap: 8px;
}
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-btn:hover:not(:disabled) {
  background: var(--accent) !important;
  border-color: transparent !important;
}
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-btn:active:not(:disabled) {
  transform: scale(0.98);
}
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-btn:focus-visible {
  outline: 2px solid #4F46E5;
  outline-offset: 1px;
}
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-btn svg {
  flex: 0 0 auto;
}
.ppt-command-host .ppt-ribbon-group--menu .ppt-ribbon-btn--pressed,
.ppt-command-host .ppt-ribbon-btn--pressed {
  background: var(--accent) !important;
  border-color: transparent !important;
  box-shadow: inset 0 0 0 1px var(--border);
  font-weight: 600;
}
.ppt-command-host .ppt-ribbon-group--tools .ppt-ribbon-group__rows {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  align-content: flex-start;
  gap: 4px;
  padding: 0 4px 8px;
}
.ppt-command-host .ppt-ribbon-group--tools .ppt-ribbon-group__row {
  display: contents;
}
.ppt-command-host .ppt-ribbon-group--tools .ppt-ribbon-btn,
.ppt-command-host .ppt-ribbon-group--tools .ppt-ribbon-icon-btn {
  color: var(--popover-foreground);
  min-width: 28px;
  min-height: 28px;
}
.ppt-command-host .ppt-ribbon-group--tools .ppt-ribbon-btn:hover:not(:disabled) {
  background: var(--accent);
  border-color: transparent;
}
.ppt-command-host .ppt-ribbon-input,
.ppt-command-host select.ppt-ribbon-input {
  max-width: 100%;
  background: var(--background);
  color: var(--popover-foreground);
  border-color: var(--border);
}

.ppt-ribbon-tab-row {
  position: relative;
  display: flex;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  min-height: 28px;
  background: var(--editor-ribbon, #181818);
  border-bottom: 1px solid var(--border, #3a3a3a);
}
.ppt-ribbon-tab-scroll {
  display: flex;
  flex: 1;
  min-width: 0;
  justify-content: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 8px;
}
.ppt-ribbon-tab-inner {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
}
.ppt-ribbon-tab-actions {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  border-left: 1px solid var(--border, #3a3a3a);
  padding: 0 4px 0 2px;
  background: var(--editor-ribbon, #181818);
}

.ppt-ribbon-content {
  display: flex;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  height: 72px;
  min-height: 72px;
  max-height: 72px;
  overflow: hidden;
  padding: 0 4px;
  box-sizing: border-box;
  background: var(--editor-ribbon, #181818);
}
.ppt-ribbon-content-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  flex: 1 1 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  justify-content: center;
}
.ppt-ribbon-panel {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}

.ppt-ribbon-group {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-right: 1px solid var(--editor-control-border, #3a3a3a);
  padding: 2px 4px;
  min-width: 0;
  box-sizing: border-box;
}
.ppt-ribbon-group__rows {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 2px;
  flex: 1 1 auto;
  min-height: 0;
  align-content: center;
  align-items: center;
  justify-content: flex-start;
}
/* 行包装层不占盒模型，子控件直接参与组内瀑布流换行。 */
.ppt-ribbon-group__row {
  display: contents;
}
.ppt-ribbon-group select.ppt-ribbon-input {
  max-width: 88px;
}
.ppt-ribbon-group__label {
  flex-shrink: 0;
  font-size: var(--chrome-bar-font, 12px);
  line-height: 1.2;
  color: var(--muted-foreground);
  text-align: center;
  margin-top: 2px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ppt-ribbon-btn {
  background: transparent;
  color: var(--foreground);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
  white-space: nowrap;
  transition: background-color .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease;
}
.ppt-ribbon-btn--text {
  padding: 3px 6px;
  min-width: 26px;
  height: 24px;
}
.ppt-ribbon-btn--glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 24px;
  gap: 6px;
  padding: 0;
  min-width: 24px;
  width: 24px;
}
.ppt-ribbon-btn--named {
  padding: 3px 6px;
  min-width: 26px;
  width: auto;
}
.ppt-ribbon-btn:hover:not(:disabled) {
  background: var(--accent, #333333);
  border-color: var(--editor-control-border, #3a3a3a);
}
.ppt-ribbon-btn--pressed {
  background: color-mix(in srgb, var(--primary) 12%, var(--accent, #333333));
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
}
.ppt-ribbon-btn--pressed:hover:not(:disabled) {
  background: color-mix(in srgb, var(--primary) 16%, var(--accent, #333333));
  border-color: var(--primary);
}
.ppt-ribbon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ppt-exp-badge {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning, #fbbf24) 18%, transparent);
  color: var(--warning, #d97706);
}
.ppt-ribbon-input:disabled,
.ppt-ribbon-swatch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ppt-ribbon-root svg {
  pointer-events: none;
}
.ppt-ribbon-tooltip {
  position: fixed;
  z-index: var(--z-toast, 1400);
  pointer-events: none;
  background: var(--popover, #242424);
  color: var(--popover-foreground, var(--foreground));
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font: 12px var(--font-sans, system-ui, sans-serif);
  line-height: 1.35;
  max-width: 260px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
  white-space: normal;
}
.ppt-ribbon-tooltip[hidden] {
  display: none !important;
}

.ppt-ribbon-tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  background: transparent;
  color: var(--muted-foreground);
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  padding: 4px 10px;
  margin-bottom: -1px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1.25;
  transition: color .12s ease, border-color .12s ease;
}
.ppt-ribbon-tab:hover:not(.ppt-ribbon-tab--active) {
  color: var(--foreground);
}
.ppt-ribbon-tab--active {
  color: var(--foreground);
  font-weight: 500;
  border-bottom-color: var(--primary);
}
.ppt-ribbon-tab--experimental {
  color: var(--warning, #d97706);
}
.ppt-ribbon-tab--experimental:hover:not(.ppt-ribbon-tab--active) {
  color: var(--warning, #d97706);
}
.ppt-ribbon-tab--experimental.ppt-ribbon-tab--active {
  color: var(--warning, #d97706);
  border-bottom-color: var(--warning, #d97706);
}

.ppt-ribbon-icon-btn {
  background: transparent;
  color: var(--muted-foreground);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color .12s ease, color .12s ease, border-color .12s ease;
}
.ppt-ribbon-icon-btn:hover {
  background: var(--accent, #333333);
  border-color: var(--editor-control-border, #3a3a3a);
  color: var(--foreground);
}

.ppt-ribbon-input {
  background: var(--editor-control, #262626);
  color: var(--foreground);
  border: 1px solid var(--editor-control-border, #3a3a3a);
  border-radius: 6px;
  padding: 3px 6px;
  font: inherit;
  line-height: 1.2;
  min-height: 24px;
  box-sizing: border-box;
  color-scheme: inherit;
}
.ppt-ribbon-input:focus,
.ppt-ribbon-input:focus-visible {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 18%, transparent);
}
.ppt-ribbon-input option {
  background: var(--popover, #242424);
  color: var(--foreground);
}

.ppt-ribbon-swatch {
  cursor: pointer;
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: border-color .12s ease, box-shadow .12s ease;
}
.ppt-ribbon-swatch:hover:not(:disabled) {
  border-color: var(--ring);
}
.ppt-ribbon-swatch--outline:hover:not(:disabled) {
  border-color: currentColor;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 18%, transparent);
}
.ppt-ribbon-swatch[type="color"],
.ppt-color-swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  background: var(--secondary);
  cursor: pointer;
  box-sizing: border-box;
}
.ppt-ribbon-swatch[type="color"]:hover:not(:disabled),
.ppt-color-swatch:hover:not(:disabled) {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 18%, transparent);
}
.ppt-ribbon-swatch[type="color"]::-webkit-color-swatch-wrapper,
.ppt-color-swatch::-webkit-color-swatch-wrapper {
  padding: 2px;
}
.ppt-ribbon-swatch[type="color"]::-webkit-color-swatch,
.ppt-color-swatch::-webkit-color-swatch {
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 4px;
}
.ppt-ribbon-swatch[type="color"]::-moz-color-swatch,
.ppt-color-swatch::-moz-color-swatch {
  border: 1px solid var(--border);
  border-radius: 4px;
}

/* Range sliders — compact shadcn / Vercel track + thumb */
.ppt-range,
.ppt-inspector input[type="range"],
.ppt-ribbon-root input[type="range"],
.ppt-editor-root input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 16px;
  background: transparent;
  cursor: pointer;
  flex: 1;
  min-width: 80px;
  margin: 0;
}
.ppt-range:focus-visible,
.ppt-inspector input[type="range"]:focus-visible,
.ppt-ribbon-root input[type="range"]:focus-visible,
.ppt-editor-root input[type="range"]:focus-visible {
  outline: none;
}
.ppt-range::-webkit-slider-runnable-track,
.ppt-inspector input[type="range"]::-webkit-slider-runnable-track,
.ppt-ribbon-root input[type="range"]::-webkit-slider-runnable-track,
.ppt-editor-root input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: var(--border);
}
.ppt-range::-webkit-slider-thumb,
.ppt-inspector input[type="range"]::-webkit-slider-thumb,
.ppt-ribbon-root input[type="range"]::-webkit-slider-thumb,
.ppt-editor-root input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--foreground);
  border: 2px solid var(--background);
  box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0, 0, 0, 0.35);
  transition: background-color .12s ease, box-shadow .12s ease;
}
.ppt-range:hover::-webkit-slider-thumb,
.ppt-inspector input[type="range"]:hover::-webkit-slider-thumb,
.ppt-ribbon-root input[type="range"]:hover::-webkit-slider-thumb,
.ppt-editor-root input[type="range"]:hover::-webkit-slider-thumb {
  background: color-mix(in srgb, var(--foreground) 92%, var(--primary));
}
.ppt-range:active::-webkit-slider-thumb,
.ppt-inspector input[type="range"]:active::-webkit-slider-thumb,
.ppt-ribbon-root input[type="range"]:active::-webkit-slider-thumb,
.ppt-editor-root input[type="range"]:active::-webkit-slider-thumb {
  background: var(--primary);
  box-shadow: 0 0 0 1px var(--primary), 0 0 0 4px color-mix(in srgb, var(--primary) 22%, transparent);
}
.ppt-range::-moz-range-track,
.ppt-inspector input[type="range"]::-moz-range-track,
.ppt-ribbon-root input[type="range"]::-moz-range-track,
.ppt-editor-root input[type="range"]::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: var(--border);
  border: none;
}
.ppt-range::-moz-range-thumb,
.ppt-inspector input[type="range"]::-moz-range-thumb,
.ppt-ribbon-root input[type="range"]::-moz-range-thumb,
.ppt-editor-root input[type="range"]::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--foreground);
  border: 2px solid var(--background);
  box-shadow: 0 0 0 1px var(--border);
}
.ppt-range:focus-visible::-webkit-slider-thumb,
.ppt-inspector input[type="range"]:focus-visible::-webkit-slider-thumb,
.ppt-ribbon-root input[type="range"]:focus-visible::-webkit-slider-thumb,
.ppt-editor-root input[type="range"]:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 1px var(--ring), 0 0 0 4px color-mix(in srgb, var(--ring) 22%, transparent);
}

/* Compact number / text / search / select — inspector, animation, transitions, dialogs */
.ppt-control,
.ppt-inspector input:not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]),
.ppt-inspector select,
.ppt-inspector textarea,
.ppt-anim-panel input:not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="radio"]),
.ppt-anim-panel select,
.ppt-trans-panel input:not([type="range"]):not([type="color"]):not([type="checkbox"]):not([type="radio"]),
.ppt-trans-panel select,
.ppt-comments-panel input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),
.ppt-comments-panel textarea {
  background: var(--secondary);
  color: var(--foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  padding: 3px 6px;
  font: inherit;
  line-height: 1.3;
  box-sizing: border-box;
  color-scheme: inherit;
  min-height: 24px;
}
.ppt-control:focus,
.ppt-control:focus-visible,
.ppt-inspector input:focus-visible,
.ppt-inspector select:focus-visible,
.ppt-inspector textarea:focus-visible,
.ppt-anim-panel input:focus-visible,
.ppt-anim-panel select:focus-visible,
.ppt-trans-panel input:focus-visible,
.ppt-trans-panel select:focus-visible {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 18%, transparent);
}
.ppt-control option,
.ppt-inspector select option,
.ppt-anim-panel select option,
.ppt-trans-panel select option,
.ppt-ribbon-root select option {
  background: var(--popover, #242424);
  color: var(--foreground);
}

/* Checkboxes — 14px square, primary fill when checked */
.ppt-check,
.ppt-inspector input[type="checkbox"],
.ppt-anim-panel input[type="checkbox"],
.ppt-trans-panel input[type="checkbox"],
.ppt-comments-panel input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--secondary);
  cursor: pointer;
  display: inline-grid;
  place-content: center;
  color-scheme: inherit;
}
.ppt-check:hover,
.ppt-inspector input[type="checkbox"]:hover,
.ppt-anim-panel input[type="checkbox"]:hover,
.ppt-trans-panel input[type="checkbox"]:hover,
.ppt-comments-panel input[type="checkbox"]:hover {
  border-color: var(--ring);
}
.ppt-check:checked,
.ppt-inspector input[type="checkbox"]:checked,
.ppt-anim-panel input[type="checkbox"]:checked,
.ppt-trans-panel input[type="checkbox"]:checked,
.ppt-comments-panel input[type="checkbox"]:checked {
  background: var(--primary);
  border-color: var(--primary);
}
.ppt-check:checked::after,
.ppt-inspector input[type="checkbox"]:checked::after,
.ppt-anim-panel input[type="checkbox"]:checked::after,
.ppt-trans-panel input[type="checkbox"]:checked::after,
.ppt-comments-panel input[type="checkbox"]:checked::after {
  content: "";
  width: 8px;
  height: 8px;
  background: var(--primary-foreground);
  clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0, 43% 62%);
}
.ppt-check:focus-visible,
.ppt-inspector input[type="checkbox"]:focus-visible,
.ppt-anim-panel input[type="checkbox"]:focus-visible,
.ppt-trans-panel input[type="checkbox"]:focus-visible,
.ppt-comments-panel input[type="checkbox"]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 22%, transparent);
}

.ppt-comments-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
  background: var(--card, #1c1c1c);
  flex: 0 0 auto;
}
.ppt-comments-tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--secondary);
}
.ppt-comments-tab {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  font: 12px/1.2 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  cursor: pointer;
}
.ppt-comments-tab:hover { color: var(--foreground); }
.ppt-comments-tab[aria-selected="true"] {
  background: var(--background, #111);
  color: var(--foreground);
  font-weight: 600;
  box-shadow: 0 0 0 1px var(--border);
}
.ppt-comments-tab:focus-visible {
  outline: 2px solid var(--ring, #4f46e5);
  outline-offset: -2px;
}
.ppt-comments-tab__count {
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--muted-foreground);
}
.ppt-comments-tab[aria-selected="true"] .ppt-comments-tab__count {
  color: var(--foreground);
}
.ppt-comments-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.ppt-comments-new {
  flex: 1 1 auto;
  min-width: 0;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm, 6px);
  padding: 6px 10px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
}
.ppt-comments-scope,
.ppt-comments-bulk {
  flex: 0 0 auto;
  background: transparent;
  color: var(--muted-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  padding: 5px 8px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
}
.ppt-comments-scope[aria-pressed="true"] {
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  border-color: color-mix(in srgb, var(--primary) 50%, var(--border));
  color: var(--foreground);
}
.ppt-comments-bulk {
  flex: 1 1 100%;
  color: var(--foreground);
  background: var(--secondary);
}
.ppt-comments-bulk[hidden] { display: none; }
.ppt-comments-new:focus-visible,
.ppt-comments-scope:focus-visible,
.ppt-comments-bulk:focus-visible {
  outline: 2px solid var(--ring, #4f46e5);
  outline-offset: 1px;
}
.ppt-comment-target {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  margin: 0 0 6px;
  padding: 3px 6px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--foreground) 7%, transparent);
  color: var(--foreground);
  font: 11px/1.3 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  text-align: left;
  cursor: pointer;
}
.ppt-comment-target:hover { background: color-mix(in srgb, var(--foreground) 12%, transparent); }
.ppt-comment-target:focus-visible {
  outline: 2px solid var(--ring, #4f46e5);
  outline-offset: 1px;
}
.ppt-comment-target__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ppt-comment-target--missing {
  color: var(--muted-foreground);
  cursor: default;
}
.ppt-comment-text {
  margin: 0;
  color: var(--foreground);
  font: 13px/1.4 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
}
.ppt-comment-mention {
  color: var(--primary, #818cf8);
  background: color-mix(in srgb, var(--primary, #818cf8) 22%, transparent);
  border-radius: 3px;
  font-weight: inherit;
}
.ppt-comment-mention-person {
  color: var(--foreground);
  background: color-mix(in srgb, var(--foreground) 12%, transparent);
}
.ppt-comment-mention-menu {
  position: fixed;
  z-index: calc(var(--z-modal, 1300) + 2);
  max-height: 180px;
  overflow: auto;
  padding: 4px;
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-lg);
  font: 12px/1.3 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
}
.ppt-comment-mention-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 5px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ppt-comment-mention-option.is-active,
.ppt-comment-mention-option:hover {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
}
.ppt-comment-mention-hint {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted-foreground);
  font-size: 11px;
}
.ppt-comment-field {
  position: relative;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  background: var(--secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  font: 13px/1.35 var(--font-sans, ui-sans-serif, system-ui, sans-serif);
}
.ppt-comment-field-back,
.ppt-comment-field-input {
  box-sizing: border-box;
  margin: 0;
  padding: 6px 8px;
  font: inherit;
  line-height: inherit;
  letter-spacing: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.ppt-comment-field-back {
  position: absolute;
  inset: 0;
  overflow: auto;
  color: var(--foreground);
  pointer-events: none;
  scrollbar-width: none;
}
.ppt-comment-field-back::-webkit-scrollbar { display: none; }
.ppt-comment-field-input {
  position: relative;
  display: block;
  width: 100%;
  border: none;
  background: transparent;
  color: transparent;
  caret-color: var(--foreground);
  resize: vertical;
  outline: none;
}
.ppt-comment-field-input::placeholder { color: var(--muted-foreground); }
.ppt-comment-field-input::selection {
  color: transparent;
  background: color-mix(in srgb, var(--primary, #818cf8) 28%, transparent);
}

.ppt-ribbon-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  color: var(--foreground);
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font: inherit;
  transition: background-color .12s ease;
}
.ppt-ribbon-menu-item:hover,
.ppt-ribbon-menu-item:focus-visible,
.ppt-ribbon-menu-item.is-hover {
  background: color-mix(in srgb, var(--primary) 18%, var(--secondary, #2a2a2a));
  outline: none;
}
.ppt-ribbon-menu-item--current {
  background: color-mix(in srgb, var(--primary) 12%, var(--secondary, #2a2a2a));
}
.ppt-ribbon-menu-item--current:hover,
.ppt-ribbon-menu-item--current:focus-visible,
.ppt-ribbon-menu-item--current.is-hover {
  background: color-mix(in srgb, var(--primary) 22%, var(--secondary, #2a2a2a));
}
.ppt-ribbon-history {
  min-width: 220px;
  max-width: 320px;
  max-height: min(360px, 70vh);
  overflow-y: auto;
}
.ppt-ribbon-history-hint {
  padding: 6px 10px 4px;
  font-size: 10px;
  line-height: 1.3;
  color: var(--muted-foreground);
}
.ppt-ribbon-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.ppt-ribbon-history-item--future {
  opacity: 0.55;
}
.ppt-ribbon-history-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted-foreground);
}
.ppt-ribbon-history-item--current .ppt-ribbon-history-dot {
  background: var(--primary);
}
.ppt-ribbon-history-item--future .ppt-ribbon-history-dot {
  background: transparent;
  border: 1px solid var(--muted-foreground);
}
.ppt-ribbon-history-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ppt-ribbon-history-badge {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--primary);
}

/* Host sets body.dev-mode (File → Options). Insert-inventory dumps, Morph audit copy/goto, etc. */
.ppt-dev-only { display: none !important; }
body.dev-mode .ppt-dev-only { display: contents !important; }
body.dev-mode .ppt-dev-only.ppt-dev-only-flex {
  display: flex !important;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* 编辑态：web 嵌入 iframe 不能抢走指针。跨域内容（YouTube 等）的点击发生在子文档，
   舞台收不到 pointerdown，也就选不中、拖不动。放映器不用 .ppt-stage-host，仍可点进嵌入页。 */
.ppt-stage-host iframe {
  pointer-events: none !important;
}
.ppt-right-panel-resizer {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 6px;
  z-index: 3;
  cursor: col-resize;
  touch-action: none;
}
.ppt-right-panel-resizer::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: transparent;
}
.ppt-right-panel-resizer:hover::after,
body.ppt-right-panel-resizing .ppt-right-panel-resizer::after { background: var(--primary); }
body.ppt-right-panel-resizing,
body.ppt-right-panel-resizing * { cursor: col-resize !important; user-select: none !important; }
`;
export function ensureUiStyles(doc) {
    ensureBaseUiStyles(doc);
    let ribbonStyle = doc.getElementById(RIBBON_STYLE_ID);
    if (!ribbonStyle) {
        ribbonStyle = doc.createElement("style");
        ribbonStyle.id = RIBBON_STYLE_ID;
        doc.head.appendChild(ribbonStyle);
    }
    ribbonStyle.textContent = RIBBON_CSS;
    if (doc.getElementById("ppt-editor-print-style"))
        return;
    const style = doc.createElement("style");
    style.id = "ppt-editor-print-style";
    style.textContent = `@media print {
  body > header, body > .slides-panel, body > aside { display: none !important; }
  body > main { display: block !important; grid-template-columns: 1fr !important; }
  .ppt-editor-root > :not(.ppt-stage-host) { display: none !important; }
  .ppt-editor-root { display: block !important; background: #fff !important; }
  .ppt-stage-host { position: static !important; overflow: visible !important; height: auto !important; }
  .ppt-stage-wrap { overflow: visible !important; height: auto !important; }
}`;
    doc.head.appendChild(style);
}
/** 样式类名常量，便于在 cssText 模板里拼接。 */
export const SCROLL_CLASS = BASE_SCROLL_CLASS;
export const RANGE_INPUT_CLASS = "ppt-range";
export const COLOR_SWATCH_CLASS = "ppt-color-swatch";
export const CONTROL_INPUT_CLASS = "ppt-control";
export const CHECK_CLASS = "ppt-check";
/** Diagnostic copy/goto toolbars; visible only when the host sets `body.dev-mode`. */
export const DEV_ONLY_CLASS = "ppt-dev-only";
export const DEV_ONLY_FLEX_CLASS = "ppt-dev-only ppt-dev-only-flex";
export const DEV_MODE_BODY_CLASS = "dev-mode";
/** Flex row of dump/copy/goto buttons; hidden unless the host sets `body.dev-mode`. */
export function createDevOnlyToolbar(doc, ...children) {
    const el = doc.createElement("div");
    el.className = DEV_ONLY_FLEX_CLASS;
    if (children.length)
        el.append(...children);
    return el;
}
const DEV_ONLY_MENU_BTN_CSS = "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 8px;cursor:pointer;font:inherit;font-size:12px;max-width:11.5rem";
const DEV_ONLY_MENU_PANEL_CSS = "position:absolute;right:0;bottom:calc(100% + 4px);z-index:8;min-width:max(100%,12.5rem);max-height:min(40vh,260px);overflow:auto;display:none;flex-direction:column;gap:1px;padding:4px;background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-md,8px);box-shadow:var(--shadow-lg)";
const DEV_ONLY_MENU_ITEM_CSS = "display:block;width:100%;box-sizing:border-box;text-align:left;background:transparent;color:inherit;border:none;border-radius:var(--radius-sm,6px);padding:6px 8px;cursor:pointer;font:inherit;font-size:12px";
/**
 * Compact dest-only action menu. Native `<select>` is avoided: its popup paints
 * outside the modal, and the option click hits the overlay and closes the dialog.
 */
export function createDevOnlyActionSelect(doc, placeholder, actions, labels) {
    const wrap = createDevOnlyToolbar(doc);
    wrap.style.position = "relative";
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.textContent = placeholder;
    btn.title = placeholder;
    btn.style.cssText = DEV_ONLY_MENU_BTN_CSS;
    const menu = doc.createElement("div");
    menu.className = SCROLL_CLASS;
    menu.style.cssText = DEV_ONLY_MENU_PANEL_CSS;
    menu.setAttribute("role", "menu");
    let closeTimer = 0;
    const flash = (text) => {
        btn.textContent = text;
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(() => {
            btn.textContent = placeholder;
        }, 1500);
    };
    const onDocPointerDown = (e) => {
        if (!wrap.contains(e.target))
            closeMenu();
    };
    const closeMenu = () => {
        menu.style.display = "none";
        btn.setAttribute("aria-expanded", "false");
        doc.removeEventListener("pointerdown", onDocPointerDown, true);
    };
    const openMenu = () => {
        menu.style.display = "flex";
        btn.setAttribute("aria-expanded", "true");
        doc.addEventListener("pointerdown", onDocPointerDown, true);
    };
    btn.setAttribute("aria-haspopup", "menu");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (menu.style.display === "flex")
            closeMenu();
        else
            openMenu();
    });
    for (const action of actions) {
        const item = doc.createElement("button");
        item.type = "button";
        item.setAttribute("role", "menuitem");
        item.textContent = action.label;
        item.style.cssText = DEV_ONLY_MENU_ITEM_CSS;
        item.addEventListener("mouseenter", () => {
            item.style.background = "var(--accent)";
        });
        item.addEventListener("mouseleave", () => {
            item.style.background = "transparent";
        });
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMenu();
            void Promise.resolve(action.run())
                .then((result) => {
                if (result === false)
                    return;
                if (labels?.done && wrap.isConnected)
                    flash(labels.done);
            })
                .catch(() => {
                if (labels?.failed && wrap.isConnected)
                    flash(labels.failed);
            });
        });
        menu.appendChild(item);
    }
    wrap.append(btn, menu);
    return wrap;
}
export function isHostDevMode(doc) {
    return doc.body.classList.contains(DEV_MODE_BODY_CLASS);
}
/** Watch File → Options `body.dev-mode` without coupling the editor to playground. */
export function observeHostDevMode(doc, onChange) {
    const body = doc.body;
    let last = isHostDevMode(doc);
    const fire = () => {
        const next = isHostDevMode(doc);
        if (next === last)
            return;
        last = next;
        onChange(next);
    };
    const mo = new MutationObserver(fire);
    mo.observe(body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
}
// 全局层叠只用 token，不要再写 10000+。
//   --z-dropdown 1000  菜单 / 「更多」
//   --z-sticky   1100  查找替换、ribbon 锚定 popover
//   --z-modal    1300  全屏对话框
//   --z-toast    1400  轻提示
//   --z-overlay  1500  启动屏 / 录制层 / 引导
export const Z_DROPDOWN = "var(--z-dropdown, 1000)";
export const Z_STICKY = "var(--z-sticky, 1100)";
export const Z_MODAL = "var(--z-modal, 1300)";
export const Z_TOAST = "var(--z-toast, 1400)";
export const Z_OVERLAY = "var(--z-overlay, 1500)";
export const Z_RIBBON_MORE_BACKDROP = Z_DROPDOWN;
export const Z_RIBBON_MORE = Z_DROPDOWN;
export const Z_FIND_REPLACE = Z_STICKY;
export const Z_RIBBON_POPOVER = Z_STICKY;
/** Standalone modal overlays (Smart Lookup, VBA, accessibility, etc.) — shadcn / Vercel chrome. */
export const DIALOG_OVERLAY_CSS = `position:fixed;inset:0;background:var(--overlay-backdrop,rgba(0,0,0,0.65));display:flex;align-items:center;justify-content:center;z-index:${Z_MODAL}`;
export const DIALOG_MODAL_BASE_CSS = "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);padding:16px 18px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow-lg)";
export const DIALOG_BTN_SECONDARY_CSS = "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px";
export const DIALOG_BTN_PRIMARY_CSS = "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px;font-weight:500";
export const DIALOG_INPUT_CSS = "background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 8px;font:inherit;outline:none";
export const DIALOG_BTN_SUCCESS_CSS = "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px";
export const DIALOG_BTN_DESTRUCTIVE_CSS = "background:var(--destructive);color:var(--destructive-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px";
/** Floating record / presenter overlay icon buttons */
export const OVERLAY_ICON_BTN_CSS = "pointer-events:auto;background:color-mix(in srgb, var(--popover) 88%, transparent);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);width:28px;height:28px;cursor:pointer;font-size:13px;line-height:1;padding:0";
export const OVERLAY_ICON_BTN_BG = "color-mix(in srgb, var(--popover) 88%, transparent)";
export const OVERLAY_ICON_BTN_BG_ACTIVE = "color-mix(in srgb, var(--primary) 70%, var(--popover))";
export const OVERLAY_ICON_BTN_BG_DANGER = "color-mix(in srgb, var(--destructive) 70%, var(--popover))";
/** 关闭所有打开的 ribbon「更多」overflow dialog（打开子菜单前调用，避免遮挡）。 */
export function closeRibbonMoreDialogs(doc) {
    const Ctor = doc.defaultView?.CustomEvent;
    if (!Ctor)
        return;
    doc.dispatchEvent(new Ctor("ppt-ribbon-close-more"));
}
/**
 * 从 ribbon 锚定 popover 打开前：若触发按钮在「更多」dialog 内则保留 more
 * （popover z-index 已高于 more）；否则关掉 more 以免两层叠在一起。
 */
export function closeRibbonMoreUnlessFromMoreDialog(doc, anchor) {
    if (anchor.closest("[data-ppt-ribbon-more]"))
        return;
    closeRibbonMoreDialogs(doc);
}
/** ribbon 锚定 popover 是否已打开（子弹窗优先于「更多」响应 Esc）。 */
export function hasOpenRibbonPopover(doc) {
    return doc.querySelector("[data-ppt-bullet-menu],[data-ppt-fill-gradient-picker],[data-ppt-shape-effect-picker]") != null;
}
