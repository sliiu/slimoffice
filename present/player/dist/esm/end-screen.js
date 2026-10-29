export const PRODUCT_HOMES = ["https://slimppt.com", "https://slimppt.cn"];
export function allowedProductHome(raw) {
    return raw === "https://slimppt.com" || raw === "https://slimppt.cn" ? raw : undefined;
}
export function resolveEndScreenKind(input) {
    if (input.endQuiet || input.follow)
        return "quiet";
    if (input.homeHref)
        return "share";
    return "exit";
}
