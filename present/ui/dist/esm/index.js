// @sliiu/present-ui — shared design system (shadcn-flavoured) for the SlimPPT editor.
//
// Tokens mirror the 官网 (landing-page-for-qingu). The React console imports
// ./tokens.css into Tailwind; the vanilla editor/playground inject the same
// values via ensureUiStyles() and build UI with the primitives here.
export { TOKENS_CSS, token } from "./tokens.js";
export { ensureUiStyles, SCROLL_CLASS } from "./styles.js";
export { marketIsOpen, marketStatusUrl, renderMarketClosed } from "./market-closed.js";
export { mkButton, mkField, mkPanel, mkModal, dismissToast, showToast, } from "./primitives.js";
export { bindCombobox, } from "./combobox.js";
export { bindModalDismiss, dismissAllModals, } from "./modal-session.js";
