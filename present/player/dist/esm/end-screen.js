export const PRODUCT_HOMES = ["https://parchon.sliiu.com", "https://parchon.sliiu.cn"];
export function allowedProductHome(raw) {
    return raw === "https://parchon.sliiu.com" || raw === "https://parchon.sliiu.cn" ? raw : undefined;
}
export function resolveEndScreenKind(input) {
    if (input.endQuiet || input.follow)
        return "quiet";
    if (input.homeHref)
        return "share";
    return "exit";
}
