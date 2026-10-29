"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterAccessibilityIssues = filterAccessibilityIssues;
exports.accessibilityIssueKindCount = accessibilityIssueKindCount;
exports.formatAccessibilityScoreLine = formatAccessibilityScoreLine;
exports.accessibilityReadinessPercent = accessibilityReadinessPercent;
exports.formatAccessibilityKindBreakdown = formatAccessibilityKindBreakdown;
exports.slideWithMostAccessibilityIssues = slideWithMostAccessibilityIssues;
exports.formatAccessibilityReadinessLine = formatAccessibilityReadinessLine;
exports.exportAccessibilityKindBreakdownText = exportAccessibilityKindBreakdownText;
exports.slidesWithMostAccessibilityIssues = slidesWithMostAccessibilityIssues;
exports.formatAccessibilityIssueLine = formatAccessibilityIssueLine;
exports.groupAccessibilityIssuesBySlide = groupAccessibilityIssuesBySlide;
exports.exportAccessibilityReportText = exportAccessibilityReportText;
exports.exportAccessibilityCompactText = exportAccessibilityCompactText;
exports.formatCompareStatsLine = formatCompareStatsLine;
exports.compareChangePercent = compareChangePercent;
exports.exportCompareCompactText = exportCompareCompactText;
exports.exportDeckReviewSummaryText = exportDeckReviewSummaryText;
exports.exportDeckReviewCompactText = exportDeckReviewCompactText;
exports.filterCompareEntries = filterCompareEntries;
exports.formatCompareEntryLine = formatCompareEntryLine;
exports.exportCompareReportText = exportCompareReportText;
exports.exportSmartLookupText = exportSmartLookupText;
exports.exportSmartLookupCompactText = exportSmartLookupCompactText;
exports.exportThesaurusText = exportThesaurusText;
exports.exportThesaurusCompactText = exportThesaurusCompactText;
exports.exportProtectionStatusText = exportProtectionStatusText;
exports.exportProtectionCompactText = exportProtectionCompactText;
exports.formatDeckReviewStatsLine = formatDeckReviewStatsLine;
exports.compareChangeCount = compareChangeCount;
exports.slideWithMostCompareChanges = slideWithMostCompareChanges;
exports.formatCompareReadinessLine = formatCompareReadinessLine;
exports.averageCompareChangeWeight = averageCompareChangeWeight;
exports.formatCompareChangeBreakdownLine = formatCompareChangeBreakdownLine;
exports.compareSlideIndicesWithStructureChanges = compareSlideIndicesWithStructureChanges;
exports.exportCompareStructureIndicesText = exportCompareStructureIndicesText;
exports.slideWithMostStructureCompareChanges = slideWithMostStructureCompareChanges;
exports.exportCompareReadinessText = exportCompareReadinessText;
exports.exportCompareAcceptIndicesText = exportCompareAcceptIndicesText;
exports.exportTranslatePairText = exportTranslatePairText;
exports.exportTranslatePairCompactText = exportTranslatePairCompactText;
exports.compareSlideIndicesToAccept = compareSlideIndicesToAccept;
exports.slideWithMostIssuesOfKind = slideWithMostIssuesOfKind;
exports.exportAccessibilityReadinessText = exportAccessibilityReadinessText;
exports.formatDeckReviewReadinessLine = formatDeckReviewReadinessLine;
exports.exportDeckReviewReadinessText = exportDeckReviewReadinessText;
exports.formatProtectionReadinessLine = formatProtectionReadinessLine;
exports.exportProtectionReadinessText = exportProtectionReadinessText;
exports.slidesWithAccessibilityIssues = slidesWithAccessibilityIssues;
exports.slidesWithoutAccessibilityIssues = slidesWithoutAccessibilityIssues;
exports.countSlidesWithAccessibilityIssues = countSlidesWithAccessibilityIssues;
exports.countSlidesWithoutAccessibilityIssues = countSlidesWithoutAccessibilityIssues;
exports.averageAccessibilityIssuesPerAffectedSlide = averageAccessibilityIssuesPerAffectedSlide;
exports.slideWithFirstAccessibilityIssue = slideWithFirstAccessibilityIssue;
exports.slideWithFewestAccessibilityIssues = slideWithFewestAccessibilityIssues;
exports.formatA11ySlideCoverageBreakdownLine = formatA11ySlideCoverageBreakdownLine;
exports.exportA11ySlideCoverageText = exportA11ySlideCoverageText;
exports.countCompareSlidesWithChanges = countCompareSlidesWithChanges;
exports.countCompareSlidesClean = countCompareSlidesClean;
exports.slideWithFirstCompareChange = slideWithFirstCompareChange;
exports.slideWithFewestCompareChanges = slideWithFewestCompareChanges;
exports.formatCompareSlideCoverageBreakdownLine = formatCompareSlideCoverageBreakdownLine;
exports.exportCompareSlideCoverageText = exportCompareSlideCoverageText;
const core_1 = require("@sliiu/present-core");
const accessibility_audit_1 = require("./accessibility-audit");
const compare_deck_1 = require("./compare-deck");
const A11Y_KIND_LABEL = {
    contrast: "contrast",
    "empty-slide": "empty-slide",
    "tiny-text": "tiny-text",
    "missing-alt": "missing-alt",
    "image-overlap": "image-overlap",
    "missing-title": "missing-title",
};
function filterAccessibilityIssues(issues, kind = "all") {
    if (kind === "all")
        return issues;
    return issues.filter((i) => i.kind === kind);
}
/** Number of distinct issue kinds present in the report. */
function accessibilityIssueKindCount(report) {
    return Object.keys((0, accessibility_audit_1.summarizeAccessibilityByKind)(report)).length;
}
/** One-line accessibility score for dialogs. */
function formatAccessibilityScoreLine(report) {
    if (!report.issues.length) {
        return `${report.checkedSlides} slide(s) checked · no issues`;
    }
    const kinds = accessibilityIssueKindCount(report);
    return `${report.issues.length} issue(s) · ${kinds} kind(s) · ${report.checkedSlides} slide(s)`;
}
/** 0–100 accessibility readiness score for the deck. */
function accessibilityReadinessPercent(report) {
    if (report.checkedSlides <= 0)
        return 100;
    if (!report.issues.length)
        return 100;
    const kinds = accessibilityIssueKindCount(report);
    const issueDensity = report.issues.length / Math.max(1, report.checkedSlides);
    const penalty = Math.min(1, issueDensity / 5 + kinds / 8);
    return Math.round(Math.max(0, 100 - penalty * 100));
}
/** Comma-separated issue counts by kind, e.g. `contrast×3, missing-alt×2`. */
function formatAccessibilityKindBreakdown(report) {
    const byKind = (0, accessibility_audit_1.summarizeAccessibilityByKind)(report);
    const parts = Object.entries(byKind)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([kind, n]) => `${A11Y_KIND_LABEL[kind] ?? kind}×${n}`);
    return parts.length ? parts.join(", ") : "none";
}
/** Slide index with the most accessibility issues (ties → lowest index). */
function slideWithMostAccessibilityIssues(report) {
    const hot = slidesWithMostAccessibilityIssues(report, 1);
    return hot[0]?.slideIndex ?? null;
}
/** One-line readiness score + kind breakdown. */
function formatAccessibilityReadinessLine(report) {
    return `Readiness: ${accessibilityReadinessPercent(report)}% · ${formatAccessibilityKindBreakdown(report)}`;
}
/** Plain-text kind breakdown for copy chips. */
function exportAccessibilityKindBreakdownText(report) {
    return [
        "Accessibility breakdown",
        formatAccessibilityReadinessLine(report),
        formatAccessibilityScoreLine(report),
    ].join("\n");
}
/** Slide indices with the most accessibility issues (ties → lower index first). */
function slidesWithMostAccessibilityIssues(report, limit = 3) {
    const grouped = groupAccessibilityIssuesBySlide(report);
    return [...grouped.entries()]
        .map(([slideIndex, issues]) => ({ slideIndex, count: issues.length }))
        .sort((a, b) => b.count - a.count || a.slideIndex - b.slideIndex)
        .slice(0, limit);
}
function formatAccessibilityIssueLine(issue) {
    const kind = A11Y_KIND_LABEL[issue.kind];
    const slide = `slide ${issue.slideIndex + 1}`;
    const shape = issue.shapeName ?? issue.shapeId;
    const who = shape ? `${slide} · ${shape}` : slide;
    return `[${kind}] ${who}: ${(0, accessibility_audit_1.accessibilityIssueDetail)(issue)}`;
}
/** Group issues by slide index (sorted ascending). */
function groupAccessibilityIssuesBySlide(report) {
    const out = new Map();
    for (const issue of report.issues) {
        const list = out.get(issue.slideIndex) ?? [];
        list.push(issue);
        out.set(issue.slideIndex, list);
    }
    return out;
}
/** Plain-text accessibility report for copy / export. */
function exportAccessibilityReportText(report, opts = {}) {
    const kind = opts.kind ?? "all";
    const issues = filterAccessibilityIssues(report.issues, kind);
    const filterNote = kind === "all" ? "" : ` (filter: ${A11Y_KIND_LABEL[kind]})`;
    const lines = [
        `Accessibility report${filterNote} — ${report.checkedSlides} slide(s), ${report.passed} text check(s) passed`,
        formatAccessibilityScoreLine({ ...report, issues: report.issues }),
        `${issues.length} issue(s) listed`,
        "",
    ];
    if (!issues.length) {
        lines.push(kind === "all" ? "No issues detected." : "No issues in this category.");
        return lines.join("\n");
    }
    const grouped = new Map();
    for (const issue of issues) {
        const list = grouped.get(issue.slideIndex) ?? [];
        list.push(issue);
        grouped.set(issue.slideIndex, list);
    }
    for (const slideIdx of [...grouped.keys()].sort((a, b) => a - b)) {
        lines.push(`## Slide ${slideIdx + 1}`);
        for (const issue of grouped.get(slideIdx) ?? []) {
            lines.push(`- ${formatAccessibilityIssueLine(issue)}`);
        }
        lines.push("");
    }
    return lines.join("\n").trimEnd();
}
/** Compact issue list without per-slide grouping (copy-friendly). */
function exportAccessibilityCompactText(report, opts = {}) {
    const kind = opts.kind ?? "all";
    const issues = filterAccessibilityIssues(report.issues, kind);
    const filterNote = kind === "all" ? "" : ` (filter: ${A11Y_KIND_LABEL[kind]})`;
    const lines = [
        `Accessibility issues${filterNote} — ${issues.length} listed`,
        `Readiness: ${accessibilityReadinessPercent(report)}% · ${formatAccessibilityScoreLine(report)}`,
        `Breakdown: ${formatAccessibilityKindBreakdown(report)}`,
        "",
    ];
    if (!issues.length) {
        lines.push(kind === "all" ? "No issues detected." : "No issues in this category.");
        return lines.join("\n");
    }
    for (const issue of issues) {
        lines.push(formatAccessibilityIssueLine(issue));
    }
    return lines.join("\n").trimEnd();
}
function formatCompareStatsLine(entries) {
    const stats = (0, compare_deck_1.summarizeCompareEntries)(entries);
    return `Compare: ${stats.changed} changed · ${stats.added} added · ${stats.removed} removed · ${stats.withTextPatches} text · ${stats.withStructure} structure`;
}
/** Share of compared slides that differ from the baseline (0–100). */
function compareChangePercent(entries) {
    if (!entries.length)
        return 0;
    const stats = (0, compare_deck_1.summarizeCompareEntries)(entries);
    const changed = stats.changed + stats.added + stats.removed;
    return Math.round((changed / entries.length) * 100);
}
/** Compact compare export (stats + short per-slide lines). */
function exportCompareCompactText(entries, meta, opts = {}) {
    const filter = opts.filter ?? "all";
    const diff = filterCompareEntries(entries, filter);
    const filterNote = filter === "all" ? "" : filter === "text" ? " (text)" : " (structure)";
    const lines = [
        `Compare summary${filterNote}`,
        `${compareChangePercent(entries)}% slides changed`,
        formatCompareStatsLine(entries),
        `${diff.length} slide(s) listed`,
    ];
    if (meta?.length) {
        lines.push(`Meta: ${meta.map((m) => `${m.kind} ${m.before}→${m.after}`).join("; ")}`);
    }
    lines.push("");
    if (!diff.length) {
        lines.push(filter === "all" ? "All compared slides match." : "No slides match this filter.");
        return lines.join("\n");
    }
    for (const entry of diff.slice(0, 24)) {
        const textCount = (entry.textShapes ?? []).filter((d) => d.textChanged).length;
        const structCount = (entry.structure ?? []).length;
        const parts = [textCount ? `${textCount} text` : "", structCount ? `${structCount} struct` : ""].filter(Boolean);
        lines.push(`Slide ${entry.slideIdx + 1}: ${entry.status}${parts.length ? ` · ${parts.join(" · ")}` : ""}`);
    }
    if (diff.length > 24)
        lines.push(`… +${diff.length - 24} more`);
    return lines.join("\n");
}
/** Deck-level review snapshot: accessibility + protection. */
function exportDeckReviewSummaryText(pres, opts = {}) {
    const report = opts.a11yReport ?? (0, accessibility_audit_1.auditPresentationAccessibility)(pres);
    const lines = [
        "Deck review summary",
        `Slides: ${pres.slides.length}`,
        "",
        `Accessibility readiness: ${accessibilityReadinessPercent(report)}%`,
        formatAccessibilityScoreLine(report),
        `Breakdown: ${formatAccessibilityKindBreakdown(report)}`,
    ];
    const hot = slidesWithMostAccessibilityIssues(report, 3);
    if (hot.length) {
        lines.push(`Busiest slides: ${hot.map((h) => `slide ${h.slideIndex + 1}×${h.count}`).join(", ")}`);
    }
    lines.push("");
    lines.push(exportProtectionStatusText(pres));
    return lines.join("\n");
}
/** Compact deck review snapshot (accessibility + protection one-liners). */
function exportDeckReviewCompactText(pres, opts = {}) {
    const report = opts.a11yReport ?? (0, accessibility_audit_1.auditPresentationAccessibility)(pres);
    const lines = [
        "Deck review (compact)",
        `Slides: ${pres.slides.length}`,
        formatAccessibilityReadinessLine(report),
        formatAccessibilityScoreLine(report),
    ];
    const busiest = slideWithMostAccessibilityIssues(report);
    if (busiest != null) {
        const count = groupAccessibilityIssuesBySlide(report).get(busiest)?.length ?? 0;
        lines.push(`Busiest: slide ${busiest + 1}×${count}`);
    }
    const p = (0, core_1.getPresentationProtection)(pres);
    if (!p)
        lines.push("Protection: none");
    else if (p.kind === "final")
        lines.push("Protection: final");
    else
        lines.push(`Protection: restricted${p.passwordHash ? " (password)" : ""}`);
    return lines.join("\n");
}
function filterCompareEntries(entries, filter = "all") {
    if (filter === "all")
        return entries.filter((e) => e.status !== "same");
    return entries.filter((e) => {
        if (e.status === "same")
            return false;
        if (filter === "text")
            return (0, compare_deck_1.slideEntryHasTextPatches)(e);
        return (0, compare_deck_1.slideEntryHasStructureDiff)(e);
    });
}
function formatCompareEntryLine(entry) {
    const head = `Slide ${entry.slideIdx + 1}: ${entry.status}`;
    const parts = [head];
    for (const s of entry.structure ?? []) {
        parts.push(`  structure ${s.kind}: ${s.before ?? "—"} → ${s.after ?? "—"}`);
    }
    for (const d of entry.textShapes ?? []) {
        if (d.textChanged) {
            parts.push(`  text shape ${d.shapeIndex}: "${d.before || "—"}" → "${d.after || "—"}"`);
        }
        else if (d.bboxMoved) {
            parts.push(`  text shape ${d.shapeIndex}: moved/resized`);
        }
    }
    return parts.join("\n");
}
/** Plain-text compare summary for copy / export. */
function exportCompareReportText(entries, meta, opts = {}) {
    const filter = opts.filter ?? "all";
    const diff = filterCompareEntries(entries, filter);
    const stats = (0, compare_deck_1.summarizeCompareEntries)(entries);
    const filterNote = filter === "all" ? "" : filter === "text" ? " (text changes)" : " (structure changes)";
    const lines = [
        `Compare report${filterNote}`,
        `Changed ${stats.changed} · added ${stats.added} · removed ${stats.removed} · text ${stats.withTextPatches} · structure ${stats.withStructure}`,
        `${diff.length} slide(s) listed`,
        "",
    ];
    for (const m of meta ?? []) {
        lines.push(`Meta ${m.kind}: ${m.before} → ${m.after}`);
    }
    if (meta?.length)
        lines.push("");
    if (!diff.length) {
        lines.push(filter === "all" ? "All compared slides match." : "No slides match this filter.");
        return lines.join("\n");
    }
    for (const e of diff) {
        lines.push(formatCompareEntryLine(e));
        lines.push("");
    }
    return lines.join("\n").trimEnd();
}
/** Plain-text Smart Lookup result for copy. */
function exportSmartLookupText(result, extras = {}) {
    const lines = [`Smart Lookup — ${result.word}`];
    if (result.phonetic)
        lines.push(`Phonetic: ${result.phonetic}`);
    for (const m of result.meanings) {
        const pos = m.partOfSpeech ? `${m.partOfSpeech}: ` : "";
        lines.push(`${pos}${m.definition}`);
        if (m.example)
            lines.push(`  e.g. "${m.example}"`);
    }
    if (result.wiki) {
        lines.push("", `Wikipedia — ${result.wiki.title}`, result.wiki.extract, result.wiki.url);
    }
    if (extras.synonyms?.length)
        lines.push("", `Synonyms: ${extras.synonyms.join(", ")}`);
    if (extras.antonyms?.length)
        lines.push(`Antonyms: ${extras.antonyms.join(", ")}`);
    return lines.join("\n").trimEnd();
}
/** Compact Smart Lookup summary (one-liners). */
function exportSmartLookupCompactText(result, extras = {}) {
    const def = result.meanings[0]?.definition ?? "";
    const parts = ["Smart Lookup (compact)", result.word];
    if (def)
        parts.push(def.length > 80 ? `${def.slice(0, 77)}…` : def);
    if (extras.synonyms?.length)
        parts.push(`syn: ${extras.synonyms.slice(0, 5).join(", ")}`);
    if (extras.antonyms?.length)
        parts.push(`ant: ${extras.antonyms.slice(0, 5).join(", ")}`);
    return parts.join(" · ");
}
function exportThesaurusText(word, synonyms, related, antonyms) {
    const lines = [`Thesaurus — ${word}`];
    if (synonyms.length)
        lines.push(`Synonyms: ${synonyms.join(", ")}`);
    if (antonyms.length)
        lines.push(`Antonyms: ${antonyms.join(", ")}`);
    if (related.length)
        lines.push(`Related: ${related.join(", ")}`);
    if (!synonyms.length && !antonyms.length && !related.length)
        lines.push("No results.");
    return lines.join("\n");
}
/** Compact thesaurus summary. */
function exportThesaurusCompactText(word, synonyms, related, antonyms) {
    const parts = ["Thesaurus (compact)", word];
    if (synonyms.length)
        parts.push(`syn: ${synonyms.slice(0, 8).join(", ")}`);
    if (antonyms.length)
        parts.push(`ant: ${antonyms.slice(0, 5).join(", ")}`);
    if (related.length)
        parts.push(`related: ${related.slice(0, 5).join(", ")}`);
    if (!synonyms.length && !antonyms.length && !related.length)
        parts.push("no results");
    return parts.join(" · ");
}
/** Plain-text protection status for copy. */
function exportProtectionStatusText(pres) {
    const p = (0, core_1.getPresentationProtection)(pres);
    const office = (0, core_1.summarizeOfficeModifyVerifier)(pres.modifyVerifier);
    const lines = ["Presentation protection"];
    if (!p) {
        lines.push("Status: not protected");
    }
    else if (p.kind === "final") {
        lines.push("Status: marked as final");
    }
    else {
        lines.push(`Status: editing restricted${p.passwordHash ? " (password)" : ""}`);
    }
    if (p?.setAt)
        lines.push(`Since: ${new Date(p.setAt).toISOString()}`);
    if (office) {
        lines.push(`Office modifyVerifier: ${office.algorithm}, spin ${office.spinCount}`);
    }
    return lines.join("\n");
}
/** One-line protection status for compact copy. */
function exportProtectionCompactText(pres) {
    const p = (0, core_1.getPresentationProtection)(pres);
    if (!p)
        return "Protection: none";
    if (p.kind === "final")
        return "Protection: final";
    return `Protection: restricted${p.passwordHash ? " (password)" : ""}`;
}
/** One-line deck review stats (accessibility + protection). */
function formatDeckReviewStatsLine(pres, opts = {}) {
    const report = opts.a11yReport ?? (0, accessibility_audit_1.auditPresentationAccessibility)(pres);
    const parts = [
        `${pres.slides.length} slides`,
        `readiness ${accessibilityReadinessPercent(report)}%`,
        `${report.issues.length} a11y issue(s)`,
        exportProtectionCompactText(pres).replace("Protection: ", "protection "),
    ];
    const busiest = slideWithMostAccessibilityIssues(report);
    if (busiest != null)
        parts.push(`busiest slide ${busiest + 1}`);
    return parts.join(" · ");
}
/** Rough change weight for a single compare entry. */
function compareChangeCount(entry) {
    if (entry.status === "added" || entry.status === "removed")
        return 1;
    if (entry.status !== "changed")
        return 0;
    const text = (entry.textShapes ?? []).filter((d) => d.textChanged).length;
    const moved = (entry.textShapes ?? []).filter((d) => d.bboxMoved).length;
    const struct = (entry.structure ?? []).length;
    return Math.max(1, text + moved + struct);
}
/** Slide index with the most compare differences (ties → lowest index). */
function slideWithMostCompareChanges(entries) {
    let bestIdx = null;
    let bestCount = 0;
    for (const entry of entries) {
        if (entry.status === "same")
            continue;
        const count = compareChangeCount(entry);
        if (count > bestCount || (count === bestCount && (bestIdx == null || entry.slideIdx < bestIdx))) {
            bestIdx = entry.slideIdx;
            bestCount = count;
        }
    }
    return bestIdx;
}
/** One-line compare readiness (change % + stats). */
function formatCompareReadinessLine(entries) {
    if (!entries.length)
        return "Compare: no slides";
    const parts = [`${compareChangePercent(entries)}% changed`, formatCompareChangeBreakdownLine(entries)];
    const avg = averageCompareChangeWeight(entries);
    if (avg > 0)
        parts.push(`avg ${avg}`);
    return `Compare: ${parts.join(" · ")}`;
}
/** Average change weight on changed slides (0 if none). */
function averageCompareChangeWeight(entries) {
    const changed = entries.filter((e) => e.status !== "same");
    if (!changed.length)
        return 0;
    const total = changed.reduce((sum, e) => sum + compareChangeCount(e), 0);
    return Math.round((total / changed.length) * 10) / 10;
}
/** One-line compare change breakdown (text / structure / added / removed). */
function formatCompareChangeBreakdownLine(entries) {
    const stats = (0, compare_deck_1.summarizeCompareEntries)(entries);
    const parts = [];
    if (stats.withTextPatches)
        parts.push(`text ${stats.withTextPatches}`);
    if (stats.withStructure)
        parts.push(`structure ${stats.withStructure}`);
    if (stats.added)
        parts.push(`added ${stats.added}`);
    if (stats.removed)
        parts.push(`removed ${stats.removed}`);
    if (stats.changed)
        parts.push(`changed ${stats.changed}`);
    return parts.length ? parts.join(" · ") : "no changes";
}
/** Slide indices with structure diffs. */
function compareSlideIndicesWithStructureChanges(entries) {
    return entries
        .filter((e) => e.status !== "same" && (0, compare_deck_1.slideEntryHasStructureDiff)(e))
        .map((e) => e.slideIdx);
}
/** Comma-separated slide numbers with structure changes. */
function exportCompareStructureIndicesText(entries) {
    const indices = compareSlideIndicesWithStructureChanges(entries);
    if (!indices.length)
        return "Compare structure list: none";
    return `Compare structure list (${indices.length}): ${indices.map((i) => i + 1).join(", ")}`;
}
/** Slide index with the most structure compare differences (ties → lowest index). */
function slideWithMostStructureCompareChanges(entries) {
    let bestIdx = null;
    let bestCount = 0;
    for (const entry of entries) {
        if (!(0, compare_deck_1.slideEntryHasStructureDiff)(entry))
            continue;
        const count = Math.max(1, (entry.structure ?? []).length);
        if (count > bestCount || (count === bestCount && (bestIdx == null || entry.slideIdx < bestIdx))) {
            bestIdx = entry.slideIdx;
            bestCount = count;
        }
    }
    return bestIdx;
}
/** Labeled compare readiness export for copy. */
function exportCompareReadinessText(entries) {
    return [
        "Compare readiness",
        formatCompareReadinessLine(entries),
        formatCompareSlideCoverageBreakdownLine(entries),
        exportCompareAcceptIndicesText(entries),
        exportCompareStructureIndicesText(entries),
    ].join("\n");
}
/** Comma-separated slide numbers with text patches to accept. */
function exportCompareAcceptIndicesText(entries) {
    const indices = compareSlideIndicesToAccept(entries);
    if (!indices.length)
        return "Compare accept list: none";
    return `Compare accept list (${indices.length}): ${indices.map((i) => i + 1).join(", ")}`;
}
/** Plain-text translation pair for copy. */
function exportTranslatePairText(opts) {
    return [`Translation (${opts.fromTag} → ${opts.toTag})`, "", opts.source.trim(), "", "—", "", opts.translated.trim()].join("\n");
}
/** Compact translation pair (one line each). */
function exportTranslatePairCompactText(opts) {
    const src = opts.source.trim().replace(/\s+/g, " ");
    const tr = opts.translated.trim().replace(/\s+/g, " ");
    const clip = (s) => (s.length > 60 ? `${s.slice(0, 57)}…` : s);
    return [`Translation (${opts.fromTag}→${opts.toTag})`, clip(src), "→", clip(tr)].join(" · ");
}
/** Slide indices that still have text patches to accept. */
function compareSlideIndicesToAccept(entries) {
    return entries
        .filter((e) => e.status === "changed" && (e.textShapes ?? []).some((d) => d.textChanged))
        .map((e) => e.slideIdx);
}
/** Slide index with the most issues of a given kind (ties → lowest index). */
function slideWithMostIssuesOfKind(report, kind) {
    const issues = filterAccessibilityIssues(report.issues, kind);
    if (!issues.length)
        return null;
    const counts = new Map();
    for (const issue of issues) {
        counts.set(issue.slideIndex, (counts.get(issue.slideIndex) ?? 0) + 1);
    }
    let bestIdx = null;
    let bestCount = 0;
    for (const [idx, count] of counts) {
        if (count > bestCount || (count === bestCount && (bestIdx == null || idx < bestIdx))) {
            bestIdx = idx;
            bestCount = count;
        }
    }
    return bestIdx;
}
/** Labeled accessibility readiness export for copy. */
function exportAccessibilityReadinessText(report) {
    return [
        "Accessibility readiness",
        formatAccessibilityReadinessLine(report),
        formatAccessibilityScoreLine(report),
        `Breakdown: ${formatAccessibilityKindBreakdown(report)}`,
    ].join("\n");
}
/** One-line deck review readiness (accessibility + protection). */
function formatDeckReviewReadinessLine(pres, opts = {}) {
    const report = opts.a11yReport ?? (0, accessibility_audit_1.auditPresentationAccessibility)(pres);
    const parts = [
        `Review ready ${accessibilityReadinessPercent(report)}%`,
        `${report.issues.length} a11y issue(s)`,
        exportProtectionCompactText(pres).replace("Protection: ", "protection "),
    ];
    const busiest = slideWithMostAccessibilityIssues(report);
    if (busiest != null)
        parts.push(`busiest slide ${busiest + 1}`);
    return parts.join(" · ");
}
/** Labeled deck review readiness export for copy. */
function exportDeckReviewReadinessText(pres, opts = {}) {
    const report = opts.a11yReport ?? (0, accessibility_audit_1.auditPresentationAccessibility)(pres);
    return [
        "Deck review readiness",
        formatDeckReviewReadinessLine(pres, { a11yReport: report }),
        formatA11ySlideCoverageBreakdownLine(report),
        formatDeckReviewStatsLine(pres, { a11yReport: report }),
    ].join("\n");
}
/** One-line protection readiness for status chips. */
function formatProtectionReadinessLine(pres) {
    const compact = exportProtectionCompactText(pres);
    const office = (0, core_1.summarizeOfficeModifyVerifier)(pres.modifyVerifier);
    const parts = ["Protection ready", compact.replace("Protection: ", "")];
    if (office)
        parts.push(`Office ${office.algorithm}`);
    return parts.join(" · ");
}
/** Labeled protection readiness export for copy. */
function exportProtectionReadinessText(pres) {
    return ["Protection readiness", formatProtectionReadinessLine(pres), "", exportProtectionStatusText(pres)].join("\n");
}
/** Slide indices with at least one accessibility issue. */
function slidesWithAccessibilityIssues(report) {
    return [...new Set(report.issues.map((i) => i.slideIndex))].sort((a, b) => a - b);
}
/** Slide indices checked with no accessibility issues. */
function slidesWithoutAccessibilityIssues(report) {
    const withIssues = new Set(slidesWithAccessibilityIssues(report));
    const out = [];
    for (let i = 0; i < report.checkedSlides; i++) {
        if (!withIssues.has(i))
            out.push(i);
    }
    return out;
}
/** Count of slides with accessibility issues. */
function countSlidesWithAccessibilityIssues(report) {
    return slidesWithAccessibilityIssues(report).length;
}
/** Count of checked slides with no accessibility issues. */
function countSlidesWithoutAccessibilityIssues(report) {
    return slidesWithoutAccessibilityIssues(report).length;
}
/** Average issues per slide that has at least one issue (0 if none). */
function averageAccessibilityIssuesPerAffectedSlide(report) {
    const affected = countSlidesWithAccessibilityIssues(report);
    if (!affected)
        return 0;
    return Math.round((report.issues.length / affected) * 10) / 10;
}
/** First slide index with an accessibility issue (lowest index). */
function slideWithFirstAccessibilityIssue(report) {
    return slidesWithAccessibilityIssues(report)[0] ?? null;
}
/** Slide with the fewest issues among affected slides (ties → lowest index). */
function slideWithFewestAccessibilityIssues(report) {
    const grouped = groupAccessibilityIssuesBySlide(report);
    let bestIdx = null;
    let bestCount = Infinity;
    for (const [idx, issues] of grouped) {
        const count = issues.length;
        if (count < bestCount || (count === bestCount && (bestIdx == null || idx < bestIdx))) {
            bestIdx = idx;
            bestCount = count;
        }
    }
    return bestIdx;
}
/** One-line accessibility slide coverage breakdown. */
function formatA11ySlideCoverageBreakdownLine(report) {
    const withIssues = countSlidesWithAccessibilityIssues(report);
    const clean = countSlidesWithoutAccessibilityIssues(report);
    const parts = [`${withIssues} slide(s) with issues`, `${clean} clean`];
    const avg = averageAccessibilityIssuesPerAffectedSlide(report);
    if (avg > 0)
        parts.push(`avg ${avg} issue(s)/slide`);
    return parts.join(" · ");
}
/** Labeled accessibility slide coverage export for copy. */
function exportA11ySlideCoverageText(report) {
    return [
        "Accessibility slide coverage",
        formatA11ySlideCoverageBreakdownLine(report),
        `Readiness: ${accessibilityReadinessPercent(report)}%`,
        `Breakdown: ${formatAccessibilityKindBreakdown(report)}`,
    ].join("\n");
}
/** Count of compared slides with any difference. */
function countCompareSlidesWithChanges(entries) {
    return entries.filter((e) => e.status !== "same").length;
}
/** Count of compared slides that match exactly. */
function countCompareSlidesClean(entries) {
    return entries.filter((e) => e.status === "same").length;
}
/** First slide index with a compare difference (lowest index). */
function slideWithFirstCompareChange(entries) {
    for (const entry of entries) {
        if (entry.status !== "same")
            return entry.slideIdx;
    }
    return null;
}
/** Slide with the fewest compare changes among non-matching slides (ties → lowest index). */
function slideWithFewestCompareChanges(entries) {
    let bestIdx = null;
    let bestCount = Infinity;
    for (const entry of entries) {
        if (entry.status === "same")
            continue;
        const count = compareChangeCount(entry);
        if (count < bestCount || (count === bestCount && (bestIdx == null || entry.slideIdx < bestIdx))) {
            bestIdx = entry.slideIdx;
            bestCount = count;
        }
    }
    return bestIdx;
}
/** One-line compare slide coverage breakdown. */
function formatCompareSlideCoverageBreakdownLine(entries) {
    const changed = countCompareSlidesWithChanges(entries);
    const clean = countCompareSlidesClean(entries);
    const parts = [`${changed} changed`, `${clean} clean`];
    const avg = averageCompareChangeWeight(entries);
    if (changed > 0 && avg > 0)
        parts.push(`avg ${avg} change(s)/slide`);
    return parts.join(" · ");
}
/** Labeled compare slide coverage export for copy. */
function exportCompareSlideCoverageText(entries) {
    return [
        "Compare slide coverage",
        formatCompareSlideCoverageBreakdownLine(entries),
        `${compareChangePercent(entries)}% changed`,
        exportCompareAcceptIndicesText(entries),
    ].join("\n");
}
