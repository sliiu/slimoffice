/**
 * Canvas-path completeness check. Invented jobs, radius, shadow, gradient,
 * and brand hex are allowed. Empty photo frames are not.
 *
 * With a Design Brief the check also asks the ppt-master question —
 * "you said these points are ordered: where is the geometry?" — so the
 * repair pass has a reason, not just a rule.
 */
import type { ColorTheme } from "./color-theme.js";
import { type VisualSystem } from "./visual-system.js";
import type { PaintedSlide } from "./apply-theme.js";
import type { ReflectResult } from "./reflect.js";
import { type PageBrief } from "./brief.js";
export declare function reflectCanvas(slides: PaintedSlide[], system: VisualSystem, theme: ColorTheme, briefs?: Array<PageBrief | undefined>): ReflectResult;
/** Running-copy blocks (≥ 8 units each) a page may carry before it stops being read. */
export declare const MAX_COPY_BLOCKS = 16;
/** Reading-load caps in CJK-equivalent characters (latin ≈ 0.58 each) for copy below h2. */
export declare const READING_CAP: {
    readonly dense: 320;
    readonly default: 260;
    readonly breathing: 210;
};
/** Below this share of the lower two-thirds, a dense page is underfilled. */
export declare const MIN_DENSE_FIELD_COVERAGE = 0.22;
