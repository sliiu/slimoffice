export { BUILTIN_THEME_IDS, type BuiltinThemeId } from "./builtin-ids";
export { THEME_GALLERY_ORDER, type ThemeGalleryId } from "./gallery-order";
export {
  THEMES,
  THEME_IDS,
  THEME_OUTLINE_HINTS,
  THEME_STYLE_SEEDS,
  THEME_FONT_FAMILIES,
  GeneratedThemeSpecSchema,
  getTheme,
  injectThemeFonts,
  realizeGeneratedTheme,
  type ThemeDef,
  type ThemePalette,
  type ThemeFonts,
  type ThemeFontSizes,
  type ThemeMetrics,
  type ThemeDecoration,
  type ThemeWordArt,
  type GeneratedThemeSpec,
  type TemplateLayoutId,
} from "./themes";
export { buildDecorationShapesShared, type DecorationContext } from "./decorations";
export { THEME_FONT_POOL, findFontPreset, injectFontCss, type ThemeFontPreset } from "./fonts/inject";
export {
  buildCoreThemeFromSpec,
  buildMastersFromThemeDef,
  findLayoutRefByType,
  resolveLayoutTypeForSlide,
  stripSlideThemeDecorations,
  themeSpecFromThemeDef,
} from "./template-masters";
export {
  ApplyCustomThemeCmd,
  ApplyThemeCmd,
  type ApplyCustomThemeOpts,
  type ApplyThemeOpts,
} from "./theme-commands";
