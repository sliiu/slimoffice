/**
 * Slot layout: the model picks a composition and fills slots (eyebrow, title, lede, one carrier,
 * an optional side element, a takeaway, a footnote); this module decides every coordinate.
 *
 * Why: a flash-tier model writing raw bboxes produced half-empty pages, titles split from their
 * copy, and cards stretched to 400px around two lines of text. Here geometry comes from the
 * composition's regions, and each carrier is sized to what it holds (`fitHeight`) and then placed
 * in its region, so the page reads as one block instead of a header and a void.
 *
 * Output is ordinary canvas elements (text / surface / device / chart / table / diagram), so snap,
 * reflect, paint and emit treat a slot page exactly like an authored one.
 */
import type { FilledEl } from "./ir.js";
import { type VisualSystem } from "./visual-system.js";
/** Compositions the slot layout handles; anchor pages (statement / full-bleed) stay authored. */
export declare const SLOT_COMPOSITIONS: readonly ["header-stack", "split", "sidebar", "band", "grid"];
export type SlotComposition = (typeof SLOT_COMPOSITIONS)[number];
export declare function isSlotComposition(c: unknown): c is SlotComposition;
export interface PageSlots {
    composition: SlotComposition;
    eyebrow?: string;
    title: string;
    lede?: string;
    /** The page's one carrier (device / chart / table / diagram / image); its bbox is ignored. */
    carrier?: FilledEl;
    /** split / sidebar: a second, smaller element under the lede (calloutNote, a 1–2 item kpiRow, a short text). */
    side?: FilledEl;
    /** One-sentence conclusion, set as a takeaway band under the carrier. */
    takeaway?: string;
    /** Source / method line at the foot of the page. */
    footnote?: string;
}
/**
 * Height an element wants inside a `w`-wide region at most `maxH` tall. Devices are expanded at
 * shrinking heights until a text part would overflow or be clipped; charts and diagrams take a
 * comfortable share; tables take their rows.
 */
export declare function fitHeight(el: FilledEl, w: number, maxH: number, sys: VisualSystem): number;
/** Elements for one slot page. Pure: same slots + system → same geometry. */
export declare function layoutPage(slots: PageSlots, sys: VisualSystem): FilledEl[];
