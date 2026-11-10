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
exports.mergeRepairFindings = mergeRepairFindings;
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
function mergeRepairFindings(visual, structural, pageCount, maxPages = exports.MAX_VISUAL_REPAIR_PAGES) {
    const cap = Math.max(0, maxPages);
    const visualPages = [...new Set(visual.map((f) => f.slideIdx))];
    const named = structural.filter((f) => f.slideIdx >= 0 && f.slideIdx < pageCount);
    if (!named.length)
        return visual.filter((f) => visualPages.slice(0, cap).includes(f.slideIdx));
    const gatePages = [...new Set(named.map((f) => f.slideIdx))];
    // Order: pages both channels name, then the reviewer's remaining pages (it read the pixels),
    // then pages only the gate names (a measured void the author can move something into).
    const pages = [];
    for (const p of [...visualPages.filter((p) => gatePages.includes(p)), ...visualPages, ...gatePages]) {
        if (pages.length >= cap)
            break;
        if (!pages.includes(p))
            pages.push(p);
    }
    const out = [];
    for (const page of pages) {
        // The reviewer's words steer the rewrite; the gate's coordinates tell the author where.
        for (const f of visual)
            if (f.slideIdx === page)
                out.push(f);
        for (const f of named)
            if (f.slideIdx === page)
                out.push({ ...f, issue: `geometry: ${f.issue}` });
    }
    return out;
}
/**
 * One visual round: render → review → re-author the worst pages → render and review again.
 * The second review is what the host reports, so the score describes the deck it is handed; it
 * runs only when the repair changed something and the budget still has `reserveAfter` calls left
 * for the steps after this round (copy rewrite). Every dependency is injected so the sequencing is
 * testable without a model or a browser.
 */
async function visualReviewRound(deps) {
    const log = deps.log ?? (() => { });
    let t = Date.now();
    const lap = () => {
        const s = ((Date.now() - t) / 1000).toFixed(0);
        t = Date.now();
        return `${s}s`;
    };
    const shots = await deps.capture();
    log(`captured ${shots.length} pages (${lap()})`);
    if (!shots.length || !deps.tryConsume())
        return undefined;
    const first = await deps.review(shots, false);
    const visual = mergeRepairFindings(visualRepairFindings(first, deps.pageCount()), deps.surviving?.() ?? [], deps.pageCount());
    log(`review: score ${first.score}, ${first.findings.length} findings, ${visual.length} to re-author${visual.some((f) => f.issue.startsWith("geometry:")) ? ` (incl. ${visual.filter((f) => f.issue.startsWith("geometry:")).length} geometry)` : ""} (${lap()})`);
    if (!visual.length)
        return { report: first, repairedPages: [] };
    if (deps.hasTimeFor && !deps.hasTimeFor("repair")) {
        log("no time left to re-author; reporting the review");
        return { report: first, repairedPages: [] };
    }
    if (!deps.tryConsume())
        return { report: first, repairedPages: [] };
    const repairedPages = [...new Set(visual.map((f) => f.slideIdx))];
    // Only the pages being rewritten: the model gets no context it cannot act on, and the request
    // stays small enough for a three-page repair to finish inside the round's wall clock.
    await deps.repair(visual, shots.filter((s) => repairedPages.includes(s.slideIdx)));
    log(`re-authored pages ${repairedPages.join(", ")} (${lap()})`);
    if (deps.remaining() <= (deps.reserveAfter ?? 1))
        return { report: first, repairedPages };
    if (deps.hasTimeFor && !deps.hasTimeFor("re-review")) {
        log("no time left to review the repaired deck");
        return { report: first, repairedPages };
    }
    // The repair is already in the deck; a re-review that fails or runs out of time only loses
    // the second score, not the work.
    try {
        const again = await deps.capture();
        if (!again.length || !deps.tryConsume())
            return { report: first, repairedPages };
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
    }
    catch (e) {
        if (deps.runAborted?.())
            throw e;
        log(`re-review dropped (${lap()}): ${e instanceof Error ? e.message : String(e)}`);
        return { report: first, repairedPages };
    }
}
