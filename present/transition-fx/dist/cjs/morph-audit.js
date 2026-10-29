"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.morphCandidateFromShape = morphCandidateFromShape;
exports.collectMorphCandidatesFromSlide = collectMorphCandidatesFromSlide;
exports.auditMorphSlides = auditMorphSlides;
exports.formatMorphReadinessSummary = formatMorphReadinessSummary;
exports.morphReadinessPercent = morphReadinessPercent;
exports.summarizeMorphMatchReasons = summarizeMorphMatchReasons;
exports.formatMorphMatchReasonBreakdown = formatMorphMatchReasonBreakdown;
exports.morphIssueCount = morphIssueCount;
exports.averageMorphReadinessPercent = averageMorphReadinessPercent;
exports.findWeakestMorphPair = findWeakestMorphPair;
exports.findStrongestMorphPair = findStrongestMorphPair;
exports.formatMorphReadinessScoreLine = formatMorphReadinessScoreLine;
exports.pathMorphCoveragePercent = pathMorphCoveragePercent;
exports.countMorphDeckIssues = countMorphDeckIssues;
exports.morphPairsWithIssues = morphPairsWithIssues;
exports.averagePathMorphCoveragePercent = averagePathMorphCoveragePercent;
exports.findMostIssueMorphPair = findMostIssueMorphPair;
exports.findHighestPathCoverageMorphPair = findHighestPathCoverageMorphPair;
exports.formatMorphReadinessLine = formatMorphReadinessLine;
exports.exportMorphReadinessText = exportMorphReadinessText;
exports.formatMorphDeckReadinessLine = formatMorphDeckReadinessLine;
exports.formatMorphDeckChromeLines = formatMorphDeckChromeLines;
exports.exportMorphDeckReadinessText = exportMorphDeckReadinessText;
exports.countMorphPairsClean = countMorphPairsClean;
exports.countMorphPairsWithIssues = countMorphPairsWithIssues;
exports.averageMorphIssuesPerPair = averageMorphIssuesPerPair;
exports.findFirstIssueMorphPair = findFirstIssueMorphPair;
exports.findLowestPathCoverageMorphPair = findLowestPathCoverageMorphPair;
exports.formatMorphPairCoverageBreakdownLine = formatMorphPairCoverageBreakdownLine;
exports.formatMorphLowestPathLine = formatMorphLowestPathLine;
exports.collectUnmatchedMorphShapesInDeck = collectUnmatchedMorphShapesInDeck;
exports.exportMorphUnmatchedShapesText = exportMorphUnmatchedShapesText;
exports.exportMorphPairCoverageText = exportMorphPairCoverageText;
exports.filterMorphDeckEntries = filterMorphDeckEntries;
exports.exportMorphDeckFilteredCompactText = exportMorphDeckFilteredCompactText;
exports.formatMorphDeckStatsLine = formatMorphDeckStatsLine;
exports.exportMorphPairCompactText = exportMorphPairCompactText;
exports.exportMorphDeckIssuesCompactText = exportMorphDeckIssuesCompactText;
exports.auditMorphDeck = auditMorphDeck;
exports.exportMorphDeckAuditText = exportMorphDeckAuditText;
exports.exportMorphDeckCompactText = exportMorphDeckCompactText;
exports.exportMorphIssuesCompactText = exportMorphIssuesCompactText;
exports.exportMorphAuditText = exportMorphAuditText;
const morph_path_1 = require("./morph-path");
const morph_match_1 = require("./morph-match");
function morphTagForShape(shape) {
    if (shape.kind === "group")
        return "g";
    if (shape.kind === "image" || shape.kind === "video")
        return "image";
    if (shape.kind === "text")
        return "text";
    if (shape.kind === "line")
        return "line";
    return shape.kind;
}
function pathDForShape(shape) {
    if (shape.kind === "path")
        return shape.d;
    if (shape.kind === "polygon") {
        const flat = shape.points.flatMap(([x, y]) => [x, y]);
        return (0, morph_path_1.polygonPointsToPath)(flat.join(" "), true);
    }
    if (shape.kind === "line") {
        return (0, morph_path_1.linePathFromPoints)(shape.x1, shape.y1, shape.x2, shape.y2);
    }
    const { w, h } = shape.bbox;
    if (shape.kind === "rect" || shape.kind === "group")
        return (0, morph_path_1.rectPathFromSize)(w, h);
    if (shape.kind === "ellipse")
        return (0, morph_path_1.ellipsePathFromSize)(w, h);
    return undefined;
}
/** Build a morph candidate from an in-memory shape (slide coordinates). */
function morphCandidateFromShape(shape) {
    if (shape.visible === false)
        return null;
    if (shape.id.startsWith("dec_"))
        return null;
    const { x, y, w, h } = shape.bbox;
    if (w < 1 && h < 1)
        return null;
    return {
        id: shape.id,
        name: shape.name ?? shape.id,
        tag: morphTagForShape(shape),
        rect: { left: x, top: y, width: w, height: h },
        pathD: pathDForShape(shape),
        placeholderType: shape.placeholder?.type,
    };
}
/** Collect morph candidates from all visible layers on a slide (top-level shapes, as the player matches them). */
function collectMorphCandidatesFromSlide(slide) {
    const out = [];
    for (const layer of slide.layers) {
        if (layer.visible === false)
            continue;
        for (const shape of layer.shapes) {
            const c = morphCandidateFromShape(shape);
            if (c)
                out.push(c);
        }
    }
    return out;
}
/** Analyze morph readiness between two slides (current → next). */
function auditMorphSlides(fromSlide, toSlide) {
    const ghost = collectMorphCandidatesFromSlide(fromSlide);
    const stage = collectMorphCandidatesFromSlide(toSlide);
    const pairs = (0, morph_match_1.matchMorphShapePairs)(ghost, stage);
    const matchedGhost = new Set(pairs.map((p) => p.ghost.id));
    const matchedStage = new Set(pairs.map((p) => p.stage.id));
    const detailed = pairs.map((p) => {
        const pathMorph = !!p.ghost.pathD && !!p.stage.pathD && (0, morph_path_1.morphPathCompatible)(p.ghost.pathD, p.stage.pathD);
        return { ...p, pathMorph };
    });
    return {
        ghostCount: ghost.length,
        stageCount: stage.length,
        matched: pairs.length,
        pathMorphCount: detailed.filter((p) => p.pathMorph).length,
        flipOnlyCount: detailed.filter((p) => !p.pathMorph).length,
        unmatchedStage: stage.filter((s) => !matchedStage.has(s.id)),
        unmatchedGhost: ghost.filter((g) => !matchedGhost.has(g.id)),
        pairs: detailed,
    };
}
function formatMorphReadinessSummary(report) {
    if (report.stageCount === 0 && report.ghostCount === 0) {
        return "No shapes on either slide.";
    }
    const parts = [`${report.matched}/${report.stageCount} matched`];
    if (report.pathMorphCount > 0)
        parts.push(`${report.pathMorphCount} path`);
    if (report.flipOnlyCount > 0)
        parts.push(`${report.flipOnlyCount} FLIP`);
    const unmatched = report.unmatchedStage.length + report.unmatchedGhost.length;
    if (unmatched > 0)
        parts.push(`${unmatched} unmatched`);
    return parts.join(" · ");
}
/** 0–100 morph readiness score for the slide pair. */
function morphReadinessPercent(report) {
    if (report.stageCount === 0 && report.ghostCount === 0)
        return 100;
    if (report.stageCount === 0)
        return 0;
    const matchRate = report.matched / report.stageCount;
    const pathRate = report.matched > 0 ? report.pathMorphCount / report.matched : 0;
    const totalShapes = report.stageCount + report.ghostCount;
    const unmatched = report.unmatchedStage.length + report.unmatchedGhost.length;
    const unmatchedPenalty = totalShapes > 0 ? unmatched / totalShapes : 0;
    const raw = matchRate * 0.55 + pathRate * 0.35 + (1 - unmatchedPenalty) * 0.1;
    return Math.round(Math.max(0, Math.min(100, raw * 100)));
}
/** Count matched pairs by match reason (id / name / placeholder / geometry). */
function summarizeMorphMatchReasons(report) {
    const out = {};
    for (const pair of report.pairs) {
        const reason = (0, morph_match_1.morphMatchReason)(pair.ghost, pair.stage);
        out[reason] = (out[reason] ?? 0) + 1;
    }
    return out;
}
function formatMorphMatchReasonBreakdown(report) {
    const kinds = summarizeMorphMatchReasons(report);
    const parts = Object.entries(kinds).map(([kind, count]) => `${kind}×${count}`);
    return parts.length ? parts.join(", ") : "no matches";
}
/** Unmatched shapes + FLIP-only pairs (actionable morph issues). */
function morphIssueCount(report) {
    return report.unmatchedStage.length + report.unmatchedGhost.length + report.flipOnlyCount;
}
function averageMorphReadinessPercent(entries) {
    if (!entries.length)
        return 100;
    const total = entries.reduce((sum, entry) => sum + morphReadinessPercent(entry.report), 0);
    return Math.round(total / entries.length);
}
function findWeakestMorphPair(entries) {
    if (!entries.length)
        return null;
    return entries.reduce((best, entry) => morphReadinessPercent(entry.report) < morphReadinessPercent(best.report) ? entry : best);
}
function findStrongestMorphPair(entries) {
    if (!entries.length)
        return null;
    return entries.reduce((best, entry) => morphReadinessPercent(entry.report) > morphReadinessPercent(best.report) ? entry : best);
}
function formatMorphReadinessScoreLine(report) {
    const score = morphReadinessPercent(report);
    return `Morph readiness: ${score}% · ${formatMorphReadinessSummary(report)}`;
}
/** Percent of matched pairs that use path morph (0–100). */
function pathMorphCoveragePercent(report) {
    if (report.matched <= 0)
        return 0;
    return Math.round((report.pathMorphCount / report.matched) * 100);
}
function countMorphDeckIssues(entries) {
    return entries.reduce((sum, entry) => sum + morphIssueCount(entry.report), 0);
}
function morphPairsWithIssues(entries) {
    return entries.filter((entry) => morphIssueCount(entry.report) > 0);
}
/** Average path-morph coverage across adjacent slide pairs (0–100). */
function averagePathMorphCoveragePercent(entries) {
    if (!entries.length)
        return 0;
    const total = entries.reduce((sum, entry) => sum + pathMorphCoveragePercent(entry.report), 0);
    return Math.round(total / entries.length);
}
/** Slide pair with the most morph issues (ties → lowest from index). */
function findMostIssueMorphPair(entries) {
    if (!entries.length)
        return null;
    return entries.reduce((best, entry) => {
        const issues = morphIssueCount(entry.report);
        const bestIssues = morphIssueCount(best.report);
        if (issues > bestIssues)
            return entry;
        if (issues === bestIssues && issues > 0 && entry.fromIndex < best.fromIndex)
            return entry;
        return best;
    });
}
/** Slide pair with the highest path-morph coverage (ties → lowest from index). */
function findHighestPathCoverageMorphPair(entries) {
    if (!entries.length)
        return null;
    return entries.reduce((best, entry) => {
        const cov = pathMorphCoveragePercent(entry.report);
        const bestCov = pathMorphCoveragePercent(best.report);
        if (cov > bestCov)
            return entry;
        if (cov === bestCov && cov > 0 && entry.fromIndex < best.fromIndex)
            return entry;
        return best;
    });
}
/** One-line morph readiness for chips and compact copy. */
function formatMorphReadinessLine(report) {
    const parts = [`Morph ${morphReadinessPercent(report)}%`, formatMorphReadinessSummary(report)];
    if (report.matched > 0)
        parts.push(`path ${pathMorphCoveragePercent(report)}%`);
    const issues = morphIssueCount(report);
    if (issues)
        parts.push(`${issues} issue(s)`);
    return parts.join(" · ");
}
/** Labeled readiness export for a single slide pair. */
function exportMorphReadinessText(report, opts = {}) {
    const head = opts.fromSlide != null && opts.toSlide != null
        ? `Morph readiness — slide ${opts.fromSlide + 1} → ${opts.toSlide + 1}`
        : "Morph readiness";
    return [head, formatMorphReadinessLine(report), formatMorphReadinessScoreLine(report)].join("\n");
}
function deckStatsLineFromEntries(entries) {
    if (!entries.length)
        return "No morph pairs (need 2+ slides)";
    const parts = [
        `${entries.length} pair(s)`,
        `avg ${averageMorphReadinessPercent(entries)}%`,
    ];
    const issuePairs = morphPairsWithIssues(entries).length;
    if (issuePairs)
        parts.push(`${issuePairs} with issues`);
    const totalIssues = countMorphDeckIssues(entries);
    if (totalIssues)
        parts.push(`${totalIssues} issue(s)`);
    const weakest = findWeakestMorphPair(entries);
    if (weakest)
        parts.push(`weakest ${weakest.fromIndex + 1}→${weakest.toIndex + 1}`);
    return parts.join(" · ");
}
function deckReadinessLineFromEntries(entries) {
    if (!entries.length)
        return "Morph: need 2+ slides";
    const parts = [deckStatsLineFromEntries(entries), `path avg ${averagePathMorphCoveragePercent(entries)}%`];
    const clean = entries.filter((e) => morphIssueCount(e.report) === 0).length;
    if (clean)
        parts.push(`${clean} clean pair(s)`);
    return parts.join(" · ");
}
/** One-line deck morph readiness (stats + average path coverage). */
function formatMorphDeckReadinessLine(pres) {
    return deckReadinessLineFromEntries(auditMorphDeck(pres));
}
/** Deck morph lines for the developer panel. Audits the deck once. */
function formatMorphDeckChromeLines(pres) {
    const entries = auditMorphDeck(pres);
    return {
        stats: deckStatsLineFromEntries(entries),
        readiness: deckReadinessLineFromEntries(entries),
        pairCoverage: pairCoverageBreakdownFromEntries(entries),
        lowestPath: lowestPathLineFromEntries(entries),
    };
}
/** Labeled deck readiness export for copy. */
function exportMorphDeckReadinessText(pres) {
    return [
        "Morph deck readiness",
        formatMorphDeckReadinessLine(pres),
        formatMorphPairCoverageBreakdownLine(pres),
        "",
        exportMorphDeckCompactText(pres),
    ].join("\n");
}
/** Count of adjacent slide pairs with zero morph issues. */
function countMorphPairsClean(entries) {
    return entries.filter((entry) => morphIssueCount(entry.report) === 0).length;
}
/** Count of adjacent slide pairs with at least one morph issue. */
function countMorphPairsWithIssues(entries) {
    return morphPairsWithIssues(entries).length;
}
/** Average morph issues per adjacent slide pair (0 if no pairs). */
function averageMorphIssuesPerPair(entries) {
    if (!entries.length)
        return 0;
    const total = countMorphDeckIssues(entries);
    return Math.round((total / entries.length) * 10) / 10;
}
/** First slide pair (lowest from index) with morph issues. */
function findFirstIssueMorphPair(entries) {
    for (const entry of entries) {
        if (morphIssueCount(entry.report) > 0)
            return entry;
    }
    return null;
}
/** Slide pair with the lowest path-morph coverage among pairs with matches (ties → lowest from index). */
function findLowestPathCoverageMorphPair(entries) {
    let best = null;
    for (const entry of entries) {
        if (entry.report.matched <= 0)
            continue;
        const cov = pathMorphCoveragePercent(entry.report);
        if (!best ||
            cov < pathMorphCoveragePercent(best.report) ||
            (cov === pathMorphCoveragePercent(best.report) && entry.fromIndex < best.fromIndex)) {
            best = entry;
        }
    }
    return best;
}
function pairCoverageBreakdownFromEntries(entries) {
    if (!entries.length)
        return "No morph pairs";
    const clean = countMorphPairsClean(entries);
    const withIssues = countMorphPairsWithIssues(entries);
    const parts = [`${clean} clean`, `${withIssues} with issues`];
    const avgIssues = averageMorphIssuesPerPair(entries);
    if (avgIssues > 0)
        parts.push(`avg ${avgIssues} issue(s)/pair`);
    return parts.join(" · ");
}
/** One-line pair coverage breakdown (clean / issues / avg issues). */
function formatMorphPairCoverageBreakdownLine(pres) {
    return pairCoverageBreakdownFromEntries(auditMorphDeck(pres));
}
function lowestPathLineFromEntries(entries) {
    const entry = findLowestPathCoverageMorphPair(entries);
    if (!entry)
        return "Lowest path: none";
    return `Lowest path: slide ${entry.fromIndex + 1}→${entry.toIndex + 1} · ${pathMorphCoveragePercent(entry.report)}%`;
}
/** One-line lowest path-coverage pair summary. */
function formatMorphLowestPathLine(pres) {
    return lowestPathLineFromEntries(auditMorphDeck(pres));
}
/** Unmatched morph shapes across all adjacent slide pairs. */
function collectUnmatchedMorphShapesInDeck(pres) {
    const out = [];
    for (const entry of auditMorphDeck(pres)) {
        for (const shape of entry.report.unmatchedStage) {
            out.push({
                slideIndex: entry.toIndex,
                direction: "incoming",
                pairFromIndex: entry.fromIndex,
                id: shape.id,
                name: shape.name || shape.id,
            });
        }
        for (const shape of entry.report.unmatchedGhost) {
            out.push({
                slideIndex: entry.fromIndex,
                direction: "outgoing",
                pairFromIndex: entry.fromIndex,
                id: shape.id,
                name: shape.name || shape.id,
            });
        }
    }
    return out;
}
/** Plain-text report of unmatched morph shapes in the deck. */
function exportMorphUnmatchedShapesText(pres) {
    const refs = collectUnmatchedMorphShapesInDeck(pres);
    const lines = ["Morph unmatched shapes", `Count: ${refs.length}`];
    if (!refs.length) {
        lines.push("All morph candidates are matched across slide pairs.");
        return lines.join("\n");
    }
    lines.push("");
    for (const ref of refs) {
        lines.push(`- Slide ${ref.slideIndex + 1} (${ref.direction}, pair ${ref.pairFromIndex + 1}→${ref.pairFromIndex + 2}): ${ref.name} (${ref.id})`);
    }
    return lines.join("\n");
}
/** Labeled pair-coverage export for copy. */
function exportMorphPairCoverageText(pres) {
    return [
        "Morph pair coverage",
        formatMorphPairCoverageBreakdownLine(pres),
        `path avg ${averagePathMorphCoveragePercent(auditMorphDeck(pres))}%`,
        formatMorphLowestPathLine(pres),
    ].join("\n");
}
function filterMorphDeckEntries(entries, filter = "all") {
    if (filter === "all")
        return [...entries];
    if (filter === "issues")
        return morphPairsWithIssues(entries);
    if (filter === "path")
        return entries.filter((e) => e.report.pathMorphCount > 0);
    return entries.filter((e) => morphIssueCount(e.report) === 0);
}
/** Compact deck pair list filtered by issues / path / clean. */
function exportMorphDeckFilteredCompactText(pres, filter = "all") {
    const entries = filterMorphDeckEntries(auditMorphDeck(pres), filter);
    if (!entries.length)
        return `Morph deck (${filter}): none`;
    const labels = entries.map((e) => `${e.fromIndex + 1}→${e.toIndex + 1}@${morphReadinessPercent(e.report)}%`);
    return `Morph deck (${filter}, ${entries.length}): ${labels.join(", ")}`;
}
/** One-line deck morph stats for chips and compact copy. */
function formatMorphDeckStatsLine(pres) {
    return deckStatsLineFromEntries(auditMorphDeck(pres));
}
/** Compact single-pair morph summary (one-liners). */
function exportMorphPairCompactText(report, opts = {}) {
    const parts = ["Morph pair (compact)"];
    if (opts.fromSlide != null && opts.toSlide != null) {
        parts.push(`slide ${opts.fromSlide + 1}→${opts.toSlide + 1}`);
    }
    parts.push(`${morphReadinessPercent(report)}%`);
    parts.push(formatMorphReadinessSummary(report));
    if (report.matched > 0)
        parts.push(`path coverage ${pathMorphCoveragePercent(report)}%`);
    if (report.pairs.length)
        parts.push(formatMorphMatchReasonBreakdown(report));
    parts.push(`${morphIssueCount(report)} issue(s)`);
    return parts.join(" · ");
}
/** Comma-separated deck pairs that have morph issues. */
function exportMorphDeckIssuesCompactText(pres) {
    const entries = morphPairsWithIssues(auditMorphDeck(pres));
    if (!entries.length)
        return "Morph deck issues: none";
    const labels = entries.map((entry) => `${entry.fromIndex + 1}→${entry.toIndex + 1}@${morphReadinessPercent(entry.report)}%(${morphIssueCount(entry.report)})`);
    return `Morph deck issues (${entries.length}): ${labels.join(", ")}`;
}
/** Audit morph readiness for every adjacent slide pair in a deck. */
function auditMorphDeck(pres) {
    const out = [];
    for (let i = 0; i < pres.slides.length - 1; i++) {
        out.push({
            fromIndex: i,
            toIndex: i + 1,
            report: auditMorphSlides(pres.slides[i], pres.slides[i + 1]),
        });
    }
    return out;
}
/** Plain-text morph audit across the whole deck. */
function exportMorphDeckAuditText(pres) {
    const entries = auditMorphDeck(pres);
    const lines = ["Morph deck audit", `Slide pairs: ${entries.length}`, ""];
    if (!entries.length) {
        lines.push("Need at least two slides.");
        return lines.join("\n");
    }
    let totalScore = 0;
    for (const entry of entries) {
        totalScore += morphReadinessPercent(entry.report);
        lines.push(`Slide ${entry.fromIndex + 1} → ${entry.toIndex + 1}`);
        lines.push(formatMorphReadinessScoreLine(entry.report));
        lines.push("");
    }
    const avg = Math.round(totalScore / entries.length);
    lines.push(`Average readiness: ${avg}%`);
    return lines.join("\n").trimEnd();
}
/** Compact deck-wide morph summary for copy / support. */
function exportMorphDeckCompactText(pres) {
    const entries = auditMorphDeck(pres);
    const lines = ["Morph deck summary (compact)", `Pairs: ${entries.length}`];
    if (!entries.length) {
        lines.push("Need at least two slides.");
        return lines.join("\n");
    }
    lines.push(`Average readiness: ${averageMorphReadinessPercent(entries)}%`);
    const weakest = findWeakestMorphPair(entries);
    const strongest = findStrongestMorphPair(entries);
    if (weakest) {
        lines.push(`Weakest: slide ${weakest.fromIndex + 1}→${weakest.toIndex + 1} (${morphReadinessPercent(weakest.report)}%)`);
    }
    if (strongest && strongest !== weakest) {
        lines.push(`Strongest: slide ${strongest.fromIndex + 1}→${strongest.toIndex + 1} (${morphReadinessPercent(strongest.report)}%)`);
    }
    lines.push("");
    for (const entry of entries) {
        lines.push(`- ${entry.fromIndex + 1}→${entry.toIndex + 1}: ${formatMorphReadinessScoreLine(entry.report)}`);
    }
    return lines.join("\n");
}
/** Short issues-only export (unmatched + FLIP-only pairs). */
function exportMorphIssuesCompactText(report, opts = {}) {
    const head = opts.fromSlide != null && opts.toSlide != null
        ? `Morph issues — slide ${opts.fromSlide + 1} → ${opts.toSlide + 1}`
        : "Morph issues";
    const lines = [head, `Issues: ${morphIssueCount(report)}`, ""];
    if (report.flipOnlyCount > 0) {
        lines.push(`FLIP-only pairs (${report.flipOnlyCount}):`);
        for (const pair of report.pairs.filter((p) => !p.pathMorph)) {
            lines.push(`- ${pair.stage.name || pair.stage.id}`);
        }
        lines.push("");
    }
    if (report.unmatchedStage.length) {
        lines.push("Incoming only:");
        for (const shape of report.unmatchedStage)
            lines.push(`- ${shape.name || shape.id}`);
        lines.push("");
    }
    if (report.unmatchedGhost.length) {
        lines.push("Outgoing only:");
        for (const shape of report.unmatchedGhost)
            lines.push(`- ${shape.name || shape.id}`);
        lines.push("");
    }
    if (morphIssueCount(report) === 0)
        lines.push("No morph issues.");
    return lines.join("\n").trimEnd();
}
function shouldIncludePair(pair, filter) {
    if (filter === "all")
        return true;
    if (filter === "path")
        return pair.pathMorph;
    if (filter === "flip" || filter === "issues")
        return !pair.pathMorph;
    return true;
}
/** Plain-text morph audit for copy / export. */
function exportMorphAuditText(report, opts = {}) {
    const filter = opts.filter ?? "all";
    const head = opts.fromSlide != null && opts.toSlide != null
        ? `Morph audit — slide ${opts.fromSlide + 1} → ${opts.toSlide + 1}`
        : "Morph audit";
    const lines = [
        head,
        formatMorphReadinessScoreLine(report),
        `Shapes: ${report.ghostCount} outgoing, ${report.stageCount} incoming`,
    ];
    if (report.pairs.length) {
        lines.push(`Match reasons: ${formatMorphMatchReasonBreakdown(report)}`);
    }
    if (filter !== "all")
        lines.push(`Filter: ${filter}`);
    lines.push("");
    const pairs = report.pairs.filter((p) => shouldIncludePair(p, filter));
    if (pairs.length) {
        lines.push("Matched pairs:");
        for (const p of pairs) {
            const via = (0, morph_match_1.morphMatchReason)(p.ghost, p.stage);
            const morph = p.pathMorph ? "path morph" : "FLIP";
            lines.push(`- ${p.stage.name || p.stage.id} ← ${p.ghost.name || p.ghost.id} (${via}, ${morph})`);
        }
        lines.push("");
    }
    if (filter === "all" || filter === "issues") {
        if (report.unmatchedStage.length) {
            lines.push("Incoming only (fade in):");
            for (const s of report.unmatchedStage)
                lines.push(`- ${s.name || s.id}`);
            lines.push("");
        }
        if (report.unmatchedGhost.length) {
            lines.push("Outgoing only (fade out):");
            for (const g of report.unmatchedGhost)
                lines.push(`- ${g.name || g.id}`);
            lines.push("");
        }
    }
    if (filter === "flip" && !pairs.length && !report.flipOnlyCount) {
        lines.push("No FLIP-only pairs.");
    }
    return lines.join("\n").trimEnd();
}
