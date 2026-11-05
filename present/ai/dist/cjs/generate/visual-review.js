"use strict";
/**
 * Visual review → canvas repair. The structural gates (`reflect-canvas`, `layout-gates`) measure
 * geometry; a vision model looking at the rendered pages catches what geometry cannot (a page
 * that reads as two unrelated halves, a carrier that does not say the title, a dull grey grid).
 * Its high / medium layout findings become page-scoped repair instructions for the canvas author.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_VISUAL_REPAIR_PAGES = void 0;
exports.visualRepairFindings = visualRepairFindings;
exports.visualReviewRound = visualReviewRound;
/** Categories a canvas re-author can act on; `imagery` / `color` / `other` are left to the report. */
const REPAIRABLE = new Set(["hierarchy", "density", "whitespace", "consistency", "typography"]);
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };
/** Pages one visual repair pass may re-author: enough to fix the worst, few enough to stay page-scoped. */
exports.MAX_VISUAL_REPAIR_PAGES = 3;
/**
 * High / medium findings in repairable categories, worst pages first, capped to
 * `maxPages` distinct pages. Each finding names its page so `repairScope` keeps the pass scoped.
 */
function visualRepairFindings(report, pageCount, maxPages = exports.MAX_VISUAL_REPAIR_PAGES) {
    const eligible = report.findings
        .filter((f) => f.severity !== "low" && REPAIRABLE.has(f.category) && f.slideIdx >= 0 && f.slideIdx < pageCount)
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.slideIdx - b.slideIdx);
    const pages = [];
    for (const f of eligible) {
        if (!pages.includes(f.slideIdx) && pages.length < maxPages)
            pages.push(f.slideIdx);
    }
    return eligible
        .filter((f) => pages.includes(f.slideIdx))
        .map((f) => ({
        kind: "design",
        slideIdx: f.slideIdx,
        issue: `visual review (${f.severity}, ${f.category}): ${f.issue} — ${f.suggestion}`,
        pages: [f.slideIdx],
    }));
}
/**
 * One visual round: render → review → re-author the worst pages → render and review again.
 * The second review is what the host reports, so the score describes the deck it is handed; it
 * runs only when the repair changed something and the budget still has `reserveAfter` calls left
 * for the steps after this round (copy rewrite). Every dependency is injected so the sequencing is
 * testable without a model or a browser.
 */
async function visualReviewRound(deps) {
    const shots = await deps.capture();
    if (!shots.length || !deps.tryConsume())
        return undefined;
    const first = await deps.review(shots, false);
    const visual = visualRepairFindings(first, deps.pageCount());
    if (!visual.length || !deps.tryConsume())
        return { report: first, repairedPages: [] };
    await deps.repair(visual);
    const repairedPages = [...new Set(visual.map((f) => f.slideIdx))];
    if (deps.remaining() <= (deps.reserveAfter ?? 1))
        return { report: first, repairedPages };
    const again = await deps.capture();
    if (!again.length || !deps.tryConsume())
        return { report: first, repairedPages };
    const final = await deps.review(again, true);
    return { report: final, repairedPages, scoreBefore: first.score };
}
