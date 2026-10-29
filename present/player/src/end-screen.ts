/** 放映结束黑屏的三种收场。编辑器退出；分享给从头播放和首页；直播只留标题。 */
export type EndScreenKind = "exit" | "share" | "quiet";

export const PRODUCT_HOMES = ["https://slimppt.com", "https://slimppt.cn"] as const;
export type ProductHome = (typeof PRODUCT_HOMES)[number];

export function allowedProductHome(raw: unknown): ProductHome | undefined {
  return raw === "https://slimppt.com" || raw === "https://slimppt.cn" ? raw : undefined;
}

export function resolveEndScreenKind(input: {
  endQuiet?: boolean;
  follow?: boolean;
  homeHref?: ProductHome;
}): EndScreenKind {
  if (input.endQuiet || input.follow) return "quiet";
  if (input.homeHref) return "share";
  return "exit";
}
