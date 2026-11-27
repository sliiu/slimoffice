"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRODUCT_HOMES = void 0;
exports.allowedProductHome = allowedProductHome;
exports.resolveEndScreenKind = resolveEndScreenKind;
exports.PRODUCT_HOMES = ["https://parchon.sliiu.com", "https://parchon.sliiu.cn"];
function allowedProductHome(raw) {
    return raw === "https://parchon.sliiu.com" || raw === "https://parchon.sliiu.cn" ? raw : undefined;
}
function resolveEndScreenKind(input) {
    if (input.endQuiet || input.follow)
        return "quiet";
    if (input.homeHref)
        return "share";
    return "exit";
}
