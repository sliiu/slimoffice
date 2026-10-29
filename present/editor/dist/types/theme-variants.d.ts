import type { Theme } from "@sliiu/present-core";
export type ThemeVariantId = "subtle" | "bold" | "warm" | "cool";
export interface ThemeVariantOption {
    id: ThemeVariantId;
    labelKey: "themeVariant.subtle" | "themeVariant.bold" | "themeVariant.warm" | "themeVariant.cool";
    swatch: string;
}
export declare const THEME_VARIANT_OPTIONS: ThemeVariantOption[];
type ThemeColors = NonNullable<Theme["colors"]>;
/** Shift a theme-canvas color (background, decoration) so the variant is visible on the slide. */
export declare function shiftBackgroundColor(hex: string, variant: ThemeVariantId): string;
/** Color chip for a variant: the theme canvas color after that shift, not a fixed swatch. */
export declare function variantPreviewSwatch(colors: ThemeColors, variant: ThemeVariantId): string;
/** Derive a color-scheme variant from the deck theme colors. Text slots stay put. */
export declare function applyThemeVariant(colors: ThemeColors, variant: ThemeVariantId): ThemeColors;
export {};
