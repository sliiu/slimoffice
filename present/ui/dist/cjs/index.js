"use strict";
// @sliiu/present-ui — shared design system (shadcn-flavoured) for the SlimPPT editor.
//
// Tokens mirror the 官网 (landing-page-for-qingu). The React console imports
// ./tokens.css into Tailwind; the vanilla editor/playground inject the same
// values via ensureUiStyles() and build UI with the primitives here.
Object.defineProperty(exports, "__esModule", { value: true });
exports.dismissAllModals = exports.bindModalDismiss = exports.bindCombobox = exports.showToast = exports.dismissToast = exports.mkModal = exports.mkPanel = exports.mkField = exports.mkButton = exports.renderMarketClosed = exports.marketStatusUrl = exports.marketIsOpen = exports.SCROLL_CLASS = exports.ensureUiStyles = exports.token = exports.TOKENS_CSS = void 0;
var tokens_js_1 = require("./tokens.js");
Object.defineProperty(exports, "TOKENS_CSS", { enumerable: true, get: function () { return tokens_js_1.TOKENS_CSS; } });
Object.defineProperty(exports, "token", { enumerable: true, get: function () { return tokens_js_1.token; } });
var styles_js_1 = require("./styles.js");
Object.defineProperty(exports, "ensureUiStyles", { enumerable: true, get: function () { return styles_js_1.ensureUiStyles; } });
Object.defineProperty(exports, "SCROLL_CLASS", { enumerable: true, get: function () { return styles_js_1.SCROLL_CLASS; } });
var market_closed_js_1 = require("./market-closed.js");
Object.defineProperty(exports, "marketIsOpen", { enumerable: true, get: function () { return market_closed_js_1.marketIsOpen; } });
Object.defineProperty(exports, "marketStatusUrl", { enumerable: true, get: function () { return market_closed_js_1.marketStatusUrl; } });
Object.defineProperty(exports, "renderMarketClosed", { enumerable: true, get: function () { return market_closed_js_1.renderMarketClosed; } });
var primitives_js_1 = require("./primitives.js");
Object.defineProperty(exports, "mkButton", { enumerable: true, get: function () { return primitives_js_1.mkButton; } });
Object.defineProperty(exports, "mkField", { enumerable: true, get: function () { return primitives_js_1.mkField; } });
Object.defineProperty(exports, "mkPanel", { enumerable: true, get: function () { return primitives_js_1.mkPanel; } });
Object.defineProperty(exports, "mkModal", { enumerable: true, get: function () { return primitives_js_1.mkModal; } });
Object.defineProperty(exports, "dismissToast", { enumerable: true, get: function () { return primitives_js_1.dismissToast; } });
Object.defineProperty(exports, "showToast", { enumerable: true, get: function () { return primitives_js_1.showToast; } });
var combobox_js_1 = require("./combobox.js");
Object.defineProperty(exports, "bindCombobox", { enumerable: true, get: function () { return combobox_js_1.bindCombobox; } });
var modal_session_js_1 = require("./modal-session.js");
Object.defineProperty(exports, "bindModalDismiss", { enumerable: true, get: function () { return modal_session_js_1.bindModalDismiss; } });
Object.defineProperty(exports, "dismissAllModals", { enumerable: true, get: function () { return modal_session_js_1.dismissAllModals; } });
