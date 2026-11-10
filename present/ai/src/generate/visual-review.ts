/**
 * Visual review → canvas repair. The structural gates (`reflect-canvas`, `layout-gates`) measure
 * geometry; a vision model looking at the rendered pages catches what geometry cannot (a page
 * that reads as two unrelated halves, a carrier that does not say the title, a dull grey grid).
 * Its high / medium layout findings become page-scoped repair instructions for the canvas author.
 */

import type { ReflectFinding } from "../deckgen/reflect.js";
import type { ArtDirectorFinding, ArtDirectorReport } from "./qa/art-director.js";

/** Categories a canvas re-author can act on; `imagery` / `color` / `other` are left to the report. */
const REPAIRABLE = new Set<ArtDirectorFinding["category"]>(["hierarchy", "density", "whitespace", "consistency", "typography"]);
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

/** Pages one visual repair pass may re-author: enough to fix the worst, few enough to stay page-scoped. */
export const MAX_VISUAL_REPAIR_PAGES = 3;

/**
 * High / medium findings in repairable categories, worst pages first, capped to
 * `maxPages` distinct pages. Each finding names its page so `repairScope` keeps the pass scoped.
 */
export function visualRepairFindings(
  report: Pick<ArtDirectorReport, "findings">,
  pageCount: number,
  maxPages = MAX_VISUAL_REPAIR_PAGES,
): ReflectFinding[] {
  const eligible = report.findings
    .filter((f) => f.severity !== "low" && REPAIRABLE.has(f.category) && f.slideIdx >= 0 && f.slideIdx < pageCount)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.slideIdx - b.slideIdx);
  const pages: number[] = [];
  for (const f of eligible) {
    if (!pages.includes(f.slideIdx) && pages.length < maxPages) pages.push(f.slideIdx);
  }
  return eligible
    .filter((f) => pages.includes(f.slideIdx))
    .map((f) => ({
      kind: "design" as const,
      slideIdx: f.slideIdx,
      issue: `visual review (${f.severity}, ${f.category}): ${f.issue} — ${f.suggestion}`,
      pages: [f.slideIdx],
    }));
}

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
export function mergeRepairFindings(
  visual: ReflectFinding[],
  structural: readonly ReflectFinding[],
  pageCount: number,
  maxPages = MAX_VISUAL_REPAIR_PAGES,
): ReflectFinding[] {
  const cap = Math.max(0, maxPages);
  const visualPages = [...new Set(visual.map((f) => f.slideIdx))];
  const named = structural.filter((f) => f.slideIdx >= 0 && f.slideIdx < pageCount);
  if (!named.length) return visual.filter((f) => visualPages.slice(0, cap).includes(f.slideIdx));
  const gatePages = [...new Set(named.map((f) => f.slideIdx))];
  // Order: pages both channels name, then the reviewer's remaining pages (it read the pixels),
  // then pages only the gate names (a measured void the author can move something into).
  const pages: number[] = [];
  for (const p of [...visualPages.filter((p) => gatePages.includes(p)), ...visualPages, ...gatePages]) {
    if (pages.length >= cap) break;
    if (!pages.includes(p)) pages.push(p);
  }
  const out: ReflectFinding[] = [];
  for (const page of pages) {
    // The reviewer's words steer the rewrite; the gate's coordinates tell the author where.
    for (const f of visual) if (f.slideIdx === page) out.push(f);
    for (const f of named) if (f.slideIdx === page) out.push({ ...f, issue: `geometry: ${f.issue}` });
  }
  return out;
}

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
export async function visualReviewRound<R extends Pick<ArtDirectorReport, "findings" | "score">>(deps: {
  pageCount: () => number;
  capture: () => Promise<Array<{ slideIdx: number; dataUrl: string }>>;
  review: (shots: Array<{ slideIdx: number; dataUrl: string }>, final: boolean) => Promise<R>;
  /**
   * Re-author the named pages. `shots` are the screenshots of exactly those pages: the reviewer
   * judged pixels, so the rewrite gets the same pixels instead of a sentence about them — the
   * round's re-authors were being scored lower than the deck they replaced because the model was
   * fixing an invisible page from prose alone.
   */
  repair: (findings: ReflectFinding[], shots: Array<{ slideIdx: number; dataUrl: string }>) => Promise<void>;
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
}): Promise<VisualRoundResult<R> | undefined> {
  const log = deps.log ?? (() => {});
  let t = Date.now();
  const lap = (): string => {
    const s = ((Date.now() - t) / 1000).toFixed(0);
    t = Date.now();
    return `${s}s`;
  };
  const shots = await deps.capture();
  log(`captured ${shots.length} pages (${lap()})`);
  if (!shots.length || !deps.tryConsume()) return undefined;
  const first = await deps.review(shots, false);
  const visual = mergeRepairFindings(
    visualRepairFindings(first, deps.pageCount()),
    deps.surviving?.() ?? [],
    deps.pageCount(),
  );
  log(
    `review: score ${first.score}, ${first.findings.length} findings, ${visual.length} to re-author${visual.some((f) => f.issue.startsWith("geometry:")) ? ` (incl. ${visual.filter((f) => f.issue.startsWith("geometry:")).length} geometry)` : ""} (${lap()})`,
  );
  if (!visual.length) return { report: first, repairedPages: [] };
  if (deps.hasTimeFor && !deps.hasTimeFor("repair")) {
    log("no time left to re-author; reporting the review");
    return { report: first, repairedPages: [] };
  }
  if (!deps.tryConsume()) return { report: first, repairedPages: [] };
  const repairedPages = [...new Set(visual.map((f) => f.slideIdx))];
  // Only the pages being rewritten: the model gets no context it cannot act on, and the request
  // stays small enough for a three-page repair to finish inside the round's wall clock.
  await deps.repair(visual, shots.filter((s) => repairedPages.includes(s.slideIdx)));
  log(`re-authored pages ${repairedPages.join(", ")} (${lap()})`);
  if (deps.remaining() <= (deps.reserveAfter ?? 1)) return { report: first, repairedPages };
  if (deps.hasTimeFor && !deps.hasTimeFor("re-review")) {
    log("no time left to review the repaired deck");
    return { report: first, repairedPages };
  }
  // The repair is already in the deck; a re-review that fails or runs out of time only loses
  // the second score, not the work.
  try {
    const again = await deps.capture();
    if (!again.length || !deps.tryConsume()) return { report: first, repairedPages };
    const final = await deps.review(again, true);
    log(`re-review: score ${final.score} (${lap()})`);
    if (deps.revert && final.score < first.score) {
      // The re-author made the deck read worse to the same reviewer: ship the first version and
      // the report that describes it. A tie keeps the repair — it fixed what was named.
      deps.revert();
      log(`score fell ${first.score} → ${final.score}; re-authored pages reverted`);
      return { report: first, repairedPages: [], revertedPages: repairedPages };
    }
    return { report: final, repairedPages, scoreBefore: first.score };
  } catch (e) {
    if (deps.runAborted?.()) throw e;
    log(`re-review dropped (${lap()}): ${e instanceof Error ? e.message : String(e)}`);
    return { report: first, repairedPages };
  }
}
