/**
 * Pick the locked skeleton, fill slots, truncate to caps.
 * Font size is taken from VisualSystem type scale and never reduced to fit.
 * Composition uses the system grid (columns + gutter) and color-field / hairline
 * vocabulary — not a title dumped in the 5% margin.
 */
import { type VisualSystem } from "./visual-system.js";
import type { SlidePlan } from "./page-plan.js";
import type { FilledSlide } from "./ir.js";
export declare function fillSlide(plan: SlidePlan, system: VisualSystem): FilledSlide;
export declare function fillPlans(plans: SlidePlan[], system: VisualSystem): FilledSlide[];
