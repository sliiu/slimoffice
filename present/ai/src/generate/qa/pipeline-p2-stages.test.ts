/**
 * Generate pipeline P2 staged fixtures (no LLM).
 * Covers helm/probe: whole-job vs motion-soft; gate-before-motion; plan/layout inject seams.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyGenerateEndError, shouldCommitGeneratedDeck } from "../abort.js";
import {
  isPipelineP2MotionSoftEnd,
  isPipelineP2WholeJobStage,
  mapDetailKeyToPipelineP2Stage,
  PIPELINE_P2_STAGES,
  pipelineP2StepIndex,
  PipelineP2StageError,
  resumeSkipFlags,
  resumeStageFromProgress,
  throwIfPipelineP2Inject,
} from "./pipeline-p2-policy.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("pipeline P2 stage policy", () => {
  it("hard order is plan → layout → write → motion", () => {
    assert.deepEqual([...PIPELINE_P2_STAGES], ["plan", "layout", "write", "motion"]);
    assert.equal(pipelineP2StepIndex("plan"), 0);
    assert.equal(pipelineP2StepIndex("motion"), 3);
  });

  it("whole-job fail only for plan/layout/write; motion is soft", () => {
    assert.equal(isPipelineP2WholeJobStage("plan"), true);
    assert.equal(isPipelineP2WholeJobStage("layout"), true);
    assert.equal(isPipelineP2WholeJobStage("write"), true);
    assert.equal(isPipelineP2WholeJobStage("motion"), false);
    assert.equal(isPipelineP2MotionSoftEnd("animate.skipped"), true);
    assert.equal(isPipelineP2MotionSoftEnd("animate.failed"), true);
    assert.equal(isPipelineP2MotionSoftEnd("qa.checking"), false);
  });

  it("maps detailKey → four steps (buff/sketch progress shell)", () => {
    assert.equal(mapDetailKeyToPipelineP2Stage("research.drafting"), "plan");
    assert.equal(mapDetailKeyToPipelineP2Stage("outline.ready"), "plan");
    assert.equal(mapDetailKeyToPipelineP2Stage("theme.designing"), "layout");
    assert.equal(mapDetailKeyToPipelineP2Stage("compile.composing"), "layout");
    assert.equal(mapDetailKeyToPipelineP2Stage("slide.progress"), "write");
    assert.equal(mapDetailKeyToPipelineP2Stage("qa.checking"), "write");
    assert.equal(mapDetailKeyToPipelineP2Stage("artDirector.reviewing"), "write");
    assert.equal(mapDetailKeyToPipelineP2Stage("animate.applying"), "motion");
    assert.equal(mapDetailKeyToPipelineP2Stage("animate.skipped"), "motion");
    assert.equal(mapDetailKeyToPipelineP2Stage("animate.failed"), "motion");
    assert.equal(mapDetailKeyToPipelineP2Stage(undefined), null);
  });

  it("resume skips completed stages and infers the next stage from progress", () => {
    assert.deepEqual(resumeSkipFlags("plan"), { skipPlan: false, skipLayout: false, skipWrite: false });
    assert.deepEqual(resumeSkipFlags("layout"), { skipPlan: true, skipLayout: false, skipWrite: false });
    assert.deepEqual(resumeSkipFlags("write"), { skipPlan: true, skipLayout: true, skipWrite: false });
    assert.deepEqual(resumeSkipFlags("motion"), { skipPlan: true, skipLayout: true, skipWrite: true });
    assert.equal(resumeStageFromProgress("research.drafting", false, false), "plan");
    assert.equal(resumeStageFromProgress("compile.composing", false, true), "layout");
    assert.equal(resumeStageFromProgress("qa.checking", true, true), "write");
    assert.equal(resumeStageFromProgress("animate.applying", true, true), "motion");
  });
});

describe("pipeline P2 abort / commit fixtures", () => {
  it("cancel → no commit; not gate-failed", () => {
    const ac = new AbortController();
    ac.abort();
    assert.equal(shouldCommitGeneratedDeck(ac.signal), false);
    const gate = new Error("P0 quality gates failed") as Error & { gateResult: unknown };
    gate.gateResult = { findings: [] };
    assert.equal(classifyGenerateEndError(gate, ac.signal), "cancelled");
  });

  it("write-step Design fail classifies design-gate-failed (not motion)", () => {
    const err = new Error("Design quality gates failed") as Error & {
      designGateResult: { passed: boolean; findings: unknown[] };
    };
    err.designGateResult = { passed: false, findings: [{ kind: "type-floor" }] };
    assert.equal(classifyGenerateEndError(err), "design-gate-failed");
    assert.equal(isPipelineP2WholeJobStage("write"), true);
  });

  it("content gate fail classifies gate-failed (whole-job write)", () => {
    const err = new Error("P0 quality gates failed") as Error & { gateResult: unknown };
    err.gateResult = { findings: [{ kind: "no-bullets" }] };
    assert.equal(classifyGenerateEndError(err), "gate-failed");
  });
});

describe("pipeline P2 plan/layout inject seams (①② fail → no success deck)", () => {
  it("throwIfPipelineP2Inject throws PipelineP2StageError only for matching stage", () => {
    assert.doesNotThrow(() => throwIfPipelineP2Inject(undefined, "plan"));
    assert.doesNotThrow(() => throwIfPipelineP2Inject({}, "plan"));
    assert.doesNotThrow(() => throwIfPipelineP2Inject({ failAt: "layout" }, "plan"));
    assert.throws(
      () => throwIfPipelineP2Inject({ failAt: "plan" }, "plan"),
      (e: unknown) => e instanceof PipelineP2StageError && e.stage === "plan",
    );
    assert.throws(
      () => throwIfPipelineP2Inject({ failAt: "layout" }, "layout"),
      (e: unknown) => e instanceof PipelineP2StageError && e.stage === "layout",
    );
    assert.throws(
      () => throwIfPipelineP2Inject({ failAt: "write" }, "write"),
      (e: unknown) => e instanceof PipelineP2StageError && e.stage === "write",
    );
  });

  it("adapter calls inject at plan then layout then write, all before motion", () => {
    const src = readFileSync(join(here, "../deckgen-adapter.ts"), "utf8");
    const plan = src.indexOf('throwIfPipelineP2Inject(opts.pipelineP2Inject, "plan")');
    const layout = src.indexOf('throwIfPipelineP2Inject(opts.pipelineP2Inject, "layout")');
    const write = src.indexOf('throwIfPipelineP2Inject(opts.pipelineP2Inject, "write")');
    const motionApply = src.indexOf("applyMotion(pres, opts, working)");
    assert.ok(plan >= 0 && layout >= 0 && write >= 0, "missing plan/layout/write inject seams");
    assert.ok(motionApply >= 0, "missing applyMotion call");
    assert.ok(plan < layout && layout < write, "inject order must be plan → layout → write");
    assert.ok(write < motionApply, "write inject must run before motion apply");
  });
});

describe("pipeline P2 adapter contract (QA before motion)", () => {
  it("adapter runs QA repair before motion; motion fail is non-fatal", () => {
    const adapter = readFileSync(join(here, "../deckgen-adapter.ts"), "utf8");
    const polish = readFileSync(join(here, "../polish.ts"), "utf8");
    const qa = polish.indexOf("validateAndRepairPresentation");
    const motionSkip = adapter.indexOf('detailKey: "animate.skipped"');
    const motionFail = adapter.indexOf('detailKey: "animate.failed"');
    const motionApply = adapter.lastIndexOf("autoAnimatePresentation");
    assert.ok(qa >= 0 && motionApply >= 0, "missing QA/motion markers");
    assert.ok(motionSkip >= 0, "enableAnimations===false must emit animate.skipped");
    assert.ok(motionFail >= 0, "motion catch must emit animate.failed (soft)");
    const motionCatch = adapter.indexOf("catch (e)", motionApply);
    assert.ok(motionCatch >= 0, "motion call must be wrapped in try/catch");
    const catchBlock = adapter.slice(motionCatch, motionCatch + 280);
    assert.match(catchBlock, /animate\.failed/);
    assert.match(catchBlock, /rethrowIfAborted/);
  });
});
