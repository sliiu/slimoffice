/**
 * Geometric layout gates: what a reviewer sees on the rendered page but the structural
 * gates in `reflect-canvas` do not measure.
 *
 *   - dead space: a large empty rectangle inside the content frame (half a page under a row of steps)
 *   - split column: a title and its copy in one column with a void between them
 *   - stranded title: a heading that wraps with one or two characters alone on the last line
 *   - repeated data: the same numbers as KPI tiles / table cells and again as a chart
 *
 * Text boxes are top-anchored and the model oversizes them freely (a 28px title in a 250px box),
 * so every check works on the *ink* box — the lines the text actually wraps to — not the bbox.
 * The wrap estimate matches the renderer within a glyph for CJK (≈ 0.98 em after h1 tracking) and
 * the default text insets (9.6px left and right).
 */
import type { PaintedEl, PaintedSlide } from "./apply-theme.js";
import type { ReflectFinding } from "./reflect.js";
import type { PageBrief } from "./brief.js";
import { type VisualSystem } from "./visual-system.js";
type Box = {
    x: number;
    y: number;
    w: number;
    h: number;
};
/** Empty rectangle that counts as dead space: share of the content frame, and minimum sides. */
export declare const DEAD_SPACE: {
    readonly area: 0.2;
    readonly w: 0.35;
    readonly h: 0.24;
};
/** A void this tall between two stacked text blocks in one column splits the column. */
export declare const COLUMN_GAP_PX = 140;
/**
 * Greedy wrap at `maxW`: CJK breaks per character, latin per word. Returns the lines' widths and
 * text so callers can read both how tall the block is and what sits on its last line.
 */
export declare function wrapText(text: string, fontSize: number, maxW: number): Array<{
    text: string;
    w: number;
}>;
/** The part of a text box the type actually covers (top-anchored, aligned within the box). */
export declare function inkBox(e: PaintedEl, sys: VisualSystem): Box;
/** Largest empty axis-aligned rectangle inside `frame`, given occupied boxes (histogram method on a 16px grid). */
export declare function largestEmptyRect(frame: Box, boxes: Box[]): Box;
/** Layout findings for every page; at most one finding per check per page. */
export declare function layoutFindings(slides: PaintedSlide[], sys: VisualSystem, briefs?: Array<PageBrief | undefined>): ReflectFinding[];
export {};
