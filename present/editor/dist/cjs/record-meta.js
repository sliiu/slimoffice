"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIP_RECORD_MODES = exports.RECORD_MODES = exports.PIP_CORNER_PRESETS = exports.PIP_SIZE_PRESETS = void 0;
exports.isLargeRecording = isLargeRecording;
exports.shouldConfirmLargeRecording = shouldConfirmLargeRecording;
exports.pipCanvasCoveragePercent = pipCanvasCoveragePercent;
exports.recordModeLabel = recordModeLabel;
exports.pipCornerLabel = pipCornerLabel;
exports.pipSizeLabel = pipSizeLabel;
exports.formatPipCompositeLayoutLine = formatPipCompositeLayoutLine;
exports.recordingBitrateKbps = recordingBitrateKbps;
exports.summarizeRecording = summarizeRecording;
exports.exportRecordingSummaryText = exportRecordingSummaryText;
exports.exportNarrationSessionText = exportNarrationSessionText;
exports.summarizePipPreferences = summarizePipPreferences;
exports.exportPipPreferencesText = exportPipPreferencesText;
exports.formatPipPreferencesCompactLine = formatPipPreferencesCompactLine;
exports.exportPipPreferencesCompactText = exportPipPreferencesCompactText;
exports.formatRecordingStatsLine = formatRecordingStatsLine;
exports.exportRecordWorkspaceSummaryText = exportRecordWorkspaceSummaryText;
exports.formatPipCoverageLine = formatPipCoverageLine;
exports.exportRecordingCompactText = exportRecordingCompactText;
exports.exportRecordSettingsCompactText = exportRecordSettingsCompactText;
exports.exportRecordWorkspaceCompactText = exportRecordWorkspaceCompactText;
exports.exportNarrationSessionCompactText = exportNarrationSessionCompactText;
exports.formatRecordReadinessLine = formatRecordReadinessLine;
exports.pipCoveragePercentForSize = pipCoveragePercentForSize;
exports.pipSizeWithLargestCoverage = pipSizeWithLargestCoverage;
exports.pipSizeWithSmallestCoverage = pipSizeWithSmallestCoverage;
exports.pipCoveragePercentForCorner = pipCoveragePercentForCorner;
exports.pipCornerWithLargestCoverage = pipCornerWithLargestCoverage;
exports.pipCornerWithSmallestCoverage = pipCornerWithSmallestCoverage;
exports.averagePipCoverageAcrossSizes = averagePipCoverageAcrossSizes;
exports.averagePipCoverageAcrossCorners = averagePipCoverageAcrossCorners;
exports.pipCoverageSpreadPercent = pipCoverageSpreadPercent;
exports.formatPipCoverageSpreadLine = formatPipCoverageSpreadLine;
exports.formatPipCornerCoverageBreakdownLine = formatPipCornerCoverageBreakdownLine;
exports.exportPipCornerCoverageBreakdownText = exportPipCornerCoverageBreakdownText;
exports.formatPipLargestCornerLine = formatPipLargestCornerLine;
exports.formatPipSmallestSizeLine = formatPipSmallestSizeLine;
exports.exportPipCoverageSpreadText = exportPipCoverageSpreadText;
exports.recordModeSupportsPip = recordModeSupportsPip;
exports.recordModesWithoutPip = recordModesWithoutPip;
exports.formatRecordModePipLine = formatRecordModePipLine;
exports.exportRecordModeReadinessText = exportRecordModeReadinessText;
exports.averageRehearseSecondsPerSlide = averageRehearseSecondsPerSlide;
exports.formatNarrationRehearseBreakdownLine = formatNarrationRehearseBreakdownLine;
exports.exportNarrationRehearseBreakdownText = exportNarrationRehearseBreakdownText;
exports.formatPipSizeCoverageBreakdownLine = formatPipSizeCoverageBreakdownLine;
exports.exportPipSizeCoverageBreakdownText = exportPipSizeCoverageBreakdownText;
exports.formatPipReadinessLine = formatPipReadinessLine;
exports.exportPipReadinessText = exportPipReadinessText;
exports.formatRecordWorkspaceStatsLine = formatRecordWorkspaceStatsLine;
exports.exportRecordReadinessText = exportRecordReadinessText;
exports.formatNarrationReadinessLine = formatNarrationReadinessLine;
exports.exportNarrationReadinessText = exportNarrationReadinessText;
exports.exportRecordSettingsText = exportRecordSettingsText;
const i18n_1 = require("./i18n");
const record_composite_1 = require("./record-composite");
const video_export_1 = require("./video-export");
function isLargeRecording(bytes, limit = video_export_1.RECORDING_LARGE_BYTES) {
    return bytes > limit;
}
function shouldConfirmLargeRecording(bytes, limit = video_export_1.RECORDING_LARGE_BYTES) {
    return isLargeRecording(bytes, limit);
}
/** PIP draw area as a percentage of the composite canvas (0–100). */
function pipCanvasCoveragePercent(canvasW, canvasH, prefs) {
    if (canvasW <= 0 || canvasH <= 0)
        return 0;
    const rect = (0, record_composite_1.computePipDrawRect)(canvasW, canvasH, prefs);
    return Math.round(((rect.w * rect.h) / (canvasW * canvasH)) * 100);
}
const RECORD_MODE_KEY = {
    screen: "record.mode.screen",
    camera: "record.mode.camera",
    "screen-camera": "record.mode.screenCamera",
    audio: "record.mode.audio",
};
function recordModeLabel(mode) {
    return (0, i18n_1.t)(RECORD_MODE_KEY[mode]);
}
const PIP_CORNER_KEY = {
    br: "record.pip.corner.br",
    bl: "record.pip.corner.bl",
    tr: "record.pip.corner.tr",
    tl: "record.pip.corner.tl",
};
function pipCornerLabel(corner) {
    return (0, i18n_1.t)(PIP_CORNER_KEY[corner]);
}
const PIP_SIZE_KEY = {
    s: "record.pip.size.s",
    m: "record.pip.size.m",
    l: "record.pip.size.l",
};
function pipSizeLabel(size) {
    return (0, i18n_1.t)(PIP_SIZE_KEY[size]);
}
function stripPipPrefix(s) {
    return s.replace(/^PIP[:：]\s*/, "");
}
/** One-line composite PIP placement summary. */
function formatPipCompositeLayoutLine(canvasW, canvasH, prefs) {
    const rect = (0, record_composite_1.computePipDrawRect)(canvasW, canvasH, prefs);
    return (0, record_composite_1.formatPipDrawRectLine)(rect);
}
/** Estimated average bitrate (kbps) from file size and duration. */
function recordingBitrateKbps(bytes, durationSec) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return null;
    if (!Number.isFinite(durationSec) || durationSec <= 0)
        return null;
    return Math.round((bytes * 8) / durationSec / 1000);
}
function summarizeRecording(input) {
    const lines = ["Recording"];
    if (input.mode)
        lines.push(`Mode: ${recordModeLabel(input.mode)}`);
    lines.push(`Size: ${(0, video_export_1.formatRecordingFileSize)(input.bytes)}${isLargeRecording(input.bytes) ? " (large)" : ""}`);
    if (input.mime) {
        const kind = input.mime.startsWith("audio/") ? "audio" : "video";
        lines.push(`MIME: ${input.mime} (.${(0, video_export_1.extensionForRecordingMime)(input.mime, kind)})`);
    }
    if (input.durationSec != null && input.durationSec > 0) {
        lines.push(`Duration: ${(0, video_export_1.formatRecordingDuration)(input.durationSec)}`);
        const kbps = recordingBitrateKbps(input.bytes, input.durationSec);
        if (kbps != null)
            lines.push(`Bitrate: ~${kbps} kbps`);
    }
    if (input.width && input.height)
        lines.push(`Resolution: ${input.width}×${input.height}`);
    if (input.pipPrefs) {
        const pip = [];
        if (input.pipPrefs.size)
            pip.push(`size ${input.pipPrefs.size}`);
        if (input.pipPrefs.corner)
            pip.push(pipCornerLabel(input.pipPrefs.corner));
        if (input.pipPrefs.mirror === false)
            pip.push("no mirror");
        if (input.pipPrefs.cameraVisible === false)
            pip.push("camera hidden");
        if (input.pipPrefs.micMuted)
            pip.push("mic muted");
        if (pip.length)
            lines.push(`PIP: ${pip.join(", ")}`);
    }
    return lines;
}
function exportRecordingSummaryText(input) {
    return summarizeRecording(input).join("\n");
}
function exportNarrationSessionText(opts) {
    const lines = ["Narration session"];
    if (opts.rehearse && opts.rehearse.slideCount > 0) {
        lines.push(`Slides: ${opts.rehearse.slideCount} · rehearse timing ${(0, video_export_1.formatRecordingDuration)(opts.rehearse.totalSeconds)}`);
    }
    lines.push(...summarizeRecording({
        bytes: opts.bytes,
        mime: opts.mime,
        durationSec: opts.durationSec,
        mode: "audio",
    }).slice(1));
    return lines.join("\n");
}
function summarizePipPreferences(prefs, opts) {
    const lines = [];
    if (prefs.size)
        lines.push(`Size: ${pipSizeLabel(prefs.size)}`);
    if (prefs.corner)
        lines.push(`Corner: ${pipCornerLabel(prefs.corner)}`);
    lines.push(`Mirror: ${prefs.mirror !== false ? "yes" : "no"}`);
    lines.push(`Camera: ${prefs.cameraVisible !== false ? "visible" : "hidden"}`);
    lines.push(`Microphone: ${prefs.micMuted ? "muted" : "live"}`);
    if (prefs.x != null && prefs.y != null) {
        lines.push(`Overlay position: ${Math.round(prefs.x)}, ${Math.round(prefs.y)}`);
    }
    else if (opts?.overlayPosition) {
        lines.push(`Overlay position: ${Math.round(opts.overlayPosition.x)}, ${Math.round(opts.overlayPosition.y)}`);
    }
    if (opts?.compositeSize) {
        lines.push(`Composite layout: ${formatPipCompositeLayoutLine(opts.compositeSize.w, opts.compositeSize.h, prefs)}`);
    }
    return lines;
}
function exportPipPreferencesText(prefs, opts) {
    return ["PIP preferences", ...summarizePipPreferences(prefs, opts)].join("\n");
}
/** One-line PIP preferences for chips and compact copy. */
function formatPipPreferencesCompactLine(prefs, opts) {
    const parts = [];
    if (prefs.size)
        parts.push(pipSizeLabel(prefs.size));
    if (prefs.corner)
        parts.push(pipCornerLabel(prefs.corner));
    if (prefs.mirror === false)
        parts.push((0, i18n_1.t)("record.pip.noMirror"));
    if (prefs.cameraVisible === false)
        parts.push((0, i18n_1.t)("record.pip.cameraHidden"));
    if (prefs.micMuted)
        parts.push((0, i18n_1.t)("record.pip.micMuted"));
    if (opts?.compositeSize) {
        parts.push(formatPipCompositeLayoutLine(opts.compositeSize.w, opts.compositeSize.h, prefs));
    }
    else if (prefs.x != null && prefs.y != null) {
        parts.push(`pos (${Math.round(prefs.x)}, ${Math.round(prefs.y)})`);
    }
    else if (opts?.overlayPosition) {
        parts.push(`pos (${Math.round(opts.overlayPosition.x)}, ${Math.round(opts.overlayPosition.y)})`);
    }
    return parts.length ? (0, i18n_1.t)("record.pip.compact", { parts: parts.join(" · ") }) : (0, i18n_1.t)("record.pip.default");
}
function exportPipPreferencesCompactText(prefs, opts) {
    return ["PIP preferences (compact)", formatPipPreferencesCompactLine(prefs, opts)].join("\n");
}
/** One-line recording stats for status chips and compact export. */
function formatRecordingStatsLine(input) {
    const parts = [];
    if (input.mode)
        parts.push(recordModeLabel(input.mode));
    parts.push((0, video_export_1.formatRecordingFileSize)(input.bytes));
    if (input.durationSec != null && input.durationSec > 0) {
        parts.push((0, video_export_1.formatRecordingDuration)(input.durationSec));
        const kbps = recordingBitrateKbps(input.bytes, input.durationSec);
        if (kbps != null)
            parts.push(`~${kbps} kbps`);
    }
    if (input.width && input.height)
        parts.push(`${input.width}×${input.height}`);
    if (isLargeRecording(input.bytes))
        parts.push("large");
    return parts.join(" · ");
}
/** Plain-text workspace summary (mode + PIP + optional last recording). */
function exportRecordWorkspaceSummaryText(opts) {
    const lines = ["Record workspace summary"];
    if (opts.mode)
        lines.push(`Mode: ${recordModeLabel(opts.mode)}`);
    if (opts.pipPrefs) {
        lines.push(formatPipPreferencesCompactLine(opts.pipPrefs, { compositeSize: opts.compositeSize }));
        if (opts.compositeSize) {
            lines.push(`PIP coverage: ${pipCanvasCoveragePercent(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs)}%`);
        }
    }
    if (opts.recording) {
        lines.push("");
        lines.push(`Last recording: ${formatRecordingStatsLine(opts.recording)}`);
    }
    return lines.join("\n");
}
/** One-line PIP canvas coverage (percent + draw size). */
function formatPipCoverageLine(canvasW, canvasH, prefs) {
    const pct = pipCanvasCoveragePercent(canvasW, canvasH, prefs);
    const rect = (0, record_composite_1.computePipDrawRect)(canvasW, canvasH, prefs);
    return `PIP coverage ${pct}% · ${rect.w}×${rect.h}`;
}
/** Compact recording summary (one-liners). */
function exportRecordingCompactText(input) {
    return ["Recording (compact)", formatRecordingStatsLine(input)].join(" · ");
}
/** Compact record settings (mode + PIP). */
function exportRecordSettingsCompactText(opts) {
    const parts = ["Record settings (compact)"];
    if (opts.mode)
        parts.push(`mode ${recordModeLabel(opts.mode)}`);
    if (opts.pipPrefs) {
        parts.push(formatPipPreferencesCompactLine(opts.pipPrefs, { compositeSize: opts.compositeSize }));
    }
    return parts.join(" · ");
}
/** Compact workspace summary (mode + PIP + optional last recording). */
function exportRecordWorkspaceCompactText(opts) {
    const parts = ["Record workspace (compact)"];
    if (opts.mode)
        parts.push(recordModeLabel(opts.mode));
    if (opts.pipPrefs) {
        parts.push(formatPipPreferencesCompactLine(opts.pipPrefs, { compositeSize: opts.compositeSize }));
        if (opts.compositeSize) {
            parts.push(formatPipCoverageLine(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs));
        }
    }
    if (opts.recording)
        parts.push(formatRecordingStatsLine(opts.recording));
    return parts.join(" · ");
}
/** Compact narration session summary. */
function exportNarrationSessionCompactText(opts) {
    const parts = ["Narration (compact)"];
    if (opts.rehearse?.slideCount) {
        parts.push(`${opts.rehearse.slideCount} slides`);
        parts.push((0, video_export_1.formatRecordingDuration)(opts.rehearse.totalSeconds));
    }
    parts.push(formatRecordingStatsLine({
        bytes: opts.bytes,
        mime: opts.mime,
        durationSec: opts.durationSec,
        mode: "audio",
    }));
    return parts.join(" · ");
}
/** One-line record readiness for status chips. */
function formatRecordReadinessLine(opts) {
    const parts = [opts.mode ? recordModeLabel(opts.mode) : (0, i18n_1.t)("record.mode.none")];
    if (opts.pipPrefs) {
        parts.push(stripPipPrefix(formatPipPreferencesCompactLine(opts.pipPrefs)) || (0, i18n_1.t)("record.pip.fallback"));
        if (opts.compositeSize) {
            parts.push((0, i18n_1.t)("record.pip.coverageShort", {
                n: pipCanvasCoveragePercent(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs),
            }));
        }
    }
    parts.push(opts.hasRecording ? (0, i18n_1.t)("record.status.ready") : (0, i18n_1.t)("record.status.none"));
    if (opts.recordingBytes != null && isLargeRecording(opts.recordingBytes)) {
        parts.push((0, i18n_1.t)("record.status.large"));
    }
    return parts.join(" · ");
}
exports.PIP_SIZE_PRESETS = ["s", "m", "l"];
/** PIP canvas coverage for a single size preset (corner from prefs or br). */
function pipCoveragePercentForSize(canvasW, canvasH, size, corner = "br") {
    return pipCanvasCoveragePercent(canvasW, canvasH, { size, corner });
}
/** Size preset with the largest composite PIP coverage (ties → s < m < l). */
function pipSizeWithLargestCoverage(canvasW, canvasH, corner = "br") {
    let best = "s";
    let bestPct = -1;
    for (const size of exports.PIP_SIZE_PRESETS) {
        const pct = pipCoveragePercentForSize(canvasW, canvasH, size, corner);
        if (pct > bestPct || (pct === bestPct && exports.PIP_SIZE_PRESETS.indexOf(size) > exports.PIP_SIZE_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = size;
        }
    }
    return best;
}
/** Size preset with the smallest composite PIP coverage (ties → s < m < l). */
function pipSizeWithSmallestCoverage(canvasW, canvasH, corner = "br") {
    let best = "s";
    let bestPct = Infinity;
    for (const size of exports.PIP_SIZE_PRESETS) {
        const pct = pipCoveragePercentForSize(canvasW, canvasH, size, corner);
        if (pct < bestPct || (pct === bestPct && exports.PIP_SIZE_PRESETS.indexOf(size) < exports.PIP_SIZE_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = size;
        }
    }
    return best;
}
exports.PIP_CORNER_PRESETS = ["br", "bl", "tr", "tl"];
/** PIP canvas coverage for a single corner preset (size from prefs or m). */
function pipCoveragePercentForCorner(canvasW, canvasH, corner, size = "m") {
    return pipCanvasCoveragePercent(canvasW, canvasH, { size, corner });
}
/** Corner with the largest composite PIP coverage at a fixed size (ties → br < bl < tr < tl). */
function pipCornerWithLargestCoverage(canvasW, canvasH, size = "m") {
    let best = "br";
    let bestPct = -1;
    for (const corner of exports.PIP_CORNER_PRESETS) {
        const pct = pipCoveragePercentForCorner(canvasW, canvasH, corner, size);
        if (pct > bestPct ||
            (pct === bestPct && exports.PIP_CORNER_PRESETS.indexOf(corner) < exports.PIP_CORNER_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = corner;
        }
    }
    return best;
}
/** Corner with the smallest composite PIP coverage at a fixed size (ties → earliest in cycle). */
function pipCornerWithSmallestCoverage(canvasW, canvasH, size = "m") {
    let best = "br";
    let bestPct = Infinity;
    for (const corner of exports.PIP_CORNER_PRESETS) {
        const pct = pipCoveragePercentForCorner(canvasW, canvasH, corner, size);
        if (pct < bestPct ||
            (pct === bestPct && exports.PIP_CORNER_PRESETS.indexOf(corner) < exports.PIP_CORNER_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = corner;
        }
    }
    return best;
}
/** Mean PIP coverage across size presets at a fixed corner. */
function averagePipCoverageAcrossSizes(canvasW, canvasH, corner = "br") {
    if (!exports.PIP_SIZE_PRESETS.length)
        return 0;
    const total = exports.PIP_SIZE_PRESETS.reduce((sum, size) => sum + pipCoveragePercentForSize(canvasW, canvasH, size, corner), 0);
    return Math.round((total / exports.PIP_SIZE_PRESETS.length) * 10) / 10;
}
/** Mean PIP coverage across corners at a fixed size preset. */
function averagePipCoverageAcrossCorners(canvasW, canvasH, size = "m") {
    if (!exports.PIP_CORNER_PRESETS.length)
        return 0;
    const total = exports.PIP_CORNER_PRESETS.reduce((sum, corner) => sum + pipCoveragePercentForCorner(canvasW, canvasH, corner, size), 0);
    return Math.round((total / exports.PIP_CORNER_PRESETS.length) * 10) / 10;
}
/** Difference between large and small PIP coverage at a corner (percentage points). */
function pipCoverageSpreadPercent(canvasW, canvasH, corner = "br") {
    return (pipCoveragePercentForSize(canvasW, canvasH, "l", corner) -
        pipCoveragePercentForSize(canvasW, canvasH, "s", corner));
}
/** One-line PIP size spread at a corner (small → large). */
function formatPipCoverageSpreadLine(canvasW, canvasH, corner = "br") {
    const small = pipCoveragePercentForSize(canvasW, canvasH, "s", corner);
    const large = pipCoveragePercentForSize(canvasW, canvasH, "l", corner);
    return (0, i18n_1.t)("record.pip.spread", {
        small,
        large,
        spread: pipCoverageSpreadPercent(canvasW, canvasH, corner),
    });
}
/** One-line PIP corner coverage breakdown (at a fixed size). */
function formatPipCornerCoverageBreakdownLine(canvasW, canvasH, size = "m") {
    const parts = exports.PIP_CORNER_PRESETS.map((corner) => `${pipCornerLabel(corner)} ${pipCoveragePercentForCorner(canvasW, canvasH, corner, size)}%`);
    return (0, i18n_1.t)("record.pip.cornerCoverage", { parts: parts.join(" · ") });
}
/** Labeled PIP corner coverage breakdown for copy. */
function exportPipCornerCoverageBreakdownText(canvasW, canvasH, size = "m") {
    return ["PIP corner coverage breakdown", formatPipCornerCoverageBreakdownLine(canvasW, canvasH, size)].join("\n");
}
/** One-line largest-corner summary at a size preset. */
function formatPipLargestCornerLine(canvasW, canvasH, size = "m") {
    const corner = pipCornerWithLargestCoverage(canvasW, canvasH, size);
    return `Largest corner: ${pipCornerLabel(corner)} · ${pipCoveragePercentForCorner(canvasW, canvasH, corner, size)}%`;
}
/** One-line smallest-size summary at a corner. */
function formatPipSmallestSizeLine(canvasW, canvasH, corner = "br") {
    const size = pipSizeWithSmallestCoverage(canvasW, canvasH, corner);
    return `Smallest size: ${pipSizeLabel(size)} · ${pipCoveragePercentForSize(canvasW, canvasH, size, corner)}%`;
}
/** Labeled PIP coverage spread export for copy. */
function exportPipCoverageSpreadText(canvasW, canvasH, corner = "br") {
    return [
        "PIP coverage spread",
        formatPipCoverageSpreadLine(canvasW, canvasH, corner),
        `avg size ${averagePipCoverageAcrossSizes(canvasW, canvasH, corner)}%`,
        `avg corner ${averagePipCoverageAcrossCorners(canvasW, canvasH, "m")}%`,
    ].join("\n");
}
exports.RECORD_MODES = ["screen", "camera", "screen-camera", "audio"];
exports.PIP_RECORD_MODES = ["screen-camera"];
/** Whether a record mode uses composite PIP overlay. */
function recordModeSupportsPip(mode) {
    return exports.PIP_RECORD_MODES.includes(mode);
}
/** Record modes that do not use PIP. */
function recordModesWithoutPip() {
    return exports.RECORD_MODES.filter((mode) => !recordModeSupportsPip(mode));
}
/** One-line record mode / PIP capability summary. */
function formatRecordModePipLine(mode) {
    if (!mode) {
        return (0, i18n_1.t)("record.pip.modes", { modes: exports.PIP_RECORD_MODES.map(recordModeLabel).join(", ") });
    }
    return recordModeSupportsPip(mode)
        ? (0, i18n_1.t)("record.pip.supported", { mode: recordModeLabel(mode) })
        : (0, i18n_1.t)("record.pip.notUsed", { mode: recordModeLabel(mode) });
}
/** Labeled record mode readiness export for copy. */
function exportRecordModeReadinessText(opts) {
    const lines = ["Record mode readiness", formatRecordModePipLine(opts.mode)];
    if (opts.compositeSize && opts.mode && recordModeSupportsPip(opts.mode)) {
        lines.push(formatPipCoverageSpreadLine(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs?.corner ?? "br"));
    }
    return lines.join("\n");
}
/** Average rehearse seconds per slide (null if no slides). */
function averageRehearseSecondsPerSlide(rehearse) {
    if (!rehearse?.slideCount)
        return null;
    return Math.round((rehearse.totalSeconds / rehearse.slideCount) * 10) / 10;
}
/** One-line narration rehearse breakdown. */
function formatNarrationRehearseBreakdownLine(rehearse) {
    if (!rehearse?.slideCount)
        return "Rehearse: none";
    const avg = averageRehearseSecondsPerSlide(rehearse);
    const parts = [`${rehearse.slideCount} slide(s)`, (0, video_export_1.formatRecordingDuration)(rehearse.totalSeconds)];
    if (avg != null)
        parts.push(`avg ${avg}s/slide`);
    return `Rehearse: ${parts.join(" · ")}`;
}
/** Labeled narration rehearse breakdown for copy. */
function exportNarrationRehearseBreakdownText(rehearse) {
    return ["Narration rehearse breakdown", formatNarrationRehearseBreakdownLine(rehearse)].join("\n");
}
/** One-line PIP size coverage breakdown (small / medium / large). */
function formatPipSizeCoverageBreakdownLine(canvasW, canvasH, corner = "br") {
    const parts = exports.PIP_SIZE_PRESETS.map((size) => `${pipSizeLabel(size)} ${pipCoveragePercentForSize(canvasW, canvasH, size, corner)}%`);
    return `PIP size coverage: ${parts.join(" · ")}`;
}
/** Labeled PIP size coverage breakdown for copy. */
function exportPipSizeCoverageBreakdownText(canvasW, canvasH, corner = "br") {
    return ["PIP size coverage breakdown", formatPipSizeCoverageBreakdownLine(canvasW, canvasH, corner)].join("\n");
}
/** One-line PIP readiness for overlay chips. */
function formatPipReadinessLine(canvasW, canvasH, prefs) {
    const effective = prefs ?? {};
    const parts = ["PIP ready"];
    if (effective.cameraVisible === false)
        parts.push("camera hidden");
    if (effective.micMuted)
        parts.push("mic muted");
    parts.push(`${pipCanvasCoveragePercent(canvasW, canvasH, effective)}% coverage`);
    const largest = pipSizeWithLargestCoverage(canvasW, canvasH, effective.corner ?? "br");
    if (effective.size && effective.size !== largest) {
        parts.push(`largest ${pipSizeLabel(largest)}`);
    }
    return parts.join(" · ");
}
/** Labeled PIP readiness export for copy. */
function exportPipReadinessText(canvasW, canvasH, prefs) {
    const corner = prefs?.corner ?? "br";
    return [
        "PIP readiness",
        formatPipReadinessLine(canvasW, canvasH, prefs),
        formatPipCoverageLine(canvasW, canvasH, prefs),
        formatPipSizeCoverageBreakdownLine(canvasW, canvasH, corner),
        formatPipCornerCoverageBreakdownLine(canvasW, canvasH, prefs?.size ?? "m"),
        formatPipCoverageSpreadLine(canvasW, canvasH, corner),
    ].join("\n");
}
/** One-line record workspace stats (mode + PIP + optional last recording). */
function formatRecordWorkspaceStatsLine(opts) {
    const parts = [];
    if (opts.mode)
        parts.push(recordModeLabel(opts.mode));
    if (opts.pipPrefs && opts.compositeSize) {
        parts.push(formatPipCoverageLine(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs));
    }
    else if (opts.pipPrefs) {
        parts.push(stripPipPrefix(formatPipPreferencesCompactLine(opts.pipPrefs)) || (0, i18n_1.t)("record.pip.fallback"));
    }
    if (opts.recording)
        parts.push(formatRecordingStatsLine(opts.recording));
    return parts.length ? parts.join(" · ") : "Record workspace: empty";
}
/** Labeled record readiness export for copy. */
function exportRecordReadinessText(opts) {
    const lines = ["Record readiness", formatRecordReadinessLine(opts), formatRecordModePipLine(opts.mode)];
    if (opts.compositeSize) {
        const corner = opts.pipPrefs?.corner ?? "br";
        lines.push(formatPipSizeCoverageBreakdownLine(opts.compositeSize.w, opts.compositeSize.h, corner));
        if (opts.mode && recordModeSupportsPip(opts.mode)) {
            lines.push(formatPipCornerCoverageBreakdownLine(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs?.size));
            lines.push(formatPipCoverageSpreadLine(opts.compositeSize.w, opts.compositeSize.h, corner));
        }
    }
    return lines.join("\n");
}
/** One-line narration readiness for status chips. */
function formatNarrationReadinessLine(opts) {
    const parts = ["Narration ready"];
    if (opts.rehearse?.slideCount) {
        parts.push(`${opts.rehearse.slideCount} slide(s)`);
        parts.push((0, video_export_1.formatRecordingDuration)(opts.rehearse.totalSeconds));
    }
    parts.push(formatRecordingStatsLine({
        bytes: opts.bytes,
        durationSec: opts.durationSec,
        mode: "audio",
    }));
    if (isLargeRecording(opts.bytes))
        parts.push("large file");
    return parts.join(" · ");
}
/** Labeled narration readiness export for copy. */
function exportNarrationReadinessText(opts) {
    return [
        "Narration readiness",
        formatNarrationReadinessLine(opts),
        formatNarrationRehearseBreakdownLine(opts.rehearse),
    ].join("\n");
}
function exportRecordSettingsText(opts) {
    const lines = ["Record settings"];
    if (opts.mode)
        lines.push(`Default mode: ${recordModeLabel(opts.mode)}`);
    if (opts.pipPrefs) {
        lines.push("");
        lines.push(...exportPipPreferencesText(opts.pipPrefs, { compositeSize: opts.compositeSize }).split("\n"));
    }
    return lines.join("\n");
}
