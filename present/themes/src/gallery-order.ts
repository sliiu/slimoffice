/** Design / Console 主题画廊展示顺序（与 template-store 内置模板顺序一致）。 */
export const THEME_GALLERY_ORDER = [
  "dark",
  "tech",
  "terminal",
  "creative",
  "luxe",
  "business",
  "editorial",
  "warm",
  "pastel",
  "academic",
  "ink",
  "nature",
  "minimal",
] as const;

export type ThemeGalleryId = (typeof THEME_GALLERY_ORDER)[number];
