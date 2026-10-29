import { type Slide, type SlideMaster, type SlideSize, type Theme } from "@sliiu/present-core";
import type { GeneratedThemeSpec, ThemeDef } from "./themes.js";
/** ThemeDef → GeneratedThemeSpec（无 LLM，供母版构建与模板合成共用）。 */
export declare function themeSpecFromThemeDef(theme: ThemeDef, spec?: GeneratedThemeSpec): GeneratedThemeSpec;
export declare function buildCoreThemeFromSpec(spec: GeneratedThemeSpec, theme: ThemeDef, themeId: string): Theme;
/** 从 ThemeDef 构建完整母版 + 版式（与 template picker / 新建 deck 同源）。 */
export declare function buildMastersFromThemeDef(theme: ThemeDef, size: SlideSize, baseId: string, spec?: GeneratedThemeSpec): {
    masters: SlideMaster[];
    coreTheme: Theme;
};
/** 套用主题后按版式 type 为 slide 重绑 layoutRef。 */
export declare function resolveLayoutTypeForSlide(slide: Slide, index: number, prevMasters?: SlideMaster[]): string;
export declare function findLayoutRefByType(masters: SlideMaster[], layoutType: string): {
    masterId: string;
    layoutId: string;
} | undefined;
/** 清除 slide 层遗留的 dec_*（母版路径下装饰改由 compose 合成）。 */
export declare function stripSlideThemeDecorations(slide: Slide): void;
