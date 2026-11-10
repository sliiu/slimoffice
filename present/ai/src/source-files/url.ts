// 把网页当参考材料。
//
// 用户经常拿一篇文章让人做稿：竞品发布页、财报新闻、维基条目、内部 wiki。文件路径已经能
// 接 pdf / docx / xlsx，唯独没有「给个链接」。这里只做一件事：把一页 HTML 变成纯文本，
// 和 `extract.ts` 抽出来的 `sourceMaterial` 是同一种东西，下游不用区分来源。
//
// 抓取本身是可注入的：开源包不绑死 `fetch` 的凭据 / 代理策略，宿主决定怎么取；测试用假
// fetcher 跑，不需要网络。

import { SourceFileError } from "./extract";

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

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TEXT = 12000;

/**
 * 默认抓取器。不做 cookie / 登录；非 HTML 直接拒绝，因为它不该是「网页」这条路进来的。
 * 超时由调用方传 signal；本函数不自己设，避免和宿主的预算打架。
 */
export const defaultPageFetcher: PageFetcher = async (url, signal) => {
  const res = await fetch(url, {
    redirect: "follow",
    ...(signal ? { signal } : {}),
    headers: { "user-agent": "Mozilla/5.0 (compatible; SlimPPT/1.0; +https://slimppt.com)", accept: "text/html,application/xhtml+xml" },
  });
  if (!res.ok) throw new SourceFileError(`${url} 打不开（HTTP ${res.status}）`);
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (type && !type.includes("html") && !type.includes("xml")) {
    throw new SourceFileError(`${url} 不是网页（${type.split(";")[0]}）——请下载后用文件上传`);
  }
  const buf = await res.arrayBuffer();
  const truncated = buf.byteLength > MAX_BYTES;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(truncated ? buf.slice(0, MAX_BYTES) : buf);
  return { url: res.url || url, truncated, html };
};

/** 只接受 http(s)：`file:` / `javascript:` 之类的地址不该走到抓取。 */
export function normalizeSourceUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new SourceFileError("链接是空的");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new SourceFileError(`${input} 不是有效的链接`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new SourceFileError(`${u.protocol} 链接不支持，只接受 http / https`);
  return u.toString();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  middot: "·",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

/**
 * 正文抽取：去掉脚本、样式、导航、页眉页脚这类结构标签，再按块级标签断行。
 * 不用第三方 readability —— 它在这里的收益是「判断哪一块是正文」，但这条链路后面还有模型
 * 在整理，多留一点正文比误删一段更安全。
 */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header|aside|form|button)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|section|article|li|h[1-6]|tr|blockquote|pre|dd|dt)>/gi, "\n");
  s = s.replace(/<\/t[dh]>/gi, "\t");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** 页面标题：`<title>` 优先，其次第一个 `<h1>`，都没有就用域名。 */
export function htmlTitle(html: string, url: string): string | undefined {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const pick = (raw: string | undefined) => (raw ? decodeEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "");
  return pick(t) || pick(h1) || new URL(url).hostname;
}

/**
 * 网页 → 参考材料。和 `extractSourceText` 的结果同形，直接进 `guidance.sourceMaterial`。
 * 文本过长时截断并标记，`truncated` 让界面可以说清楚「只读了前 12000 字」。
 */
export async function fetchUrlMaterial(input: string, fetcher: PageFetcher = defaultPageFetcher, signal?: AbortSignal): Promise<UrlMaterial> {
  const url = normalizeSourceUrl(input);
  const page = await fetcher(url, signal);
  const text = htmlToText(page.html);
  if (!text.trim()) throw new SourceFileError(`${url} 里没有可读正文`);
  const clipped = text.length > MAX_TEXT;
  return {
    url,
    finalUrl: page.url,
    ...(htmlTitle(page.html, page.url) ? { title: htmlTitle(page.html, page.url) } : {}),
    text: clipped ? `${text.slice(0, MAX_TEXT)}\n…（已截断）` : text,
    truncated: page.truncated || clipped,
  };
}

/** 拼成 `guidance.sourceMaterial` 的格式，和文件名标题那一行一致。 */
export function urlMaterialBlock(m: UrlMaterial): string {
  const head = `# ${m.title ?? m.finalUrl}${m.finalUrl !== m.url ? ` (${m.finalUrl})` : ""}`;
  return `${head}\n来源链接：${m.finalUrl}\n${m.text}`;
}

/** 粗略识别用户是不是在让「这一页」当材料，而不是在描述主题。供宿主决定弹不弹输入框。 */
export function looksLikeUrl(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}
