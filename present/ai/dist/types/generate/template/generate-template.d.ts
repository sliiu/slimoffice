import { type Presentation, type SlideSize, type Template, createPresentationFromTemplate, presentationToTemplate } from "@sliiu/present-core";
import type { GenerateOptions } from "../pipeline.js";
import type { ThemeGuidance } from "../prompts.js";
import { type GeneratedThemeSpec, type ThemeDef } from "../../themes.js";
export interface GenerateTemplateOptions extends GenerateOptions {
    /** 模板物理尺寸；默认 1280×720（与 generate.ts 默认 16:9 一致）。 */
    size?: SlideSize;
    /** 自定义 template id 前缀，默认 `ai:<random>`。 */
    idPrefix?: string;
}
export interface GeneratedTemplate {
    /** 完整 core.Template，可直接传给 createPresentationFromTemplate。 */
    template: Template;
    /** 原始 ThemeDef + ThemeSpec，便于复用到 generatePresentation 的 themeOverride。 */
    themeDef: ThemeDef;
    themeSpec: GeneratedThemeSpec;
}
/**
 * 调 generateTheme 拿到 ThemeDef → 翻译成 core.Template。
 *
 * 失败语义：generateTheme 失败抛 —— 调用方负责 fallback (e.g. 用 blank template)。
 */
export declare function generateTemplate(guidance: ThemeGuidance, opts?: GenerateTemplateOptions): Promise<GeneratedTemplate>;
/**
 * 把已有的 ThemeDef → Template（不走网络，用于"复用已经生成的主题"）。
 *
 * 用法：用户在 deck 内已经 generateAndApplyTheme 过一次，对结果满意 → 调
 * `templateFromThemeDef(currentTheme)` → registerAiTemplate → 之后新建 deck 直接用。
 */
export declare function templateFromThemeDef(theme: ThemeDef, opts?: {
    size?: SlideSize;
    idPrefix?: string;
    description?: string;
    spec?: GeneratedThemeSpec;
}): Template;
export declare function generatePresentationFromTemplate(guidance: ThemeGuidance, opts?: GenerateTemplateOptions): Promise<{
    pres: Presentation;
    template: Template;
}>;
export { createPresentationFromTemplate, presentationToTemplate };
