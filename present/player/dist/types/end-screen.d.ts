/** 放映结束黑屏的三种收场。编辑器退出；分享给从头播放和首页；直播只留标题。 */
export type EndScreenKind = "exit" | "share" | "quiet";
export declare const PRODUCT_HOMES: readonly ["https://slimppt.com", "https://slimppt.cn"];
export type ProductHome = (typeof PRODUCT_HOMES)[number];
export declare function allowedProductHome(raw: unknown): ProductHome | undefined;
export declare function resolveEndScreenKind(input: {
    endQuiet?: boolean;
    follow?: boolean;
    homeHref?: ProductHome;
}): EndScreenKind;
