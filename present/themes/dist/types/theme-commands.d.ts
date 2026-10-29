import { type EditCommand, type Presentation } from "@sliiu/present-core";
import { type ThemeDef } from "./themes.js";
/** 示例封面文案（由调用方注入，themes 包不持有 i18n）。 */
export interface SampleCoverText {
    title: string;
    subtitle: string;
}
export interface ApplyCustomThemeOpts {
    preserveImageBackgrounds?: boolean;
    /**
     * 首页无内容时铺一组示例主副标题，让用户立刻看到该主题的排印。
     * 不传则完全不介入（AI 生成等已有内容的路径不需要）。
     */
    sampleCover?: SampleCoverText;
}
export declare class ApplyCustomThemeCmd implements EditCommand {
    private theme;
    private opts;
    readonly label = "Apply custom theme";
    private prev?;
    private prevMasters?;
    private prevThemeMeta?;
    private prevTextColors?;
    constructor(theme: ThemeDef, opts?: ApplyCustomThemeOpts);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export interface ApplyThemeOpts {
    preserveImageBackgrounds?: boolean;
}
export declare class ApplyThemeCmd implements EditCommand {
    private themeId;
    private opts;
    readonly label = "Apply theme";
    private prev?;
    private prevThemeMeta?;
    private prevTextColors?;
    constructor(themeId: string, opts?: ApplyThemeOpts);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
