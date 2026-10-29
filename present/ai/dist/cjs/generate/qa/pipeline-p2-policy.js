"use strict";
/**
 * Generate pipeline P2 — stage policy (plan → layout → write → motion).
 * Pure helpers for progress mapping + fail semantics. No OOXML / writeback changes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineP2StageError = exports.PIPELINE_P2_WHOLE_JOB_STAGES = exports.PIPELINE_P2_STAGES = void 0;
exports.isPipelineP2WholeJobStage = isPipelineP2WholeJobStage;
exports.isPipelineP2MotionSoftEnd = isPipelineP2MotionSoftEnd;
exports.mapDetailKeyToPipelineP2Stage = mapDetailKeyToPipelineP2Stage;
exports.pipelineP2StepIndex = pipelineP2StepIndex;
exports.resumeSkipFlags = resumeSkipFlags;
exports.resumeStageFromProgress = resumeStageFromProgress;
exports.throwIfPipelineP2Inject = throwIfPipelineP2Inject;
exports.PIPELINE_P2_STAGES = ["plan", "layout", "write", "motion"];
/** Whole-job fail only for plan / layout / write. Motion is soft. */
exports.PIPELINE_P2_WHOLE_JOB_STAGES = ["plan", "layout", "write"];
function isPipelineP2WholeJobStage(stage) {
    return exports.PIPELINE_P2_WHOLE_JOB_STAGES.includes(stage);
}
/** Motion skip/fail keeps gated deck; never whole-job fail. */
function isPipelineP2MotionSoftEnd(detailKey) {
    return detailKey === "animate.skipped" || detailKey === "animate.failed";
}
/**
 * Map pipeline progress detailKey → P2 four-step id (aligned with playground wizard).
 */
function mapDetailKeyToPipelineP2Stage(detailKey) {
    if (!detailKey)
        return null;
    if (detailKey.startsWith("designSpec.") ||
        detailKey.startsWith("outline.") ||
        detailKey.startsWith("research.")) {
        return "plan";
    }
    if (detailKey.startsWith("theme.") ||
        detailKey.startsWith("motion.design") ||
        detailKey === "compile.composing") {
        return "layout";
    }
    if (detailKey === "slide.progress" ||
        detailKey.startsWith("compile.") ||
        detailKey.startsWith("enrich.") ||
        detailKey === "qa.checking" ||
        detailKey === "artDirector.reviewing") {
        return "write";
    }
    if (detailKey.startsWith("animate."))
        return "motion";
    return null;
}
function pipelineP2StepIndex(stage) {
    return exports.PIPELINE_P2_STAGES.indexOf(stage);
}
/** Skip completed stages when continuing a paused / timed-out / failed generate. */
function resumeSkipFlags(stage) {
    const i = stage ? pipelineP2StepIndex(stage) : 0;
    const idx = i < 0 ? 0 : i;
    return {
        skipPlan: idx > 0,
        skipLayout: idx > 1,
        skipWrite: idx > 2,
    };
}
/**
 * Infer the first stage that still needs to run from the last progress event
 * plus whatever outline / deck the host already kept.
 */
function resumeStageFromProgress(detailKey, hasPresentation, hasOrganizedOutline) {
    const p2 = mapDetailKeyToPipelineP2Stage(detailKey);
    if (hasPresentation && (p2 === "motion" || (detailKey?.startsWith("animate.") ?? false))) {
        return "motion";
    }
    if (hasPresentation)
        return "write";
    if (hasOrganizedOutline)
        return "layout";
    return p2 ?? "plan";
}
/** Thrown when a P2 whole-job stage is force-failed (inject / real fault). */
class PipelineP2StageError extends Error {
    stage;
    constructor(stage, message) {
        super(message ?? `pipeline P2 stage failed: ${stage}`);
        this.name = "PipelineP2StageError";
        this.stage = stage;
    }
}
exports.PipelineP2StageError = PipelineP2StageError;
/** Call at stage boundary; throws PipelineP2StageError when inject.failAt matches. */
function throwIfPipelineP2Inject(inject, stage) {
    if (inject?.failAt === stage) {
        throw new PipelineP2StageError(stage);
    }
}
