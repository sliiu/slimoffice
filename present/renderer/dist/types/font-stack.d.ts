/**
 * Font fallback for the browser. OOXML names one typeface per run ("Inter", "Songti SC"); when the
 * machine lacks it PowerPoint substitutes a face of the same class (sans / serif / mono), but a
 * browser given a bare unknown family falls back to its default — usually a serif — so a sans deck
 * comes up in Times. Append the class-matched generic (plus CJK faces so Han glyphs never hit a
 * Latin-only fallback) to every family that is not already a stack.
 */
/** `family` as a CSS font-family list with a class-matched generic fallback appended. */
export declare function withFontFallback(family: string | undefined | null): string;
