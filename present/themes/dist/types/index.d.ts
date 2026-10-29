export { BUILTIN_THEME_IDS, type BuiltinThemeId } from "./builtin-ids.js";
export { THEME_GALLERY_ORDER, type ThemeGalleryId } from "./gallery-order.js";
export { THEMES, THEME_IDS, THEME_OUTLINE_HINTS, THEME_STYLE_SEEDS, THEME_FONT_FAMILIES, GeneratedThemeSpecSchema, getTheme, injectThemeFonts, realizeGeneratedTheme, type ThemeDef, type ThemePalette, type ThemeFonts, type ThemeFontSizes, type ThemeMetrics, type ThemeDecoration, type ThemeWordArt, type GeneratedThemeSpec, type TemplateLayoutId, } from "./themes.js";
export { buildDecorationShapesShared, type DecorationContext } from "./decorations.js";
export { THEME_FONT_POOL, findFontPreset, injectFontCss, type ThemeFontPreset } from "./fonts/inject.js";
export { buildCoreThemeFromSpec, buildMastersFromThemeDef, findLayoutRefByType, resolveLayoutTypeForSlide, stripSlideThemeDecorations, themeSpecFromThemeDef, } from "./template-masters.js";
export { ApplyCustomThemeCmd, ApplyThemeCmd, type ApplyCustomThemeOpts, type ApplyThemeOpts, } from "./theme-commands.js";
