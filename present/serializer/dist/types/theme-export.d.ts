import type { Paint, Presentation, Theme } from "@sliiu/present-core";
/** 字体名本身是东亚字体（含中文名 / 微软雅黑等），应写入 `<a:ea>`。 */
export declare function looksCjkTypeface(name: string | undefined): boolean;
/** 从 CSS font stack 提取东亚字体（ea），避免 PowerPoint / WPS 中文回退到默认宋体。 */
export declare function pickEaTypeface(family: string | undefined): string | undefined;
/** 从 CSS font stack 或裸 family 名提取 OOXML typeface（取第一个有效 family）。 */
export declare function primaryTypeface(family: string | undefined): string | undefined;
/**
 * 推断「主题画布背景」—— AI 换主题后 slide.background 已更新，但 master/layout
 * 部件在内存里往往仍是模板旧底色（白）。导出时必须让 master/layout 的 `<p:bg>`
 * 与 slide 一致，否则 PowerPoint 仍按旧母版渲染，看起来「主题没换」。
 */
export declare function inferThemeCanvasBackground(pres: Presentation): Paint | undefined;
/**
 * master / layout 导出时应使用的背景：仅当部件**自己**显式声明了一个与 slide 主题
 * 画布不同的底色时，才用 canvas 覆盖；部件原本依赖继承（`partBackground === undefined`）
 * 时保持继承，绝不注入显式 `<p:bg>` —— 否则普通"打开即保存"会给原本无 `<p:bg>` 的
 * 所有 layout 都加一个空白底色，污染 27+ part 字节，二次 round-trip 不收敛。
 *
 * 典型触发场景的归属：
 *   - AI 换主题 + master/layout 已有自家 bg → fired，更新到新 canvas（保持视觉一致）。
 *   - AI 换主题 + master/layout 依赖继承 → 不 fired，靠 theme.colors 重新解析继承结果。
 *   - 用户只打开未编辑 → 不 fired，layout 保留原始字节。
 */
export declare function backgroundForThemeExport(partBackground: Paint | undefined, pres: Presentation): Paint | undefined;
/** 比较 theme.colors/fonts 是否变化（round-trip 触发 theme XML patch 用）。 */
export declare function themeColorsFontsEqual(a: Theme | undefined, b: Theme | undefined): boolean;
/**
 * 主题 major/minor 上的 ISO 15924 补字（ECMA-376 CT_SupplementalFont）。
 * 空 `<a:ea typeface="">` 在 Office 表示「用应用默认 CJK」；LibreOffice / 部分 WPS
 * 会当成缺字体。脚本槽给出真实家族名后，中日韩不会变成方框。
 */
export declare const THEME_SCRIPT_FONTS: ReadonlyArray<{
    script: string;
    typeface: string;
}>;
export declare function themeScriptFontsXml(): string;
/** latin / ea / cs + 脚本补字。cs 永不写空 typeface（LibreOffice 会当成缺字体）。 */
export declare function themeTypefacesXml(latin: string, ea: string | undefined): string;
/**
 * Office 风格 fmtScheme（3 fill / 3 ln / 3 effect / 3 bgFill）。
 * from-scratch 以前三条都是实心 phClr，PowerPoint 套「中等/强烈」快速样式会变成一片纯色。
 */
export declare function officeFmtSchemeXml(): string;
/** 新建形状在 PowerPoint 里走的主题默认样式（缺了会落到黑框/无填充）。 */
export declare function objectDefaultsXml(): string;
