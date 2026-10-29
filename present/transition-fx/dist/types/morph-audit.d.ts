import type { Presentation, Shape, Slide } from "@sliiu/present-core";
import { morphMatchReason, type MorphShapeCandidate } from "./morph-match.js";
export type MorphAuditFilter = "all" | "path" | "flip" | "issues";
export interface MorphAuditPair {
    ghost: MorphShapeCandidate;
    stage: MorphShapeCandidate;
    pathMorph: boolean;
}
export interface MorphAuditReport {
    ghostCount: number;
    stageCount: number;
    matched: number;
    pathMorphCount: number;
    flipOnlyCount: number;
    unmatchedStage: MorphShapeCandidate[];
    unmatchedGhost: MorphShapeCandidate[];
    pairs: MorphAuditPair[];
}
/** Build a morph candidate from an in-memory shape (slide coordinates). */
export declare function morphCandidateFromShape(shape: Shape): MorphShapeCandidate | null;
/** Collect morph candidates from all visible layers on a slide (top-level shapes, as the player matches them). */
export declare function collectMorphCandidatesFromSlide(slide: Slide): MorphShapeCandidate[];
/** Analyze morph readiness between two slides (current → next). */
export declare function auditMorphSlides(fromSlide: Slide, toSlide: Slide): MorphAuditReport;
export declare function formatMorphReadinessSummary(report: MorphAuditReport): string;
/** 0–100 morph readiness score for the slide pair. */
export declare function morphReadinessPercent(report: MorphAuditReport): number;
export type MorphMatchReasonKind = ReturnType<typeof morphMatchReason>;
/** Count matched pairs by match reason (id / name / placeholder / geometry). */
export declare function summarizeMorphMatchReasons(report: MorphAuditReport): Partial<Record<MorphMatchReasonKind, number>>;
export declare function formatMorphMatchReasonBreakdown(report: MorphAuditReport): string;
/** Unmatched shapes + FLIP-only pairs (actionable morph issues). */
export declare function morphIssueCount(report: MorphAuditReport): number;
export declare function averageMorphReadinessPercent(entries: readonly MorphDeckAuditEntry[]): number;
export declare function findWeakestMorphPair(entries: readonly MorphDeckAuditEntry[]): MorphDeckAuditEntry | null;
export declare function findStrongestMorphPair(entries: readonly MorphDeckAuditEntry[]): MorphDeckAuditEntry | null;
export declare function formatMorphReadinessScoreLine(report: MorphAuditReport): string;
/** Percent of matched pairs that use path morph (0–100). */
export declare function pathMorphCoveragePercent(report: MorphAuditReport): number;
export declare function countMorphDeckIssues(entries: readonly MorphDeckAuditEntry[]): number;
export declare function morphPairsWithIssues(entries: readonly MorphDeckAuditEntry[]): MorphDeckAuditEntry[];
/** Average path-morph coverage across adjacent slide pairs (0–100). */
export declare function averagePathMorphCoveragePercent(entries: readonly MorphDeckAuditEntry[]): number;
/** Slide pair with the most morph issues (ties → lowest from index). */
export declare function findMostIssueMorphPair(entries: readonly MorphDeckAuditEntry[]): MorphDeckAuditEntry | null;
/** Slide pair with the highest path-morph coverage (ties → lowest from index). */
export declare function findHighestPathCoverageMorphPair(entries: readonly MorphDeckAuditEntry[]): MorphDeckAuditEntry | null;
/** One-line morph readiness for chips and compact copy. */
export declare function formatMorphReadinessLine(report: MorphAuditReport): string;
/** Labeled readiness export for a single slide pair. */
export declare function exportMorphReadinessText(report: MorphAuditReport, opts?: {
    fromSlide?: number;
    toSlide?: number;
}): string;
/** One-line deck morph readiness (stats + average path coverage). */
export declare function formatMorphDeckReadinessLine(pres: Pick<Presentation, "slides">): string;
/** Deck morph lines for the developer panel. Audits the deck once. */
export declare function formatMorphDeckChromeLines(pres: Pick<Presentation, "slides">): {
    stats: string;
    readiness: string;
    pairCoverage: string;
    lowestPath: string;
};
/** Labeled deck readiness export for copy. */
export declare function exportMorphDeckReadinessText(pres: Pick<Presentation, "slides">): string;
/** Count of adjacent slide pairs with zero morph issues. */
export declare function countMorphPairsClean(entries: readonly MorphDeckAuditEntry[]): number;
/** Count of adjacent slide pairs with at least one morph issue. */
export declare function countMorphPairsWithIssues(entries: readonly MorphDeckAuditEntry[]): number;
/** Average morph issues per adjacent slide pair (0 if no pairs). */
export declare function averageMorphIssuesPerPair(entries: readonly MorphDeckAuditEntry[]): number;
/** First slide pair (lowest from index) with morph issues. */
export declare function findFirstIssueMorphPair(entries: readonly MorphDeckAuditEntry[]): MorphDeckAuditEntry | null;
/** Slide pair with the lowest path-morph coverage among pairs with matches (ties → lowest from index). */
export declare function findLowestPathCoverageMorphPair(entries: readonly MorphDeckAuditEntry[]): MorphDeckAuditEntry | null;
/** One-line pair coverage breakdown (clean / issues / avg issues). */
export declare function formatMorphPairCoverageBreakdownLine(pres: Pick<Presentation, "slides">): string;
/** One-line lowest path-coverage pair summary. */
export declare function formatMorphLowestPathLine(pres: Pick<Presentation, "slides">): string;
export interface MorphUnmatchedShapeRef {
    slideIndex: number;
    direction: "incoming" | "outgoing";
    pairFromIndex: number;
    id: string;
    name: string;
}
/** Unmatched morph shapes across all adjacent slide pairs. */
export declare function collectUnmatchedMorphShapesInDeck(pres: Pick<Presentation, "slides">): MorphUnmatchedShapeRef[];
/** Plain-text report of unmatched morph shapes in the deck. */
export declare function exportMorphUnmatchedShapesText(pres: Pick<Presentation, "slides">): string;
/** Labeled pair-coverage export for copy. */
export declare function exportMorphPairCoverageText(pres: Pick<Presentation, "slides">): string;
export type MorphDeckEntryFilter = "all" | "issues" | "path" | "clean";
export declare function filterMorphDeckEntries(entries: readonly MorphDeckAuditEntry[], filter?: MorphDeckEntryFilter): MorphDeckAuditEntry[];
/** Compact deck pair list filtered by issues / path / clean. */
export declare function exportMorphDeckFilteredCompactText(pres: Pick<Presentation, "slides">, filter?: MorphDeckEntryFilter): string;
/** One-line deck morph stats for chips and compact copy. */
export declare function formatMorphDeckStatsLine(pres: Pick<Presentation, "slides">): string;
/** Compact single-pair morph summary (one-liners). */
export declare function exportMorphPairCompactText(report: MorphAuditReport, opts?: {
    fromSlide?: number;
    toSlide?: number;
}): string;
/** Comma-separated deck pairs that have morph issues. */
export declare function exportMorphDeckIssuesCompactText(pres: Pick<Presentation, "slides">): string;
export interface MorphDeckAuditEntry {
    fromIndex: number;
    toIndex: number;
    report: MorphAuditReport;
}
/** Audit morph readiness for every adjacent slide pair in a deck. */
export declare function auditMorphDeck(pres: Pick<Presentation, "slides">): MorphDeckAuditEntry[];
/** Plain-text morph audit across the whole deck. */
export declare function exportMorphDeckAuditText(pres: Pick<Presentation, "slides">): string;
/** Compact deck-wide morph summary for copy / support. */
export declare function exportMorphDeckCompactText(pres: Pick<Presentation, "slides">): string;
/** Short issues-only export (unmatched + FLIP-only pairs). */
export declare function exportMorphIssuesCompactText(report: MorphAuditReport, opts?: {
    fromSlide?: number;
    toSlide?: number;
}): string;
/** Plain-text morph audit for copy / export. */
export declare function exportMorphAuditText(report: MorphAuditReport, opts?: {
    fromSlide?: number;
    toSlide?: number;
    filter?: MorphAuditFilter;
}): string;
