/**
 * Thin UI-model for deckgen chrome: outline pills, error copy, result badges.
 * Look (system + palette) is authored by the model, not a wizard picker.
 *
 * DOM lives in playground (`deckgen-chrome.ts`). This file is the shared
 * whitelist / human-error contract the adapter and UI both use.
 * The live wizard is Brief → Outline → Build; a reviewed outline is the page list.
 */
import { type ColorThemeId, type LayoutId, type VisualSystemId } from "../deckgen/ids.js";
import type { SlidePlan } from "../deckgen/page-plan.js";
import type { Outline, OutlineItem } from "./schema.js";
export type DeckgenErrorKind = "pairing" | "invented-layout" | "invented-variant" | "invented-page-type" | "over-slots" | "unknown";
/** User-facing deckgen failure. `message` is always a single human line (no stack). */
export declare class DeckgenUserError extends Error {
    readonly kind: DeckgenErrorKind;
    readonly userMessage: string;
    constructor(kind: DeckgenErrorKind, detail?: string);
}
export declare function deckgenErrorKindFromMessage(raw: string): DeckgenErrorKind;
/** Map any thrown value to a single human line. Never returns a stack. */
export declare function formatDeckgenUserError(e: unknown): string;
export declare function firstLine(text: string): string;
/** True if the string looks like a stack / Error dump (must never reach the toast). */
export declare function looksLikeStackDump(text: string): boolean;
export declare function sanitizeDeckgenErrorCopy(text: string): string;
export interface ThemeOption {
    id: ColorThemeId;
    systemId: VisualSystemId;
    allowed: boolean;
}
/** All six themes; `allowed` is the pairing filter. Illegal ones stay visible + disabled. */
export declare function colorThemeOptions(systemId: VisualSystemId): ThemeOption[];
export declare function isThemeAllowedForSystem(systemId: VisualSystemId, themeId: string): boolean;
export interface LayoutVariantOption {
    layout: LayoutId;
    variant: string;
    value: string;
}
export declare function layoutVariantOptions(): LayoutVariantOption[];
export declare function isWhitelistedLayoutVariant(layout: string, variant: string): boolean;
export declare function defaultVariantFor(layout: LayoutId): string;
export interface PageLock {
    layout: string;
    variant: string;
}
export declare function readOutlinePageLock(item: OutlineItem): PageLock;
/**
 * Display default for the outline pill. Does not invent: unknown hints become
 * `bullets/title-5` for the UI only. Build still validates the stored lock.
 */
export declare function defaultOutlinePageLock(item: OutlineItem, index: number, total: number): PageLock;
export declare function applyOutlinePageLock(item: OutlineItem, lock: PageLock): void;
export declare function planFromOutlineItem(item: OutlineItem, index: number, total?: number): SlidePlan;
export declare function assertPageSlotCaps(plan: SlidePlan, slideNo: number): void;
/** True when the wizard (or a test) locked at least one page to a deckgen layout. */
export declare function outlineHasDeckgenLocks(outline: Outline): boolean;
export declare function pagesFromOutline(outline: Outline): SlidePlan[];
export interface ResultBadgeMeta {
    system?: string;
    layout?: string;
    theme?: string;
    variant?: string;
}
export declare function resultBadgeParts(meta: ResultBadgeMeta): string[];
/** `system · layout · theme` when layout is known; otherwise `system · theme`. */
export declare function formatResultBadge(meta: ResultBadgeMeta): string;
export declare function badgeFromSlideTags(tags?: Record<string, string> | null): ResultBadgeMeta;
/** Relative luminance 0..1 (sRGB hex). */
export declare function hexLuminance(hex: string): number;
export declare function contrastRatio(a: string, b: string): number;
/**
 * Badge text must keep ≥ 60% of body-on-bg contrast.
 * Prefer muted; fall back to ink when muted is too weak.
 */
export declare function pickBadgeForeground(opts: {
    bg: string;
    ink: string;
    muted: string;
}): {
    color: string;
    ratio: number;
    bodyRatio: number;
};
export declare const DECKGEN_CAPTION_PX: {
    readonly editorial: 12;
    readonly swiss: 11;
};
