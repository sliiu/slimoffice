// @sliiu/present-ui base component styles (shadcn-flavoured), token-driven.
//
// Injected once per Document via ensureUiStyles(). Class API:
//   .ui-btn[data-variant][data-size] · .ui-input · .ui-field · .ui-label
//   .ui-combobox · .ui-combobox-menu · .ui-combobox-item
//   .ui-panel · .ui-card · .ui-overlay · .ui-modal(__head/__body/__foot)
//   .ppt-scroll (consolidated scrollbar styling)
// All colors/radii/shadows reference the CSS variables from tokens.ts.
import { TOKENS_CSS } from "./tokens.js";
const STYLE_ID = "ppt-ui-style";
const BASE_CSS = `
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
  border-radius: var(--radius-button, 10px);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  height: 36px;
  padding: 0 16px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease, opacity .15s ease, box-shadow .15s ease;
}
.ui-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--ring); }
.ui-btn:disabled { opacity: .5; pointer-events: none; }
.ui-btn svg { width: 16px; height: 16px; flex: 0 0 auto; }
.ui-btn[data-variant="default"] {
  background: var(--primary);
  color: var(--primary-foreground);
}
.ui-btn[data-variant="default"]:hover { background: color-mix(in srgb, var(--primary) 88%, #000); }
.ui-btn[data-variant="secondary"] { background: var(--secondary); color: var(--secondary-foreground); border-color: var(--border); }
.ui-btn[data-variant="secondary"]:hover { background: color-mix(in srgb, var(--secondary) 80%, var(--foreground) 6%); }
.ui-btn[data-variant="outline"] { background: transparent; color: var(--foreground); border-color: var(--input); }
.ui-btn[data-variant="outline"]:hover { background: color-mix(in srgb, var(--primary) 10%, var(--secondary)); border-color: color-mix(in srgb, var(--primary) 30%, var(--border)); }
.ui-btn[data-variant="ghost"] { background: transparent; color: var(--foreground); }
.ui-btn[data-variant="ghost"]:hover { background: var(--accent); color: var(--accent-foreground); }
.ui-btn[data-variant="destructive"] { background: var(--destructive); color: var(--destructive-foreground); box-shadow: var(--shadow-sm); }
.ui-btn[data-variant="destructive"]:hover { opacity: .9; }
.ui-btn[data-variant="brand"] { background: var(--brand-gradient); color: #fff; box-shadow: var(--shadow-sm); }
.ui-btn[data-variant="brand"]:hover { opacity: .9; }
.ui-btn[data-size="sm"] { height: 32px; padding: 0 12px; font-size: 13px; }
.ui-btn[data-size="lg"] { height: 40px; padding: 0 24px; }
.ui-btn[data-size="icon"] { width: 36px; height: 36px; padding: 0; }

.ui-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  font-family: inherit;
  font-size: 14px;
  color: var(--foreground);
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-button, 10px);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.ui-input:focus-visible {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent);
}
.ui-input::placeholder { color: var(--muted-foreground); }
textarea.ui-input { height: auto; min-height: 80px; padding: 8px 12px; resize: vertical; }
.ui-combobox {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.ui-combobox > input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  padding-right: 22px;
  box-sizing: border-box;
}
.ui-combobox-chevron {
  position: absolute;
  right: 6px;
  top: 50%;
  width: 12px;
  height: 12px;
  transform: translateY(-50%);
  pointer-events: none;
  opacity: .7;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") center / 12px 12px no-repeat;
}
.ui-combobox-menu {
  position: fixed;
  box-sizing: border-box;
  margin: 0;
  padding: 4px;
  background: var(--popover, #242424);
  color: var(--popover-foreground, var(--foreground));
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
  z-index: calc(var(--z-modal, 1300) + 20);
  scrollbar-color: var(--border) transparent;
  scrollbar-width: thin;
}
.ui-combobox-menu::-webkit-scrollbar { width: 8px; background: transparent; }
.ui-combobox-menu::-webkit-scrollbar-thumb { background-color: var(--border); border-radius: 4px; }
.ui-combobox-item {
  padding: 5px 8px;
  cursor: pointer;
  color: var(--foreground);
  font-size: 12px;
  border-radius: 4px;
  border-left: 2px solid transparent;
}
.ui-combobox-item.is-active {
  background: var(--accent, var(--border));
  border-left-color: var(--primary);
}

select.ui-input {
  align-self: flex-start;
  width: max-content;
  min-width: 5.5rem;
  max-width: 100%;
  padding-right: 28px;
  cursor: pointer;
}

.ui-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ui-label { font-size: 13px; font-weight: 500; color: var(--foreground); }
.ui-hint { font-size: 12px; color: var(--muted-foreground); }

.ui-panel { background: var(--card); color: var(--card-foreground); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.ui-card { background: var(--card); color: var(--card-foreground); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: var(--space-4); }

.ui-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-backdrop, rgba(0, 0, 0, 0.65));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: 16px;
  box-sizing: border-box;
}
.ui-modal {
  position: relative;
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-modal, 12px);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: min(560px, 100%);
  max-height: 90vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.ui-modal__head { padding: 16px 48px 16px 20px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 15px; }
.ui-modal__body { padding: 20px; overflow: auto; }
.ui-modal__foot { padding: 16px 20px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; gap: 8px; }

.ui-toast {
  position: fixed;
  left: 50%;
  top: 20px;
  transform: translateX(-50%) translateY(-8px);
  z-index: var(--z-toast, 1400);
  max-width: min(420px, calc(100vw - 24px));
  padding: 10px 16px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border);
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: var(--shadow-lg);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease-out, transform .18s ease-out;
}
.ui-toast__text { white-space: pre-wrap; }
.ui-toast--action {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: start;
  pointer-events: auto;
}
.ui-toast__action {
  flex: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.ui-toast.ui-toast--visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.ui-toast[data-kind="ok"] {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 10%, var(--popover));
  border-color: color-mix(in srgb, var(--success) 35%, var(--border));
}
.ui-toast[data-kind="err"] {
  color: var(--destructive);
  background: color-mix(in srgb, var(--destructive) 10%, var(--popover));
  border-color: color-mix(in srgb, var(--destructive) 35%, var(--border));
}
.ui-toast[data-kind="info"] { color: var(--foreground); }

.ppt-scroll { scrollbar-color: var(--border) transparent; scrollbar-width: thin; scrollbar-gutter: stable; }
.ppt-scroll::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
.ppt-scroll::-webkit-scrollbar-track { background: transparent; }
.ppt-scroll::-webkit-scrollbar-thumb { background-color: var(--border); border: 2px solid transparent; background-clip: padding-box; border-radius: 6px; min-height: 24px; min-width: 24px; }
.ppt-scroll::-webkit-scrollbar-thumb:hover { background-color: var(--muted-foreground); }
.ppt-scroll::-webkit-scrollbar-corner { background: transparent; }
`;
/** 注入 tokens + 基础组件样式（按 doc 幂等）。 */
export function ensureUiStyles(doc) {
    if (doc.getElementById(STYLE_ID))
        return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${TOKENS_CSS}\n${BASE_CSS}`;
    doc.head.appendChild(style);
}
export const SCROLL_CLASS = "ppt-scroll";
