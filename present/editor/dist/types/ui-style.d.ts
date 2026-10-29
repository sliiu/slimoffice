export declare function ensureUiStyles(doc: Document): void;
/** 样式类名常量，便于在 cssText 模板里拼接。 */
export declare const SCROLL_CLASS = "ppt-scroll";
export declare const RANGE_INPUT_CLASS = "ppt-range";
export declare const COLOR_SWATCH_CLASS = "ppt-color-swatch";
export declare const CONTROL_INPUT_CLASS = "ppt-control";
export declare const CHECK_CLASS = "ppt-check";
/** Diagnostic copy/goto toolbars; visible only when the host sets `body.dev-mode`. */
export declare const DEV_ONLY_CLASS = "ppt-dev-only";
export declare const DEV_ONLY_FLEX_CLASS = "ppt-dev-only ppt-dev-only-flex";
export declare const DEV_MODE_BODY_CLASS = "dev-mode";
/** Flex row of dump/copy/goto buttons; hidden unless the host sets `body.dev-mode`. */
export declare function createDevOnlyToolbar(doc: Document, ...children: Node[]): HTMLDivElement;
export interface DevOnlyMenuAction {
    label: string;
    run: () => void | boolean | Promise<void | boolean>;
}
export interface DevOnlyMenuLabels {
    done?: string;
    failed?: string;
}
/**
 * Compact dest-only action menu. Native `<select>` is avoided: its popup paints
 * outside the modal, and the option click hits the overlay and closes the dialog.
 */
export declare function createDevOnlyActionSelect(doc: Document, placeholder: string, actions: readonly DevOnlyMenuAction[], labels?: DevOnlyMenuLabels): HTMLDivElement;
export declare function isHostDevMode(doc: Document): boolean;
/** Watch File → Options `body.dev-mode` without coupling the editor to playground. */
export declare function observeHostDevMode(doc: Document, onChange: (on: boolean) => void): () => void;
export declare const Z_DROPDOWN = "var(--z-dropdown, 1000)";
export declare const Z_STICKY = "var(--z-sticky, 1100)";
export declare const Z_MODAL = "var(--z-modal, 1300)";
export declare const Z_TOAST = "var(--z-toast, 1400)";
export declare const Z_OVERLAY = "var(--z-overlay, 1500)";
export declare const Z_RIBBON_MORE_BACKDROP = "var(--z-dropdown, 1000)";
export declare const Z_RIBBON_MORE = "var(--z-dropdown, 1000)";
export declare const Z_FIND_REPLACE = "var(--z-sticky, 1100)";
export declare const Z_RIBBON_POPOVER = "var(--z-sticky, 1100)";
/** Standalone modal overlays (Smart Lookup, VBA, accessibility, etc.) — shadcn / Vercel chrome. */
export declare const DIALOG_OVERLAY_CSS = "position:fixed;inset:0;background:var(--overlay-backdrop,rgba(0,0,0,0.65));display:flex;align-items:center;justify-content:center;z-index:var(--z-modal, 1300)";
export declare const DIALOG_MODAL_BASE_CSS = "background:var(--popover);color:var(--popover-foreground);border:1px solid var(--border);border-radius:var(--radius-modal,12px);padding:16px 18px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--shadow-lg)";
export declare const DIALOG_BTN_SECONDARY_CSS = "background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px";
export declare const DIALOG_BTN_PRIMARY_CSS = "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px;font-weight:500";
export declare const DIALOG_INPUT_CSS = "background:var(--background);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 8px;font:inherit;outline:none";
export declare const DIALOG_BTN_SUCCESS_CSS = "background:var(--success);color:var(--success-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px";
export declare const DIALOG_BTN_DESTRUCTIVE_CSS = "background:var(--destructive);color:var(--destructive-foreground);border:none;border-radius:var(--radius-sm,6px);padding:6px 12px;cursor:pointer;font:inherit;font-size:12px";
/** Floating record / presenter overlay icon buttons */
export declare const OVERLAY_ICON_BTN_CSS = "pointer-events:auto;background:color-mix(in srgb, var(--popover) 88%, transparent);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);width:28px;height:28px;cursor:pointer;font-size:13px;line-height:1;padding:0";
export declare const OVERLAY_ICON_BTN_BG = "color-mix(in srgb, var(--popover) 88%, transparent)";
export declare const OVERLAY_ICON_BTN_BG_ACTIVE = "color-mix(in srgb, var(--primary) 70%, var(--popover))";
export declare const OVERLAY_ICON_BTN_BG_DANGER = "color-mix(in srgb, var(--destructive) 70%, var(--popover))";
/** 关闭所有打开的 ribbon「更多」overflow dialog（打开子菜单前调用，避免遮挡）。 */
export declare function closeRibbonMoreDialogs(doc: Document): void;
/**
 * 从 ribbon 锚定 popover 打开前：若触发按钮在「更多」dialog 内则保留 more
 * （popover z-index 已高于 more）；否则关掉 more 以免两层叠在一起。
 */
export declare function closeRibbonMoreUnlessFromMoreDialog(doc: Document, anchor: HTMLElement): void;
/** ribbon 锚定 popover 是否已打开（子弹窗优先于「更多」响应 Esc）。 */
export declare function hasOpenRibbonPopover(doc: Document): boolean;
