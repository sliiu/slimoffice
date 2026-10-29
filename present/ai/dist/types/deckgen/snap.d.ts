/**
 * Normalize LLM (or fixture) canvas IR: real images only, type ramp, grid,
 * palette roles. Photo backgrounds may bleed; type stays in the 5% inset.
 */
import { type VisualSystem } from "./visual-system.js";
import { type CanvasScrim, type FilledEl, type FilledSlide, type TextTreatment } from "./ir.js";
import type { PageBrief } from "./brief.js";
/** Floating objects (shadow / glow) allowed per page before snap strips the rest. */
export declare const MAX_FLOATING_PER_PAGE = 2;
/** Elements snap dropped and why — surfaced in the repair prompt. */
export interface SnapDrop {
    slideIdx: number;
    slot: string;
    reason: string;
}
export declare function realImageSrc(src?: string): string | undefined;
export declare function canvasTypeRamp(sys: VisualSystem): number[];
export declare function snapFontSize(n: number, ramp: number[]): number;
/**
 * When the author omitted fontSize, read the role off the slot name / box height instead
 * of flattening the whole page to body size (the #1 art-director complaint on live runs).
 */
export declare function inferFontSizeFromSlot(slot: unknown, sys: VisualSystem, bbox: {
    h: number;
}, text?: string): number;
/** A page whose title is a section title (not display type). */
export declare function isContentPage(layout: string | undefined, brief?: PageBrief): boolean;
/** The page-title slot (not tile / step / kpi / plane titles inside devices). */
export declare function isTitleSlot(slot: unknown): boolean;
/** Rough CJK-aware glyph width in em. */
export declare function textUnits(text: string): number;
/**
 * A display sentence the author set at 84px in a 700×220 box ("Masters and layouts come along")
 * wraps to three lines and runs 70px past the box into the subtitle below. Step it down the ramp
 * until the estimated wrapped height fits the box (10% slack). Body copy and below is left as
 * authored — a paragraph box that is too short is the author's overflow, not a sizing choice.
 */
export declare function fitTextSize(text: string, size: number, bbox: {
    w: number;
    h: number;
}, ramp: readonly number[], lineHeight: number | undefined, sys: VisualSystem): number;
/**
 * h1 for content titles; h2 when the title cannot fit in two lines of h1 inside its box — or when
 * two lines of h1 would leave a single character on the second line ("和常见方案的区 / 别"). An
 * orphan is fixed by stepping down only if h2 then fits without one; otherwise h1 stands.
 */
export declare function contentTitleSize(sys: VisualSystem, text: string, bbox: {
    w: number;
    h: number;
}): number;
/**
 * The section title of a content page when the author did not name a `title` slot (most
 * models don't): the largest word-text in the top third at ≥ h2 — not a sidebar numeral
 * ("04"), not a KPI value ("41%"), not an eyebrow. Shared by snap (forces) and reflect (checks).
 */
export declare function findContentTitle(elements: FilledEl[], sys: VisualSystem): FilledEl | undefined;
export declare function normalizeTreatment(raw: unknown): TextTreatment | undefined;
/**
 * The treatment this system will actually draw for a request. A banned one falls back to the
 * system default (never silently to the banned effect); a system whose default is `none` draws
 * only what it allows. Shadow is allowed even on shadow-banning systems when it is their display
 * voice (photo-editorial: type on a photo needs it to read).
 */
export declare function resolveTreatment(sys: VisualSystem, want: TextTreatment | undefined): TextTreatment | undefined;
/**
 * Cap a device string without cutting a word in half: back off to the last space / CJK
 * boundary when that keeps most of the budget, and mark the cut with an ellipsis so
 * "authored in th" never ships as if it were the whole sentence.
 */
export declare function clipText(raw: string, max: number): string;
/** A metric-led title: "70+", "3.2x", "45%", "200+ 动画", "70+ transitions" — a number, optional unit, then at most a short label. */
export declare const NUMERIC_VALUE: RegExp;
/**
 * No authored scrim → derive one from where the type sits. Darkest on the
 * type side, clear on the far side. Uniform overlays flatten the photo.
 */
export declare function deriveScrim(elements: FilledEl[], overlay: number | undefined): CanvasScrim;
/**
 * The scrim is darkest where the copy's weight is; a kicker or folio in the far corner would sit
 * on the bare photograph. When any type lies on the clear side, keep a veil there too — a third
 * of the peak, enough for small light type, not enough to flatten the picture.
 */
export declare function withScrimFloor(scrim: CanvasScrim, elements: FilledEl[]): CanvasScrim;
/**
 * An eyebrow drawn 4px above a title ("Coverage" y=32 h=20, title y=56) collides once the
 * renderer adds its insets and line leading: the small label's descenders land on the title's
 * cap line. Keep a breathing gap between stacked free text — half the smaller size, at least
 * 6px — by lifting the upper (smaller) box when there is room, else pushing the lower one down.
 */
export declare function separateStackedText(elements: FilledEl[], my: number): void;
export interface SnapCanvasResult {
    slides: FilledSlide[];
    drops: SnapDrop[];
}
/** The page's title text: the `title` slot, else the largest word-text (numerals excluded). */
export declare function pageTitleOf(slide: FilledSlide): string | undefined;
/**
 * Every agenda row must open a real page. A row's `target` is kept when it names another page;
 * otherwise it is matched by title, then by the k-th section page after the agenda, then by the
 * k-th content page. Rows that still cannot be placed lose their link rather than jumping to
 * the wrong slide. Mutates `slides` in place (device items only).
 */
export declare function resolveAgendaTargets(slides: FilledSlide[]): void;
/** Every page-numeral text on the page: "04" or "04 / 14", in a top or bottom band or the sidebar column, not a device part. */
export declare function pageNumeralsOf<T extends FilledEl>(elements: T[]): T[];
export declare function pageNumeralOf<T extends FilledEl>(elements: T[]): T | undefined;
/**
 * Folio decision applied deterministically. `false`: strip every page numeral the author drew
 * (a KPI "12" inside a device is not a numeral). `true`: every content page carries one — the
 * author's if present, else a caption-size numeral in the bottom margin (left, or right when the
 * left corner is occupied), so wayfinding never depends on the model remembering every page.
 */
export declare function applyFolio(elements: FilledEl[], sys: VisualSystem, pageIdx: number, content: boolean, folio: boolean, size?: number, deck?: {
    total: number;
    pad: 1 | 2;
}): void;
/** snapCanvas with the drop report (used to build the repair prompt). */
export declare function snapCanvasReport(slides: FilledSlide[], sys: VisualSystem, opts?: {
    briefs?: Array<PageBrief | undefined>;
    folio?: boolean;
}): SnapCanvasResult;
export declare function snapCanvas(slides: FilledSlide[], sys: VisualSystem, opts?: {
    briefs?: Array<PageBrief | undefined>;
    folio?: boolean;
}): FilledSlide[];
