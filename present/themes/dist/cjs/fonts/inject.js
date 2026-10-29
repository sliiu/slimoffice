"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME_FONT_POOL = void 0;
exports.isFontInjected = isFontInjected;
exports.injectFontCss = injectFontCss;
exports.findFontPreset = findFontPreset;
const core_1 = require("@sliiu/present-core");
// 浏览器内字体注入工具：把 Google Fonts CSS 链接以 idempotent 方式塞进 <head>，
// 让 SVG / Canvas / DOM 渲染时都能正确解析到指定 fontFamily。
//
// 用于：
//   - stock-fonts MCP：用户主动选字体（fonts_apply）
//   - theme generator：AI 生成主题时一并把题字 / 正文 family 注入
//
// 设计：
//   - 缓存已注入的 family，防止 N 次 apply 同一字体重复添加 <link>。
//   - preconnect 只插入一次（fonts.googleapis.com + fonts.gstatic.com）。
//   - 不依赖任何外部资源；离线 / CDN 不可达时 link 失败不会阻塞渲染，会回退到
//     font 栈中的下一个备选。
const INJECTED_FAMILIES = new Set();
function isFontInjected(family) {
    return INJECTED_FAMILIES.has(family);
}
/**
 * 注入一份 Google Fonts CSS（或任意公开 CSS）到当前 document。
 *
 * @param cssUrl  Google Fonts CSS v2 url（如 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'）
 *                也可以是任何指向 @font-face 规则的 CSS url。
 * @param family  CSS font-family 名（用于 dedup 缓存 + DOM 标记）。
 */
function injectFontCss(cssUrl, family) {
    if (typeof document === "undefined")
        return;
    const existing = document.querySelector(`link[data-mcp-font="${family}"]`);
    if (existing) {
        if (existing.getAttribute("href") !== cssUrl)
            existing.href = cssUrl;
        INJECTED_FAMILIES.add(family);
        return;
    }
    if (INJECTED_FAMILIES.has(family))
        return;
    if (!document.querySelector('link[data-mcp-font-preconnect]')) {
        const pre1 = document.createElement("link");
        pre1.rel = "preconnect";
        pre1.href = "https://fonts.googleapis.com";
        pre1.dataset.mcpFontPreconnect = "1";
        document.head.appendChild(pre1);
        const pre2 = document.createElement("link");
        pre2.rel = "preconnect";
        pre2.href = "https://fonts.gstatic.com";
        pre2.crossOrigin = "anonymous";
        pre2.dataset.mcpFontPreconnect = "1";
        document.head.appendChild(pre2);
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    link.dataset.mcpFont = family;
    document.head.appendChild(link);
    INJECTED_FAMILIES.add(family);
}
// 字体栈 fallback：CJK 兼容 + 系统兜底。
const CJK_FALLBACK = ', "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"';
exports.THEME_FONT_POOL = [
    // ---- 拉丁 sans-serif ----
    { family: "Inter", category: "sans-serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&display=swap",
        stack: `"Inter", -apple-system, BlinkMacSystemFont${CJK_FALLBACK}, sans-serif`,
        tags: ["modern", "ui", "neutral", "tech", "clean"] },
    { family: "Manrope", category: "sans-serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
        stack: `"Manrope", -apple-system${CJK_FALLBACK}, sans-serif`,
        tags: ["modern", "elegant", "startup"] },
    { family: "Space Grotesk", category: "sans-serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap",
        stack: `"Space Grotesk", -apple-system${CJK_FALLBACK}, sans-serif`,
        tags: ["modern", "tech", "geometric", "futuristic"] },
    { family: "DM Sans", category: "sans-serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap",
        stack: `"DM Sans"${CJK_FALLBACK}, sans-serif`,
        tags: ["modern", "warm", "friendly"] },
    { family: "Plus Jakarta Sans", category: "sans-serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
        stack: `"Plus Jakarta Sans"${CJK_FALLBACK}, sans-serif`,
        tags: ["modern", "balanced", "saas"] },
    // ---- 拉丁 display / headline ----
    { family: "Sora", category: "display", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;800&display=swap",
        stack: `"Sora"${CJK_FALLBACK}, sans-serif`,
        tags: ["headline", "tech", "modern", "bold"] },
    { family: "Bricolage Grotesque", category: "display", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&display=swap",
        stack: `"Bricolage Grotesque"${CJK_FALLBACK}, sans-serif`,
        tags: ["editorial", "expressive", "headline"] },
    { family: "Unbounded", category: "display", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;800&display=swap",
        stack: `"Unbounded"${CJK_FALLBACK}, sans-serif`,
        tags: ["futuristic", "rounded", "luxury", "headline"] },
    // ---- 拉丁 serif ----
    { family: "Playfair Display", category: "serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,800;0,900;1,400&display=swap",
        stack: `"Playfair Display"${CJK_FALLBACK}, serif`,
        tags: ["elegant", "editorial", "luxury", "headline"] },
    { family: "Fraunces", category: "serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,700;9..144,900&display=swap",
        stack: `"Fraunces"${CJK_FALLBACK}, serif`,
        tags: ["editorial", "warm", "expressive"] },
    { family: "Newsreader", category: "serif", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,600&display=swap",
        stack: `"Newsreader"${CJK_FALLBACK}, serif`,
        tags: ["reading", "magazine", "warm"] },
    // ---- 等宽 ----
    { family: "JetBrains Mono", category: "monospace", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
        stack: `"JetBrains Mono", "Menlo", "Consolas", monospace`,
        tags: ["code", "monospace", "developer"] },
    { family: "IBM Plex Mono", category: "monospace", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap",
        stack: `"IBM Plex Mono", "Menlo", "Consolas", monospace`,
        tags: ["code", "monospace", "editorial", "meta"] },
    { family: "Space Mono", category: "monospace", language: "latin",
        cssUrl: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap",
        stack: `"Space Mono", "Menlo", monospace`,
        tags: ["code", "retro", "tech"] },
    // ---- 中文 sans ----
    { family: "Noto Sans SC", category: "sans-serif", language: "cjk",
        cssUrl: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap",
        stack: `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`,
        tags: ["中文", "黑体", "简体", "正式", "现代"] },
    // ---- 中文 serif ----
    { family: "Noto Serif SC", category: "serif", language: "cjk",
        cssUrl: "https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700;800;900&display=swap",
        stack: `"Noto Serif SC", "Songti SC", "SimSun", serif`,
        tags: ["中文", "宋体", "简体", "正式", "经典"] },
    // ---- 中文显示 / 标题 ----
    { family: "ZCOOL XiaoWei", category: "display", language: "cjk",
        cssUrl: "https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap",
        stack: `"ZCOOL XiaoWei", "Songti SC", serif`,
        tags: ["中文", "宋体", "手写", "标题", "文艺"] },
    { family: "ZCOOL KuaiLe", category: "display", language: "cjk",
        cssUrl: "https://fonts.googleapis.com/css2?family=ZCOOL+KuaiLe&display=swap",
        stack: `"ZCOOL KuaiLe"${CJK_FALLBACK}, sans-serif`,
        tags: ["中文", "可爱", "标题", "活泼"] },
    { family: "Ma Shan Zheng", category: "handwriting", language: "cjk",
        cssUrl: "https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap",
        stack: `"Ma Shan Zheng", "Songti SC", serif`,
        tags: ["中文", "书法", "毛笔", "手写", "传统"] },
];
/** 按 family 找 preset；找不到返回 null，调用方应回退到默认栈。 */
function findFontPreset(family) {
    const exact = exports.THEME_FONT_POOL.find((p) => p.family === family || p.stack === family);
    if (exact)
        return exact;
    const primary = (0, core_1.canonicalTypeface)(family) ?? (0, core_1.firstNamedTypeface)(family);
    if (!primary)
        return null;
    const lower = primary.toLowerCase();
    return exports.THEME_FONT_POOL.find((p) => p.family.toLowerCase() === lower) ?? null;
}
