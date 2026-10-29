export declare function isFontInjected(family: string): boolean;
/**
 * 注入一份 Google Fonts CSS（或任意公开 CSS）到当前 document。
 *
 * @param cssUrl  Google Fonts CSS v2 url（如 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'）
 *                也可以是任何指向 @font-face 规则的 CSS url。
 * @param family  CSS font-family 名（用于 dedup 缓存 + DOM 标记）。
 */
export declare function injectFontCss(cssUrl: string, family: string): void;
/**
 * 一组手工策划的 Google Fonts，AI 生成主题时从这里挑（保证可商用 + 浏览器可加载）。
 * 与 stock-fonts MCP 的 FONT_PRESETS 共用一套词汇，避免风格漂移。
 *
 * 每条都带 cssUrl，theme generator 调用 injectFontCss 立即生效。
 */
export interface ThemeFontPreset {
    family: string;
    /** CSS font stack：family + 系统 fallback，给 SVG/HTML 用。 */
    stack: string;
    category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
    language: "latin" | "cjk" | "both";
    cssUrl: string;
    tags: string[];
}
export declare const THEME_FONT_POOL: ThemeFontPreset[];
/** 按 family 找 preset；找不到返回 null，调用方应回退到默认栈。 */
export declare function findFontPreset(family: string): ThemeFontPreset | null;
