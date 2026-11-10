/** 只取正文就够：一页放不下整站导航，模型读到的每一条多余文字都会挤占大纲的位置。 */
export interface FetchedPage {
    /** 最终 URL（跟随跳转之后）。 */
    url: string;
    /** 响应体上限之内为 false 时表示内容被截断；呼叫方据此提示用户。 */
    truncated: boolean;
    html: string;
}
export type PageFetcher = (url: string, signal?: AbortSignal) => Promise<FetchedPage>;
export interface UrlMaterial {
    title?: string;
    url: string;
    text: string;
    /** 抓取时地址变过（跳转 / 规范化）。 */
    finalUrl: string;
    truncated: boolean;
}
/**
 * 默认抓取器。不做 cookie / 登录；非 HTML 直接拒绝，因为它不该是「网页」这条路进来的。
 * 超时由调用方传 signal；本函数不自己设，避免和宿主的预算打架。
 */
export declare const defaultPageFetcher: PageFetcher;
/** 只接受 http(s)：`file:` / `javascript:` 之类的地址不该走到抓取。 */
export declare function normalizeSourceUrl(input: string): string;
/**
 * 正文抽取：去掉脚本、样式、导航、页眉页脚这类结构标签，再按块级标签断行。
 * 不用第三方 readability —— 它在这里的收益是「判断哪一块是正文」，但这条链路后面还有模型
 * 在整理，多留一点正文比误删一段更安全。
 */
export declare function htmlToText(html: string): string;
/** 页面标题：`<title>` 优先，其次第一个 `<h1>`，都没有就用域名。 */
export declare function htmlTitle(html: string, url: string): string | undefined;
/**
 * 网页 → 参考材料。和 `extractSourceText` 的结果同形，直接进 `guidance.sourceMaterial`。
 * 文本过长时截断并标记，`truncated` 让界面可以说清楚「只读了前 12000 字」。
 */
export declare function fetchUrlMaterial(input: string, fetcher?: PageFetcher, signal?: AbortSignal): Promise<UrlMaterial>;
/** 拼成 `guidance.sourceMaterial` 的格式，和文件名标题那一行一致。 */
export declare function urlMaterialBlock(m: UrlMaterial): string;
/** 粗略识别用户是不是在让「这一页」当材料，而不是在描述主题。供宿主决定弹不弹输入框。 */
export declare function looksLikeUrl(s: string): boolean;
