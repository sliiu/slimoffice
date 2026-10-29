import { t } from "./i18n/index.js";
import { computePipDrawRect, formatPipDrawRectLine } from "./record-composite.js";
import { extensionForRecordingMime, formatRecordingDuration, formatRecordingFileSize, RECORDING_LARGE_BYTES, } from "./video-export.js";
export function isLargeRecording(bytes, limit = RECORDING_LARGE_BYTES) {
    return bytes > limit;
}
export function shouldConfirmLargeRecording(bytes, limit = RECORDING_LARGE_BYTES) {
    return isLargeRecording(bytes, limit);
}
/** PIP draw area as a percentage of the composite canvas (0–100). */
export function pipCanvasCoveragePercent(canvasW, canvasH, prefs) {
    if (canvasW <= 0 || canvasH <= 0)
        return 0;
    const rect = computePipDrawRect(canvasW, canvasH, prefs);
    return Math.round(((rect.w * rect.h) / (canvasW * canvasH)) * 100);
}
const RECORD_MODE_KEY = {
    screen: "record.mode.screen",
    camera: "record.mode.camera",
    "screen-camera": "record.mode.screenCamera",
    audio: "record.mode.audio",
};
export function recordModeLabel(mode) {
    return t(RECORD_MODE_KEY[mode]);
}
const PIP_CORNER_KEY = {
    br: "record.pip.corner.br",
    bl: "record.pip.corner.bl",
    tr: "record.pip.corner.tr",
    tl: "record.pip.corner.tl",
};
export function pipCornerLabel(corner) {
    return t(PIP_CORNER_KEY[corner]);
}
const PIP_SIZE_KEY = {
    s: "record.pip.size.s",
    m: "record.pip.size.m",
    l: "record.pip.size.l",
};
export function pipSizeLabel(size) {
    return t(PIP_SIZE_KEY[size]);
}
function stripPipPrefix(s) {
    return s.replace(/^PIP[:：]\s*/, "");
}
/** One-line composite PIP placement summary. */
export function formatPipCompositeLayoutLine(canvasW, canvasH, prefs) {
    const rect = computePipDrawRect(canvasW, canvasH, prefs);
    return formatPipDrawRectLine(rect);
}
/** Estimated average bitrate (kbps) from file size and duration. */
export function recordingBitrateKbps(bytes, durationSec) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return null;
    if (!Number.isFinite(durationSec) || durationSec <= 0)
        return null;
    return Math.round((bytes * 8) / durationSec / 1000);
}
export function summarizeRecording(input) {
    const lines = ["Recording"];
    if (input.mode)
        lines.push(`Mode: ${recordModeLabel(input.mode)}`);
    lines.push(`Size: ${formatRecordingFileSize(input.bytes)}${isLargeRecording(input.bytes) ? " (large)" : ""}`);
    if (input.mime) {
        const kind = input.mime.startsWith("audio/") ? "audio" : "video";
        lines.push(`MIME: ${input.mime} (.${extensionForRecordingMime(input.mime, kind)})`);
    }
    if (input.durationSec != null && input.durationSec > 0) {
        lines.push(`Duration: ${formatRecordingDuration(input.durationSec)}`);
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
export function exportRecordingSummaryText(input) {
    return summarizeRecording(input).join("\n");
}
export function exportNarrationSessionText(opts) {
    const lines = ["Narration session"];
    if (opts.rehearse && opts.rehearse.slideCount > 0) {
        lines.push(`Slides: ${opts.rehearse.slideCount} · rehearse timing ${formatRecordingDuration(opts.rehearse.totalSeconds)}`);
    }
    lines.push(...summarizeRecording({
        bytes: opts.bytes,
        mime: opts.mime,
        durationSec: opts.durationSec,
        mode: "audio",
    }).slice(1));
    return lines.join("\n");
}
export function summarizePipPreferences(prefs, opts) {
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
export function exportPipPreferencesText(prefs, opts) {
    return ["PIP preferences", ...summarizePipPreferences(prefs, opts)].join("\n");
}
/** One-line PIP preferences for chips and compact copy. */
export function formatPipPreferencesCompactLine(prefs, opts) {
    const parts = [];
    if (prefs.size)
        parts.push(pipSizeLabel(prefs.size));
    if (prefs.corner)
        parts.push(pipCornerLabel(prefs.corner));
    if (prefs.mirror === false)
        parts.push(t("record.pip.noMirror"));
    if (prefs.cameraVisible === false)
        parts.push(t("record.pip.cameraHidden"));
    if (prefs.micMuted)
        parts.push(t("record.pip.micMuted"));
    if (opts?.compositeSize) {
        parts.push(formatPipCompositeLayoutLine(opts.compositeSize.w, opts.compositeSize.h, prefs));
    }
    else if (prefs.x != null && prefs.y != null) {
        parts.push(`pos (${Math.round(prefs.x)}, ${Math.round(prefs.y)})`);
    }
    else if (opts?.overlayPosition) {
        parts.push(`pos (${Math.round(opts.overlayPosition.x)}, ${Math.round(opts.overlayPosition.y)})`);
    }
    return parts.length ? t("record.pip.compact", { parts: parts.join(" · ") }) : t("record.pip.default");
}
export function exportPipPreferencesCompactText(prefs, opts) {
    return ["PIP preferences (compact)", formatPipPreferencesCompactLine(prefs, opts)].join("\n");
}
/** One-line recording stats for status chips and compact export. */
export function formatRecordingStatsLine(input) {
    const parts = [];
    if (input.mode)
        parts.push(recordModeLabel(input.mode));
    parts.push(formatRecordingFileSize(input.bytes));
    if (input.durationSec != null && input.durationSec > 0) {
        parts.push(formatRecordingDuration(input.durationSec));
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
export function exportRecordWorkspaceSummaryText(opts) {
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
export function formatPipCoverageLine(canvasW, canvasH, prefs) {
    const pct = pipCanvasCoveragePercent(canvasW, canvasH, prefs);
    const rect = computePipDrawRect(canvasW, canvasH, prefs);
    return `PIP coverage ${pct}% · ${rect.w}×${rect.h}`;
}
/** Compact recording summary (one-liners). */
export function exportRecordingCompactText(input) {
    return ["Recording (compact)", formatRecordingStatsLine(input)].join(" · ");
}
/** Compact record settings (mode + PIP). */
export function exportRecordSettingsCompactText(opts) {
    const parts = ["Record settings (compact)"];
    if (opts.mode)
        parts.push(`mode ${recordModeLabel(opts.mode)}`);
    if (opts.pipPrefs) {
        parts.push(formatPipPreferencesCompactLine(opts.pipPrefs, { compositeSize: opts.compositeSize }));
    }
    return parts.join(" · ");
}
/** Compact workspace summary (mode + PIP + optional last recording). */
export function exportRecordWorkspaceCompactText(opts) {
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
export function exportNarrationSessionCompactText(opts) {
    const parts = ["Narration (compact)"];
    if (opts.rehearse?.slideCount) {
        parts.push(`${opts.rehearse.slideCount} slides`);
        parts.push(formatRecordingDuration(opts.rehearse.totalSeconds));
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
export function formatRecordReadinessLine(opts) {
    const parts = [opts.mode ? recordModeLabel(opts.mode) : t("record.mode.none")];
    if (opts.pipPrefs) {
        parts.push(stripPipPrefix(formatPipPreferencesCompactLine(opts.pipPrefs)) || t("record.pip.fallback"));
        if (opts.compositeSize) {
            parts.push(t("record.pip.coverageShort", {
                n: pipCanvasCoveragePercent(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs),
            }));
        }
    }
    parts.push(opts.hasRecording ? t("record.status.ready") : t("record.status.none"));
    if (opts.recordingBytes != null && isLargeRecording(opts.recordingBytes)) {
        parts.push(t("record.status.large"));
    }
    return parts.join(" · ");
}
export const PIP_SIZE_PRESETS = ["s", "m", "l"];
/** PIP canvas coverage for a single size preset (corner from prefs or br). */
export function pipCoveragePercentForSize(canvasW, canvasH, size, corner = "br") {
    return pipCanvasCoveragePercent(canvasW, canvasH, { size, corner });
}
/** Size preset with the largest composite PIP coverage (ties → s < m < l). */
export function pipSizeWithLargestCoverage(canvasW, canvasH, corner = "br") {
    let best = "s";
    let bestPct = -1;
    for (const size of PIP_SIZE_PRESETS) {
        const pct = pipCoveragePercentForSize(canvasW, canvasH, size, corner);
        if (pct > bestPct || (pct === bestPct && PIP_SIZE_PRESETS.indexOf(size) > PIP_SIZE_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = size;
        }
    }
    return best;
}
/** Size preset with the smallest composite PIP coverage (ties → s < m < l). */
export function pipSizeWithSmallestCoverage(canvasW, canvasH, corner = "br") {
    let best = "s";
    let bestPct = Infinity;
    for (const size of PIP_SIZE_PRESETS) {
        const pct = pipCoveragePercentForSize(canvasW, canvasH, size, corner);
        if (pct < bestPct || (pct === bestPct && PIP_SIZE_PRESETS.indexOf(size) < PIP_SIZE_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = size;
        }
    }
    return best;
}
export const PIP_CORNER_PRESETS = ["br", "bl", "tr", "tl"];
/** PIP canvas coverage for a single corner preset (size from prefs or m). */
export function pipCoveragePercentForCorner(canvasW, canvasH, corner, size = "m") {
    return pipCanvasCoveragePercent(canvasW, canvasH, { size, corner });
}
/** Corner with the largest composite PIP coverage at a fixed size (ties → br < bl < tr < tl). */
export function pipCornerWithLargestCoverage(canvasW, canvasH, size = "m") {
    let best = "br";
    let bestPct = -1;
    for (const corner of PIP_CORNER_PRESETS) {
        const pct = pipCoveragePercentForCorner(canvasW, canvasH, corner, size);
        if (pct > bestPct ||
            (pct === bestPct && PIP_CORNER_PRESETS.indexOf(corner) < PIP_CORNER_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = corner;
        }
    }
    return best;
}
/** Corner with the smallest composite PIP coverage at a fixed size (ties → earliest in cycle). */
export function pipCornerWithSmallestCoverage(canvasW, canvasH, size = "m") {
    let best = "br";
    let bestPct = Infinity;
    for (const corner of PIP_CORNER_PRESETS) {
        const pct = pipCoveragePercentForCorner(canvasW, canvasH, corner, size);
        if (pct < bestPct ||
            (pct === bestPct && PIP_CORNER_PRESETS.indexOf(corner) < PIP_CORNER_PRESETS.indexOf(best))) {
            bestPct = pct;
            best = corner;
        }
    }
    return best;
}
/** Mean PIP coverage across size presets at a fixed corner. */
export function averagePipCoverageAcrossSizes(canvasW, canvasH, corner = "br") {
    if (!PIP_SIZE_PRESETS.length)
        return 0;
    const total = PIP_SIZE_PRESETS.reduce((sum, size) => sum + pipCoveragePercentForSize(canvasW, canvasH, size, corner), 0);
    return Math.round((total / PIP_SIZE_PRESETS.length) * 10) / 10;
}
/** Mean PIP coverage across corners at a fixed size preset. */
export function averagePipCoverageAcrossCorners(canvasW, canvasH, size = "m") {
    if (!PIP_CORNER_PRESETS.length)
        return 0;
    const total = PIP_CORNER_PRESETS.reduce((sum, corner) => sum + pipCoveragePercentForCorner(canvasW, canvasH, corner, size), 0);
    return Math.round((total / PIP_CORNER_PRESETS.length) * 10) / 10;
}
/** Difference between large and small PIP coverage at a corner (percentage points). */
export function pipCoverageSpreadPercent(canvasW, canvasH, corner = "br") {
    return (pipCoveragePercentForSize(canvasW, canvasH, "l", corner) -
        pipCoveragePercentForSize(canvasW, canvasH, "s", corner));
}
/** One-line PIP size spread at a corner (small → large). */
export function formatPipCoverageSpreadLine(canvasW, canvasH, corner = "br") {
    const small = pipCoveragePercentForSize(canvasW, canvasH, "s", corner);
    const large = pipCoveragePercentForSize(canvasW, canvasH, "l", corner);
    return t("record.pip.spread", {
        small,
        large,
        spread: pipCoverageSpreadPercent(canvasW, canvasH, corner),
    });
}
/** One-line PIP corner coverage breakdown (at a fixed size). */
export function formatPipCornerCoverageBreakdownLine(canvasW, canvasH, size = "m") {
    const parts = PIP_CORNER_PRESETS.map((corner) => `${pipCornerLabel(corner)} ${pipCoveragePercentForCorner(canvasW, canvasH, corner, size)}%`);
    return t("record.pip.cornerCoverage", { parts: parts.join(" · ") });
}
/** Labeled PIP corner coverage breakdown for copy. */
export function exportPipCornerCoverageBreakdownText(canvasW, canvasH, size = "m") {
    return ["PIP corner coverage breakdown", formatPipCornerCoverageBreakdownLine(canvasW, canvasH, size)].join("\n");
}
/** One-line largest-corner summary at a size preset. */
export function formatPipLargestCornerLine(canvasW, canvasH, size = "m") {
    const corner = pipCornerWithLargestCoverage(canvasW, canvasH, size);
    return `Largest corner: ${pipCornerLabel(corner)} · ${pipCoveragePercentForCorner(canvasW, canvasH, corner, size)}%`;
}
/** One-line smallest-size summary at a corner. */
export function formatPipSmallestSizeLine(canvasW, canvasH, corner = "br") {
    const size = pipSizeWithSmallestCoverage(canvasW, canvasH, corner);
    return `Smallest size: ${pipSizeLabel(size)} · ${pipCoveragePercentForSize(canvasW, canvasH, size, corner)}%`;
}
/** Labeled PIP coverage spread export for copy. */
export function exportPipCoverageSpreadText(canvasW, canvasH, corner = "br") {
    return [
        "PIP coverage spread",
        formatPipCoverageSpreadLine(canvasW, canvasH, corner),
        `avg size ${averagePipCoverageAcrossSizes(canvasW, canvasH, corner)}%`,
        `avg corner ${averagePipCoverageAcrossCorners(canvasW, canvasH, "m")}%`,
    ].join("\n");
}
export const RECORD_MODES = ["screen", "camera", "screen-camera", "audio"];
export const PIP_RECORD_MODES = ["screen-camera"];
/** Whether a record mode uses composite PIP overlay. */
export function recordModeSupportsPip(mode) {
    return PIP_RECORD_MODES.includes(mode);
}
/** Record modes that do not use PIP. */
export function recordModesWithoutPip() {
    return RECORD_MODES.filter((mode) => !recordModeSupportsPip(mode));
}
/** One-line record mode / PIP capability summary. */
export function formatRecordModePipLine(mode) {
    if (!mode) {
        return t("record.pip.modes", { modes: PIP_RECORD_MODES.map(recordModeLabel).join(", ") });
    }
    return recordModeSupportsPip(mode)
        ? t("record.pip.supported", { mode: recordModeLabel(mode) })
        : t("record.pip.notUsed", { mode: recordModeLabel(mode) });
}
/** Labeled record mode readiness export for copy. */
export function exportRecordModeReadinessText(opts) {
    const lines = ["Record mode readiness", formatRecordModePipLine(opts.mode)];
    if (opts.compositeSize && opts.mode && recordModeSupportsPip(opts.mode)) {
        lines.push(formatPipCoverageSpreadLine(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs?.corner ?? "br"));
    }
    return lines.join("\n");
}
/** Average rehearse seconds per slide (null if no slides). */
export function averageRehearseSecondsPerSlide(rehearse) {
    if (!rehearse?.slideCount)
        return null;
    return Math.round((rehearse.totalSeconds / rehearse.slideCount) * 10) / 10;
}
/** One-line narration rehearse breakdown. */
export function formatNarrationRehearseBreakdownLine(rehearse) {
    if (!rehearse?.slideCount)
        return "Rehearse: none";
    const avg = averageRehearseSecondsPerSlide(rehearse);
    const parts = [`${rehearse.slideCount} slide(s)`, formatRecordingDuration(rehearse.totalSeconds)];
    if (avg != null)
        parts.push(`avg ${avg}s/slide`);
    return `Rehearse: ${parts.join(" · ")}`;
}
/** Labeled narration rehearse breakdown for copy. */
export function exportNarrationRehearseBreakdownText(rehearse) {
    return ["Narration rehearse breakdown", formatNarrationRehearseBreakdownLine(rehearse)].join("\n");
}
/** One-line PIP size coverage breakdown (small / medium / large). */
export function formatPipSizeCoverageBreakdownLine(canvasW, canvasH, corner = "br") {
    const parts = PIP_SIZE_PRESETS.map((size) => `${pipSizeLabel(size)} ${pipCoveragePercentForSize(canvasW, canvasH, size, corner)}%`);
    return `PIP size coverage: ${parts.join(" · ")}`;
}
/** Labeled PIP size coverage breakdown for copy. */
export function exportPipSizeCoverageBreakdownText(canvasW, canvasH, corner = "br") {
    return ["PIP size coverage breakdown", formatPipSizeCoverageBreakdownLine(canvasW, canvasH, corner)].join("\n");
}
/** One-line PIP readiness for overlay chips. */
export function formatPipReadinessLine(canvasW, canvasH, prefs) {
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
export function exportPipReadinessText(canvasW, canvasH, prefs) {
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
export function formatRecordWorkspaceStatsLine(opts) {
    const parts = [];
    if (opts.mode)
        parts.push(recordModeLabel(opts.mode));
    if (opts.pipPrefs && opts.compositeSize) {
        parts.push(formatPipCoverageLine(opts.compositeSize.w, opts.compositeSize.h, opts.pipPrefs));
    }
    else if (opts.pipPrefs) {
        parts.push(stripPipPrefix(formatPipPreferencesCompactLine(opts.pipPrefs)) || t("record.pip.fallback"));
    }
    if (opts.recording)
        parts.push(formatRecordingStatsLine(opts.recording));
    return parts.length ? parts.join(" · ") : "Record workspace: empty";
}
/** Labeled record readiness export for copy. */
export function exportRecordReadinessText(opts) {
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
export function formatNarrationReadinessLine(opts) {
    const parts = ["Narration ready"];
    if (opts.rehearse?.slideCount) {
        parts.push(`${opts.rehearse.slideCount} slide(s)`);
        parts.push(formatRecordingDuration(opts.rehearse.totalSeconds));
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
export function exportNarrationReadinessText(opts) {
    return [
        "Narration readiness",
        formatNarrationReadinessLine(opts),
        formatNarrationRehearseBreakdownLine(opts.rehearse),
    ].join("\n");
}
export function exportRecordSettingsText(opts) {
    const lines = ["Record settings"];
    if (opts.mode)
        lines.push(`Default mode: ${recordModeLabel(opts.mode)}`);
    if (opts.pipPrefs) {
        lines.push("");
        lines.push(...exportPipPreferencesText(opts.pipPrefs, { compositeSize: opts.compositeSize }).split("\n"));
    }
    return lines.join("\n");
}
