import type { EmbeddedFont, Presentation } from "./slide.js";
export declare function parseCssTypefaces(css: string | undefined): string[];
export declare function firstNamedTypeface(css: string | undefined): string | undefined;
export declare function canonicalTypeface(css: string | undefined): string | undefined;
/** Collect unique typeface names from deck text + theme font scheme. */
export declare function collectUsedTypefaces(pres: Presentation): string[];
export declare function collectUsedFontFaces(pres: Presentation): Array<{
    family: string;
    weight: number;
    style: "normal" | "italic";
}>;
/** True when `pres.fonts` already has a face for the base family (ignoring alias entries). */
export declare function isTypefaceEmbedded(pres: Presentation, typeface: string): boolean;
export declare function isFontFaceEmbedded(pres: Presentation, typeface: string, weight: number, style?: "normal" | "italic"): boolean;
export declare function removeEmbeddedFontFamilies(current: EmbeddedFont[] | undefined, families: string[]): EmbeddedFont[];
/** Merge new embedded faces; later entries win on duplicate family/weight/style. */
export declare function mergeEmbeddedFonts(current: EmbeddedFont[] | undefined, additions: EmbeddedFont[]): EmbeddedFont[];
export declare function bytesToFontDataUrl(bytes: Uint8Array, mime?: string): string;
