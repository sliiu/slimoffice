/**
 * Content / Design / Coherence self-check.
 * Reflective checklist; hard fail.
 */
import type { Presentation } from "@sliiu/present-core";
import { type ColorTheme } from "./color-theme.js";
import { type VisualSystem } from "./visual-system.js";
import type { PaintedSlide } from "./apply-theme.js";
export type ReflectKind = "content" | "design" | "coherence";
export interface ReflectFinding {
    kind: ReflectKind;
    /** Page index, or -1 for a deck-level finding. */
    slideIdx: number;
    issue: string;
    /** Deck-level findings that know which pages deviate list them here (drives page-scoped repair). */
    pages?: number[];
}
export interface ReflectResult {
    passed: boolean;
    findings: ReflectFinding[];
}
export declare function reflectPainted(slides: PaintedSlide[], system: VisualSystem, theme: ColorTheme): ReflectResult;
export declare function reflectPresentation(pres: Presentation, system: VisualSystem, theme: ColorTheme): ReflectResult;
export declare function assertReflect(result: ReflectResult): void;
