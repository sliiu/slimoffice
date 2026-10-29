/**
 * Generate pipeline P2 — stage policy (plan → layout → write → motion).
 * Pure helpers for progress mapping + fail semantics. No OOXML / writeback changes.
 */

export const PIPELINE_P2_STAGES = ["plan", "layout", "write", "motion"] as const;
export type PipelineP2Stage = (typeof PIPELINE_P2_STAGES)[number];

/** Whole-job fail only for plan / layout / write. Motion is soft. */
export const PIPELINE_P2_WHOLE_JOB_STAGES: readonly PipelineP2Stage[] = ["plan", "layout", "write"];

export function isPipelineP2WholeJobStage(stage: PipelineP2Stage): boolean {
  return (PIPELINE_P2_WHOLE_JOB_STAGES as readonly string[]).includes(stage);
}

/** Motion skip/fail keeps gated deck; never whole-job fail. */
export function isPipelineP2MotionSoftEnd(detailKey: string | undefined | null): boolean {
  return detailKey === "animate.skipped" || detailKey === "animate.failed";
}

/**
 * Map pipeline progress detailKey → P2 four-step id (aligned with playground wizard).
 */
export function mapDetailKeyToPipelineP2Stage(
  detailKey: string | undefined | null,
): PipelineP2Stage | null {
  if (!detailKey) return null;
  if (
    detailKey.startsWith("designSpec.") ||
    detailKey.startsWith("outline.") ||
    detailKey.startsWith("research.")
  ) {
    return "plan";
  }
  if (
    detailKey.startsWith("theme.") ||
    detailKey.startsWith("motion.design") ||
    detailKey === "compile.composing"
  ) {
    return "layout";
  }
  if (
    detailKey === "slide.progress" ||
    detailKey.startsWith("compile.") ||
    detailKey.startsWith("enrich.") ||
    detailKey === "qa.checking" ||
    detailKey === "artDirector.reviewing"
  ) {
    return "write";
  }
  if (detailKey.startsWith("animate.")) return "motion";
  return null;
}

export function pipelineP2StepIndex(stage: PipelineP2Stage): number {
  return PIPELINE_P2_STAGES.indexOf(stage);
}

/** Skip completed stages when continuing a paused / timed-out / failed generate. */
export function resumeSkipFlags(stage?: PipelineP2Stage | null): {
  skipPlan: boolean;
  skipLayout: boolean;
  skipWrite: boolean;
} {
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
export function resumeStageFromProgress(
  detailKey: string | undefined | null,
  hasPresentation: boolean,
  hasOrganizedOutline: boolean,
): PipelineP2Stage {
  const p2 = mapDetailKeyToPipelineP2Stage(detailKey);
  if (hasPresentation && (p2 === "motion" || (detailKey?.startsWith("animate.") ?? false))) {
    return "motion";
  }
  if (hasPresentation) return "write";
  if (hasOrganizedOutline) return "layout";
  return p2 ?? "plan";
}


/** Thrown when a P2 whole-job stage is force-failed (inject / real fault). */
export class PipelineP2StageError extends Error {
  readonly stage: PipelineP2Stage;
  constructor(stage: PipelineP2Stage, message?: string) {
    super(message ?? `pipeline P2 stage failed: ${stage}`);
    this.name = "PipelineP2StageError";
    this.stage = stage;
  }
}

export type PipelineP2Inject = {
  /** Test/dev only: fail when leaving this whole-job stage (before any success deck). */
  failAt?: "plan" | "layout" | "write";
};

/** Call at stage boundary; throws PipelineP2StageError when inject.failAt matches. */
export function throwIfPipelineP2Inject(
  inject: PipelineP2Inject | undefined | null,
  stage: "plan" | "layout" | "write",
): void {
  if (inject?.failAt === stage) {
    throw new PipelineP2StageError(stage);
  }
}
