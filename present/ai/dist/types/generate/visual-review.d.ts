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
/**
 * Merge the geometric findings that survived the structural repair pass into the visual set.
 *
 * The two channels were disconnected: the structural pass re-authored the pages `reflect-canvas`
 * named, then the visual round picked its own ≤ 3 pages from the review report — so a page the
 * geometry gate kept failing (a table floating above a third of blank paper) could stay out of
 * every repair in the run. A page named by both channels goes first: the reviewer says what is
 * wrong with the pixels, the gate says exactly where, and one re-author is handed both.
 *
 * Pages only the gate names still get a slot when the visual set is small: the gate's finding is
 * the more actionable of the two (it carries coordinates), and a page with a measured void is
 * worse than a page whose only objection is a matter of taste.
 */
export declare function mergeRepairFindings(visual: ReflectFinding[], structural: readonly ReflectFinding[], pageCount: number, maxPages?: number): ReflectFinding[];
/** What one visual round produced: the report the host sees, plus what changed. */
export interface VisualRoundResult<R extends Pick<ArtDirectorReport, "findings" | "score">> {
    /** The latest report — after the repair when a re-review ran, else the first one. */
    report: R;
    /** Pages re-authored from the first report's findings. */
    repairedPages: number[];
    /** Score of the first report when a re-review replaced it. */
    scoreBefore?: number;
    /** Pages whose re-author was undone because the re-review scored the deck lower. */
    revertedPages?: number[];
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
    /**
     * Re-author the named pages. `shots` are the screenshots of exactly those pages: the reviewer
     * judged pixels, so the rewrite gets the same pixels instead of a sentence about them — the
     * round's re-authors were being scored lower than the deck they replaced because the model was
     * fixing an invisible page from prose alone.
     */
    repair: (findings: ReflectFinding[], shots: Array<{
        slideIdx: number;
        dataUrl: string;
    }>) => Promise<void>;
    /** Undo the repair (restore the deck as it was reviewed first). Without it a lower score is kept. */
    revert?: () => void;
    /** Take one model call from the budget; false = none left. */
    tryConsume: () => boolean;
    remaining: () => number;
    /** Calls to leave for the steps after this round. */
    reserveAfter?: number;
    /** Is there time for the next step? Checked before the repair and before the re-review. */
    hasTimeFor?: (step: "repair" | "re-review") => boolean;
    /**
     * Geometric findings that survived the structural pass. Merged into the visual set so a page the
     * gate keeps failing is not skipped just because the reviewer chose other pages this round.
     */
    surviving?: () => readonly ReflectFinding[];
    /** Did the run itself stop (cancel / wall clock)? Then a failed re-review is rethrown. */
    runAborted?: () => boolean;
    log?: (msg: string) => void;
}): Promise<VisualRoundResult<R> | undefined>;
