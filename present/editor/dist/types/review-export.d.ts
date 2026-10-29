import type { Presentation } from "@sliiu/present-core";
import { type AccessibilityIssue, type AccessibilityIssueKind, type AccessibilityReport } from "./accessibility-audit.js";
import type { SmartLookupResult } from "./smart-lookup-dialog.js";
import { type DeckMetaDiff, type SlideCompareEntry } from "./compare-deck.js";
export type CompareReportFilter = "all" | "text" | "structure";
export declare function filterAccessibilityIssues(issues: AccessibilityIssue[], kind?: AccessibilityIssueKind | "all"): AccessibilityIssue[];
/** Number of distinct issue kinds present in the report. */
export declare function accessibilityIssueKindCount(report: AccessibilityReport): number;
/** One-line accessibility score for dialogs. */
export declare function formatAccessibilityScoreLine(report: AccessibilityReport): string;
/** 0–100 accessibility readiness score for the deck. */
export declare function accessibilityReadinessPercent(report: AccessibilityReport): number;
/** Comma-separated issue counts by kind, e.g. `contrast×3, missing-alt×2`. */
export declare function formatAccessibilityKindBreakdown(report: AccessibilityReport): string;
/** Slide index with the most accessibility issues (ties → lowest index). */
export declare function slideWithMostAccessibilityIssues(report: AccessibilityReport): number | null;
/** One-line readiness score + kind breakdown. */
export declare function formatAccessibilityReadinessLine(report: AccessibilityReport): string;
/** Plain-text kind breakdown for copy chips. */
export declare function exportAccessibilityKindBreakdownText(report: AccessibilityReport): string;
/** Slide indices with the most accessibility issues (ties → lower index first). */
export declare function slidesWithMostAccessibilityIssues(report: AccessibilityReport, limit?: number): Array<{
    slideIndex: number;
    count: number;
}>;
export declare function formatAccessibilityIssueLine(issue: AccessibilityIssue): string;
/** Group issues by slide index (sorted ascending). */
export declare function groupAccessibilityIssuesBySlide(report: AccessibilityReport): Map<number, AccessibilityIssue[]>;
/** Plain-text accessibility report for copy / export. */
export declare function exportAccessibilityReportText(report: AccessibilityReport, opts?: {
    kind?: AccessibilityIssueKind | "all";
}): string;
/** Compact issue list without per-slide grouping (copy-friendly). */
export declare function exportAccessibilityCompactText(report: AccessibilityReport, opts?: {
    kind?: AccessibilityIssueKind | "all";
}): string;
export declare function formatCompareStatsLine(entries: SlideCompareEntry[]): string;
/** Share of compared slides that differ from the baseline (0–100). */
export declare function compareChangePercent(entries: SlideCompareEntry[]): number;
/** Compact compare export (stats + short per-slide lines). */
export declare function exportCompareCompactText(entries: SlideCompareEntry[], meta?: DeckMetaDiff[], opts?: {
    filter?: CompareReportFilter;
}): string;
/** Deck-level review snapshot: accessibility + protection. */
export declare function exportDeckReviewSummaryText(pres: Presentation, opts?: {
    a11yReport?: AccessibilityReport;
}): string;
/** Compact deck review snapshot (accessibility + protection one-liners). */
export declare function exportDeckReviewCompactText(pres: Presentation, opts?: {
    a11yReport?: AccessibilityReport;
}): string;
export declare function filterCompareEntries(entries: SlideCompareEntry[], filter?: CompareReportFilter): SlideCompareEntry[];
export declare function formatCompareEntryLine(entry: SlideCompareEntry): string;
/** Plain-text compare summary for copy / export. */
export declare function exportCompareReportText(entries: SlideCompareEntry[], meta?: DeckMetaDiff[], opts?: {
    filter?: CompareReportFilter;
}): string;
/** Plain-text Smart Lookup result for copy. */
export declare function exportSmartLookupText(result: SmartLookupResult, extras?: {
    synonyms?: string[];
    antonyms?: string[];
}): string;
/** Compact Smart Lookup summary (one-liners). */
export declare function exportSmartLookupCompactText(result: SmartLookupResult, extras?: {
    synonyms?: string[];
    antonyms?: string[];
}): string;
export declare function exportThesaurusText(word: string, synonyms: string[], related: string[], antonyms: string[]): string;
/** Compact thesaurus summary. */
export declare function exportThesaurusCompactText(word: string, synonyms: string[], related: string[], antonyms: string[]): string;
/** Plain-text protection status for copy. */
export declare function exportProtectionStatusText(pres: Presentation): string;
/** One-line protection status for compact copy. */
export declare function exportProtectionCompactText(pres: Presentation): string;
/** One-line deck review stats (accessibility + protection). */
export declare function formatDeckReviewStatsLine(pres: Presentation, opts?: {
    a11yReport?: AccessibilityReport;
}): string;
/** Rough change weight for a single compare entry. */
export declare function compareChangeCount(entry: SlideCompareEntry): number;
/** Slide index with the most compare differences (ties → lowest index). */
export declare function slideWithMostCompareChanges(entries: SlideCompareEntry[]): number | null;
/** One-line compare readiness (change % + stats). */
export declare function formatCompareReadinessLine(entries: SlideCompareEntry[]): string;
/** Average change weight on changed slides (0 if none). */
export declare function averageCompareChangeWeight(entries: SlideCompareEntry[]): number;
/** One-line compare change breakdown (text / structure / added / removed). */
export declare function formatCompareChangeBreakdownLine(entries: SlideCompareEntry[]): string;
/** Slide indices with structure diffs. */
export declare function compareSlideIndicesWithStructureChanges(entries: SlideCompareEntry[]): number[];
/** Comma-separated slide numbers with structure changes. */
export declare function exportCompareStructureIndicesText(entries: SlideCompareEntry[]): string;
/** Slide index with the most structure compare differences (ties → lowest index). */
export declare function slideWithMostStructureCompareChanges(entries: SlideCompareEntry[]): number | null;
/** Labeled compare readiness export for copy. */
export declare function exportCompareReadinessText(entries: SlideCompareEntry[]): string;
/** Comma-separated slide numbers with text patches to accept. */
export declare function exportCompareAcceptIndicesText(entries: SlideCompareEntry[]): string;
/** Plain-text translation pair for copy. */
export declare function exportTranslatePairText(opts: {
    source: string;
    translated: string;
    fromTag: string;
    toTag: string;
}): string;
/** Compact translation pair (one line each). */
export declare function exportTranslatePairCompactText(opts: {
    source: string;
    translated: string;
    fromTag: string;
    toTag: string;
}): string;
/** Slide indices that still have text patches to accept. */
export declare function compareSlideIndicesToAccept(entries: SlideCompareEntry[]): number[];
/** Slide index with the most issues of a given kind (ties → lowest index). */
export declare function slideWithMostIssuesOfKind(report: AccessibilityReport, kind: AccessibilityIssueKind): number | null;
/** Labeled accessibility readiness export for copy. */
export declare function exportAccessibilityReadinessText(report: AccessibilityReport): string;
/** One-line deck review readiness (accessibility + protection). */
export declare function formatDeckReviewReadinessLine(pres: Presentation, opts?: {
    a11yReport?: AccessibilityReport;
}): string;
/** Labeled deck review readiness export for copy. */
export declare function exportDeckReviewReadinessText(pres: Presentation, opts?: {
    a11yReport?: AccessibilityReport;
}): string;
/** One-line protection readiness for status chips. */
export declare function formatProtectionReadinessLine(pres: Presentation): string;
/** Labeled protection readiness export for copy. */
export declare function exportProtectionReadinessText(pres: Presentation): string;
/** Slide indices with at least one accessibility issue. */
export declare function slidesWithAccessibilityIssues(report: AccessibilityReport): number[];
/** Slide indices checked with no accessibility issues. */
export declare function slidesWithoutAccessibilityIssues(report: AccessibilityReport): number[];
/** Count of slides with accessibility issues. */
export declare function countSlidesWithAccessibilityIssues(report: AccessibilityReport): number;
/** Count of checked slides with no accessibility issues. */
export declare function countSlidesWithoutAccessibilityIssues(report: AccessibilityReport): number;
/** Average issues per slide that has at least one issue (0 if none). */
export declare function averageAccessibilityIssuesPerAffectedSlide(report: AccessibilityReport): number;
/** First slide index with an accessibility issue (lowest index). */
export declare function slideWithFirstAccessibilityIssue(report: AccessibilityReport): number | null;
/** Slide with the fewest issues among affected slides (ties → lowest index). */
export declare function slideWithFewestAccessibilityIssues(report: AccessibilityReport): number | null;
/** One-line accessibility slide coverage breakdown. */
export declare function formatA11ySlideCoverageBreakdownLine(report: AccessibilityReport): string;
/** Labeled accessibility slide coverage export for copy. */
export declare function exportA11ySlideCoverageText(report: AccessibilityReport): string;
/** Count of compared slides with any difference. */
export declare function countCompareSlidesWithChanges(entries: SlideCompareEntry[]): number;
/** Count of compared slides that match exactly. */
export declare function countCompareSlidesClean(entries: SlideCompareEntry[]): number;
/** First slide index with a compare difference (lowest index). */
export declare function slideWithFirstCompareChange(entries: SlideCompareEntry[]): number | null;
/** Slide with the fewest compare changes among non-matching slides (ties → lowest index). */
export declare function slideWithFewestCompareChanges(entries: SlideCompareEntry[]): number | null;
/** One-line compare slide coverage breakdown. */
export declare function formatCompareSlideCoverageBreakdownLine(entries: SlideCompareEntry[]): string;
/** Labeled compare slide coverage export for copy. */
export declare function exportCompareSlideCoverageText(entries: SlideCompareEntry[]): string;
