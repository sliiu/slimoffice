import type { Presentation, Slide, TextRun, TextShape } from "@sliiu/present-core";
import { type Rgb } from "./color.js";
export type QaFixKind = "contrast" | "zorder" | "offcanvas" | "placeholder" | "autofit";
export interface QaFix {
    slide: number;
    kind: QaFixKind;
    detail: string;
}
export interface QaReport {
    fixes: QaFix[];
    warnings: string[];
}
export interface ValidateOptions {
    /** 每页的 SlideSpec kind，用于叙事节奏告警（可选；不传则跳过节奏检查）。 */
    slideKinds?: string[];
    /** 大文字（标题/数字）对比度阈值，默认 3.0（WCAG AA large text）。 */
    largeTextContrast?: number;
    /** 正文对比度阈值，默认 4.5（WCAG AA normal text）。 */
    bodyTextContrast?: number;
}
/**
 * The colour a run visibly reads in: the outline paint for hollow type, the first stop for a
 * gradient fill, else `color`. Treating hollow type as "missing color" used to flood-fill every
 * outlined cover title with the safe text colour.
 */
export declare function effectiveRunColor(run: TextRun): string | undefined;
/**
 * What a text shape visually sits on, for read-only summaries (art-director / tools):
 * the hex of the backdrop shape or slide field, `"image"` for an unscrimmed photo, or
 * `undefined` when nothing can be determined. Same rule as the contrast repair uses.
 */
export declare function effectiveBackdropForText(slide: Slide, text: TextShape, presThemeBg?: string): {
    on: string;
    scrim: boolean;
} | undefined;
export interface PaletteCandidate {
    hex: string;
    rgb: Rgb;
}
/** Palette text candidates in preference order: ink (light bg), onPhoto / bg (dark bg), then muted. Keeps the token's original hex spelling. */
export declare function paletteTextCandidates(colors: Record<string, string> | undefined): PaletteCandidate[];
/** First palette token (in preference order) that clears `threshold` on `bg`; safe color only as a last resort. */
export declare function pickRepairColor(bg: Rgb, threshold: number, candidates: PaletteCandidate[]): string;
export declare function validateAndRepairPresentation(pres: Presentation, opts?: ValidateOptions): QaReport;
/** 按字号和框的内沿估计行数。放得下就返回 false，渲染期缩排不会再动它。 */
export declare function textBoxOverflows(shape: TextShape): boolean;
