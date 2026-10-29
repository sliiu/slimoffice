import { type GeneratedThemeSpec, type ThemeDef } from "../../themes.js";
import { type MotionBundle, type MotionSchemeSpec } from "../../animations.js";
import { type MotionGuidance, type ThemeContextForMotion, type ThemeGuidance } from "../prompts.js";
import { type GenerateOptions } from "../types.js";
import { type LayoutStyleGuidance, type LayoutStyleSpec } from "../layout-style.js";
export declare function generateTheme(guidance: ThemeGuidance, opts?: GenerateOptions): Promise<{
    spec: GeneratedThemeSpec;
    theme: ThemeDef;
}>;
export declare function generateMotionScheme(guidance: MotionGuidance, opts?: GenerateOptions): Promise<{
    spec: MotionSchemeSpec;
    bundle: MotionBundle;
}>;
/**
 * 把 GeneratedThemeSpec 浓缩成 motion 用的 ThemeContext。
 * 不暴露完整 palette（避免 prompt token 浪费），只给最影响 motion 的几项。
 */
export declare function themeContextFromSpec(spec: GeneratedThemeSpec): ThemeContextForMotion;
/**
 * AI 布局风格生成：LLM 设计一套版式语言（LayoutStyleSpec），layouts.ts 引擎
 * 按 spec 渲染。与主题（颜色/字体）、motion（动效）并列的第三个设计自由度。
 *
 * themeSpec 可选 —— 传入时布局系统会与已定的主题调性联动。
 */
export declare function generateLayoutStyle(guidance: LayoutStyleGuidance, opts?: GenerateOptions, themeSpec?: GeneratedThemeSpec): Promise<LayoutStyleSpec>;
/**
 * 一次性生成"主题 + 配套 motion scheme + 布局风格"。theme 先行（motion 与
 * layout style 都要 theme 摘要做联动），随后 motion / layoutStyle 并行。
 *
 * 失败模式：
 *   - theme 生成失败 → 整体抛错（无主题就不应该往下走）；
 *   - motion 失败 → 静默回退到根据 theme 推断的内置 bundle；
 *   - layoutStyle 失败 → 返回 null，layouts.ts 回退到种子化构图变体。
 */
export declare function generateThemeWithMotion(themeGuidance: ThemeGuidance, motionGuidance: Omit<MotionGuidance, "themeContext">, opts?: GenerateOptions): Promise<{
    spec: GeneratedThemeSpec;
    theme: ThemeDef;
    motion: {
        spec: MotionSchemeSpec;
        bundle: MotionBundle;
    } | null;
    layoutStyle: LayoutStyleSpec | null;
}>;
