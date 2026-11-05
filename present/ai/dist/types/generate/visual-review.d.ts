/**
 * Visual review → canvas repair. The structural gates (`reflect-canvas`, `layout-gates`) measure
 * geometry; a vision model looking at the rendered pages catches what geometry cannot (a page
 * that reads as two unrelated halves, a carrier that does not say the title, a dull grey grid).
 * Its high / medium layout findings become page-scoped repair instructions for the canvas author.
 */
import type { ReflectFinding } from "../deckgen/reflect.js";
import type { ArtDirectorReport } from "./qa/art-director.js";
/** Pages one visual repair pass may re-author: enough to fix the worst, few enough to stay page-scoped. */
export declare const MAX_VISUAL_REPAIR_PAGES = 3;
/**
 * High / medium findings in repairable categories, worst pages first, capped to
 * `maxPages` distinct pages. Each finding names its page so `repairScope` keeps the pass scoped.
 */
export declare function visualRepairFindings(report: Pick<ArtDirectorReport, "findings">, pageCount: number, maxPages?: number): ReflectFinding[];
/** What one visual round produced: the report the host sees, plus what changed. */
export interface VisualRoundResult<R extends Pick<ArtDirectorReport, "findings" | "score">> {
    /** The latest report — after the repair when a re-review ran, else the first one. */
    report: R;
    /** Pages re-authored from the first report's findings. */
    repairedPages: number[];
    /** Score of the first report when a re-review replaced it. */
    scoreBefore?: number;
}
/**
 * One visual round: render → review → re-author the worst pages → render and review again.
 * The second review is what the host reports, so the score describes the deck it is handed; it
 * runs only when the repair changed something and the budget still has `reserveAfter` calls left
 * for the steps after this round (copy rewrite). Every dependency is injected so the sequencing is
 * testable without a model or a browser.
 */
export declare function visualReviewRound<R extends Pick<ArtDirectorReport, "findings" | "score">>(deps: {
    pageCount: () => number;
    capture: () => Promise<Array<{
        slideIdx: number;
        dataUrl: string;
    }>>;
    review: (shots: Array<{
        slideIdx: number;
        dataUrl: string;
    }>, final: boolean) => Promise<R>;
    repair: (findings: ReflectFinding[]) => Promise<void>;
    /** Take one model call from the budget; false = none left. */
    tryConsume: () => boolean;
    remaining: () => number;
    /** Calls to leave for the steps after this round. */
    reserveAfter?: number;
}): Promise<VisualRoundResult<R> | undefined>;
