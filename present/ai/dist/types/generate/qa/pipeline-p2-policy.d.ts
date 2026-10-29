/**
 * Generate pipeline P2 — stage policy (plan → layout → write → motion).
 * Pure helpers for progress mapping + fail semantics. No OOXML / writeback changes.
 */
export declare const PIPELINE_P2_STAGES: readonly ["plan", "layout", "write", "motion"];
export type PipelineP2Stage = (typeof PIPELINE_P2_STAGES)[number];
/** Whole-job fail only for plan / layout / write. Motion is soft. */
export declare const PIPELINE_P2_WHOLE_JOB_STAGES: readonly PipelineP2Stage[];
export declare function isPipelineP2WholeJobStage(stage: PipelineP2Stage): boolean;
/** Motion skip/fail keeps gated deck; never whole-job fail. */
export declare function isPipelineP2MotionSoftEnd(detailKey: string | undefined | null): boolean;
/**
 * Map pipeline progress detailKey → P2 four-step id (aligned with playground wizard).
 */
export declare function mapDetailKeyToPipelineP2Stage(detailKey: string | undefined | null): PipelineP2Stage | null;
export declare function pipelineP2StepIndex(stage: PipelineP2Stage): number;
/** Skip completed stages when continuing a paused / timed-out / failed generate. */
export declare function resumeSkipFlags(stage?: PipelineP2Stage | null): {
    skipPlan: boolean;
    skipLayout: boolean;
    skipWrite: boolean;
};
/**
 * Infer the first stage that still needs to run from the last progress event
 * plus whatever outline / deck the host already kept.
 */
export declare function resumeStageFromProgress(detailKey: string | undefined | null, hasPresentation: boolean, hasOrganizedOutline: boolean): PipelineP2Stage;
/** Thrown when a P2 whole-job stage is force-failed (inject / real fault). */
export declare class PipelineP2StageError extends Error {
    readonly stage: PipelineP2Stage;
    constructor(stage: PipelineP2Stage, message?: string);
}
export type PipelineP2Inject = {
    /** Test/dev only: fail when leaving this whole-job stage (before any success deck). */
    failAt?: "plan" | "layout" | "write";
};
/** Call at stage boundary; throws PipelineP2StageError when inject.failAt matches. */
export declare function throwIfPipelineP2Inject(inject: PipelineP2Inject | undefined | null, stage: "plan" | "layout" | "write"): void;
