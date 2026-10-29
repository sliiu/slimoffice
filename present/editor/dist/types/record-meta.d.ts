import type { RecordMode } from "./record-dialog.js";
import type { PipCorner, PipPreferences, PipSizePreset } from "./record-show-overlay.js";
export declare function isLargeRecording(bytes: number, limit?: number): boolean;
export declare function shouldConfirmLargeRecording(bytes: number, limit?: number): boolean;
/** PIP draw area as a percentage of the composite canvas (0–100). */
export declare function pipCanvasCoveragePercent(canvasW: number, canvasH: number, prefs?: PipPreferences): number;
export declare function recordModeLabel(mode: RecordMode): string;
export declare function pipCornerLabel(corner: PipCorner): string;
export declare function pipSizeLabel(size: PipSizePreset): string;
/** One-line composite PIP placement summary. */
export declare function formatPipCompositeLayoutLine(canvasW: number, canvasH: number, prefs?: PipPreferences): string;
/** Estimated average bitrate (kbps) from file size and duration. */
export declare function recordingBitrateKbps(bytes: number, durationSec: number): number | null;
export interface RecordingSummaryInput {
    mode?: RecordMode;
    bytes: number;
    mime?: string;
    durationSec?: number;
    width?: number;
    height?: number;
    pipPrefs?: PipPreferences;
}
export declare function summarizeRecording(input: RecordingSummaryInput): string[];
export declare function exportRecordingSummaryText(input: RecordingSummaryInput): string;
export declare function exportNarrationSessionText(opts: {
    bytes: number;
    durationSec?: number;
    mime?: string;
    rehearse?: {
        slideCount: number;
        totalSeconds: number;
    };
}): string;
export declare function summarizePipPreferences(prefs: PipPreferences, opts?: {
    overlayPosition?: {
        x: number;
        y: number;
    };
    compositeSize?: {
        w: number;
        h: number;
    };
}): string[];
export declare function exportPipPreferencesText(prefs: PipPreferences, opts?: {
    overlayPosition?: {
        x: number;
        y: number;
    };
    compositeSize?: {
        w: number;
        h: number;
    };
}): string;
/** One-line PIP preferences for chips and compact copy. */
export declare function formatPipPreferencesCompactLine(prefs: PipPreferences, opts?: {
    overlayPosition?: {
        x: number;
        y: number;
    };
    compositeSize?: {
        w: number;
        h: number;
    };
}): string;
export declare function exportPipPreferencesCompactText(prefs: PipPreferences, opts?: {
    overlayPosition?: {
        x: number;
        y: number;
    };
    compositeSize?: {
        w: number;
        h: number;
    };
}): string;
/** One-line recording stats for status chips and compact export. */
export declare function formatRecordingStatsLine(input: RecordingSummaryInput): string;
/** Plain-text workspace summary (mode + PIP + optional last recording). */
export declare function exportRecordWorkspaceSummaryText(opts: {
    mode?: RecordMode;
    pipPrefs?: PipPreferences;
    compositeSize?: {
        w: number;
        h: number;
    };
    recording?: RecordingSummaryInput;
}): string;
/** One-line PIP canvas coverage (percent + draw size). */
export declare function formatPipCoverageLine(canvasW: number, canvasH: number, prefs?: PipPreferences): string;
/** Compact recording summary (one-liners). */
export declare function exportRecordingCompactText(input: RecordingSummaryInput): string;
/** Compact record settings (mode + PIP). */
export declare function exportRecordSettingsCompactText(opts: {
    mode?: RecordMode;
    pipPrefs?: PipPreferences;
    compositeSize?: {
        w: number;
        h: number;
    };
}): string;
/** Compact workspace summary (mode + PIP + optional last recording). */
export declare function exportRecordWorkspaceCompactText(opts: {
    mode?: RecordMode;
    pipPrefs?: PipPreferences;
    compositeSize?: {
        w: number;
        h: number;
    };
    recording?: RecordingSummaryInput;
}): string;
/** Compact narration session summary. */
export declare function exportNarrationSessionCompactText(opts: {
    bytes: number;
    durationSec?: number;
    mime?: string;
    rehearse?: {
        slideCount: number;
        totalSeconds: number;
    };
}): string;
/** One-line record readiness for status chips. */
export declare function formatRecordReadinessLine(opts: {
    mode?: RecordMode;
    pipPrefs?: PipPreferences;
    hasRecording?: boolean;
    recordingBytes?: number;
    compositeSize?: {
        w: number;
        h: number;
    };
}): string;
export declare const PIP_SIZE_PRESETS: readonly PipSizePreset[];
/** PIP canvas coverage for a single size preset (corner from prefs or br). */
export declare function pipCoveragePercentForSize(canvasW: number, canvasH: number, size: PipSizePreset, corner?: PipCorner): number;
/** Size preset with the largest composite PIP coverage (ties → s < m < l). */
export declare function pipSizeWithLargestCoverage(canvasW: number, canvasH: number, corner?: PipCorner): PipSizePreset;
/** Size preset with the smallest composite PIP coverage (ties → s < m < l). */
export declare function pipSizeWithSmallestCoverage(canvasW: number, canvasH: number, corner?: PipCorner): PipSizePreset;
export declare const PIP_CORNER_PRESETS: readonly PipCorner[];
/** PIP canvas coverage for a single corner preset (size from prefs or m). */
export declare function pipCoveragePercentForCorner(canvasW: number, canvasH: number, corner: PipCorner, size?: PipSizePreset): number;
/** Corner with the largest composite PIP coverage at a fixed size (ties → br < bl < tr < tl). */
export declare function pipCornerWithLargestCoverage(canvasW: number, canvasH: number, size?: PipSizePreset): PipCorner;
/** Corner with the smallest composite PIP coverage at a fixed size (ties → earliest in cycle). */
export declare function pipCornerWithSmallestCoverage(canvasW: number, canvasH: number, size?: PipSizePreset): PipCorner;
/** Mean PIP coverage across size presets at a fixed corner. */
export declare function averagePipCoverageAcrossSizes(canvasW: number, canvasH: number, corner?: PipCorner): number;
/** Mean PIP coverage across corners at a fixed size preset. */
export declare function averagePipCoverageAcrossCorners(canvasW: number, canvasH: number, size?: PipSizePreset): number;
/** Difference between large and small PIP coverage at a corner (percentage points). */
export declare function pipCoverageSpreadPercent(canvasW: number, canvasH: number, corner?: PipCorner): number;
/** One-line PIP size spread at a corner (small → large). */
export declare function formatPipCoverageSpreadLine(canvasW: number, canvasH: number, corner?: PipCorner): string;
/** One-line PIP corner coverage breakdown (at a fixed size). */
export declare function formatPipCornerCoverageBreakdownLine(canvasW: number, canvasH: number, size?: PipSizePreset): string;
/** Labeled PIP corner coverage breakdown for copy. */
export declare function exportPipCornerCoverageBreakdownText(canvasW: number, canvasH: number, size?: PipSizePreset): string;
/** One-line largest-corner summary at a size preset. */
export declare function formatPipLargestCornerLine(canvasW: number, canvasH: number, size?: PipSizePreset): string;
/** One-line smallest-size summary at a corner. */
export declare function formatPipSmallestSizeLine(canvasW: number, canvasH: number, corner?: PipCorner): string;
/** Labeled PIP coverage spread export for copy. */
export declare function exportPipCoverageSpreadText(canvasW: number, canvasH: number, corner?: PipCorner): string;
export declare const RECORD_MODES: readonly RecordMode[];
export declare const PIP_RECORD_MODES: readonly RecordMode[];
/** Whether a record mode uses composite PIP overlay. */
export declare function recordModeSupportsPip(mode: RecordMode): boolean;
/** Record modes that do not use PIP. */
export declare function recordModesWithoutPip(): RecordMode[];
/** One-line record mode / PIP capability summary. */
export declare function formatRecordModePipLine(mode?: RecordMode): string;
/** Labeled record mode readiness export for copy. */
export declare function exportRecordModeReadinessText(opts: {
    mode?: RecordMode;
    compositeSize?: {
        w: number;
        h: number;
    };
    pipPrefs?: PipPreferences;
}): string;
/** Average rehearse seconds per slide (null if no slides). */
export declare function averageRehearseSecondsPerSlide(rehearse?: {
    slideCount: number;
    totalSeconds: number;
}): number | null;
/** One-line narration rehearse breakdown. */
export declare function formatNarrationRehearseBreakdownLine(rehearse?: {
    slideCount: number;
    totalSeconds: number;
}): string;
/** Labeled narration rehearse breakdown for copy. */
export declare function exportNarrationRehearseBreakdownText(rehearse?: {
    slideCount: number;
    totalSeconds: number;
}): string;
/** One-line PIP size coverage breakdown (small / medium / large). */
export declare function formatPipSizeCoverageBreakdownLine(canvasW: number, canvasH: number, corner?: PipCorner): string;
/** Labeled PIP size coverage breakdown for copy. */
export declare function exportPipSizeCoverageBreakdownText(canvasW: number, canvasH: number, corner?: PipCorner): string;
/** One-line PIP readiness for overlay chips. */
export declare function formatPipReadinessLine(canvasW: number, canvasH: number, prefs?: PipPreferences): string;
/** Labeled PIP readiness export for copy. */
export declare function exportPipReadinessText(canvasW: number, canvasH: number, prefs?: PipPreferences): string;
/** One-line record workspace stats (mode + PIP + optional last recording). */
export declare function formatRecordWorkspaceStatsLine(opts: {
    mode?: RecordMode;
    pipPrefs?: PipPreferences;
    compositeSize?: {
        w: number;
        h: number;
    };
    recording?: RecordingSummaryInput;
}): string;
/** Labeled record readiness export for copy. */
export declare function exportRecordReadinessText(opts: {
    mode?: RecordMode;
    pipPrefs?: PipPreferences;
    hasRecording?: boolean;
    recordingBytes?: number;
    compositeSize?: {
        w: number;
        h: number;
    };
}): string;
/** One-line narration readiness for status chips. */
export declare function formatNarrationReadinessLine(opts: {
    bytes: number;
    durationSec?: number;
    rehearse?: {
        slideCount: number;
        totalSeconds: number;
    };
}): string;
/** Labeled narration readiness export for copy. */
export declare function exportNarrationReadinessText(opts: {
    bytes: number;
    durationSec?: number;
    mime?: string;
    rehearse?: {
        slideCount: number;
        totalSeconds: number;
    };
}): string;
export declare function exportRecordSettingsText(opts: {
    mode?: RecordMode;
    pipPrefs?: PipPreferences;
    compositeSize?: {
        w: number;
        h: number;
    };
}): string;
