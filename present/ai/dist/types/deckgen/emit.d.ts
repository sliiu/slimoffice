/**
 * Emit an editable SlimPPT Presentation IR (same object model tools mutate).
 */
import { type Presentation } from "@sliiu/present-core";
import type { ColorTheme } from "./color-theme.js";
import type { VisualSystem } from "./visual-system.js";
import type { PaintedSlide } from "./apply-theme.js";
/**
 * Animation unit for a device part. Device expanders name parts `<device>.<item>.<part>`
 * (`kpis.kpi0.value`) or `<device>.<part>` (`band.text`). Everything inside one item — card,
 * icon, title, body — enters together; a device without items (band / callout / quote) is one
 * unit. Author-laid cards (surface + texts) have plain slots and fall back to bbox grouping in
 * `autoAnimateSlide`; a title that overhangs its card by a few px used to split into its own
 * beat, which is how "some cards animate and some don't" looked on live decks.
 */
export declare function animUnitOf(slot: string): string | undefined;
/**
 * Runs → one run list per line. The author's "\n" is a line break ("AI 如何重塑\n企业知识管理"),
 * and the gates measure it as one; but the renderer, like PowerPoint, breaks only between
 * paragraphs and draws a "\n" inside a run as a space — the cover then wrapped by width and left
 * "理" alone on line two (live run 2026-11-05). Each line becomes its own paragraph, same style.
 */
export declare function splitLines<R extends {
    text: string;
}>(runs: R[]): R[][];
export declare function emitPresentation(painted: PaintedSlide[], system: VisualSystem, theme: ColorTheme, title: string): Presentation;
