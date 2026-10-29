import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import type { Presentation } from "@ppt/core";
import { compilePresentation, outlineToFallbackSpec } from "../compile/compile";
import {
  DARK_LAUNCH_WIZARD_GUIDANCE,
  GATE_PASS_RATE_TARGET,
  darkLaunchWizardOutline,
} from "../compile/constraints-harness";
import type { GenerateOptions } from "../types";
import { runP0Gates, tallyGateFindings } from "./gates";
import {
  LIVE_GATE_AUTH_FAIL_REASON,
  LIVE_GATE_NO_LLM_REASON,
  LIVE_GATE_SKIP_REASON,
  evaluateLiveGatePassRate,
  extractGateResult,
  formatLivePassRateMarkdown,
  formatWallClock,
  isLiveGateAuthOrProviderError,
  parseLiveGateSeeds,
  resolveLiveGateConfig,
  runLiveGatePassRateHarness,
} from "./live-gate-pass-rate";

function compileFixture(seed: number, constraintsEnabled = true): Presentation {
  return compilePresentation(outlineToFallbackSpec(darkLaunchWizardOutline(), { injectMissingCover: false }), {
    size: { width: 1280, height: 720 },
    designSeed: seed,
    guidance: DARK_LAUNCH_WIZARD_GUIDANCE,
    constraintsEnabled,
  });
}

describe("live gate pass-rate harness", () => {
  it("reuses the 16-page dark-launch wizard fixture", () => {
    assert.equal(darkLaunchWizardOutline().slides.length, 16);
    assert.equal(DARK_LAUNCH_WIZARD_GUIDANCE.slideCount, 16);
    assert.equal(DARK_LAUNCH_WIZARD_GUIDANCE.styleFamily, "dark-launch");
  });

  it("skips when no live LLM key is configured and still fails the bad-deck fixture", async () => {
    const result = await runLiveGatePassRateHarness({
      env: {},
      generate: async () => {
        throw new Error("must not call live generate without credentials");
      },
    });
    assert.equal(result.skipped, true);
    assert.match(result.skipReason ?? "", /AI_API_KEY/);
    assert.equal(result.live.length, 0);
    assert.equal(result.badDeck.passed, false);
    assert.ok(result.badDeck.findingCount >= 4);
    const ev = evaluateLiveGatePassRate(result);
    assert.equal(ev.verdict, "skip");
    assert.equal(ev.badDeckFailed, true);
    const md = formatLivePassRateMarkdown(result);
    assert.match(md, /SKIP/);
    assert.match(md, /bad-deck fixture/);
    assert.match(md, /FAIL/);
  });

  it("resolves AI_* and PPT_AI_* / OPENAI_API_KEY aliases", () => {
    assert.equal(resolveLiveGateConfig({}).ok, false);
    assert.equal(resolveLiveGateConfig({ AI_API_KEY: "sk-test" }).ok, true);
    assert.equal(resolveLiveGateConfig({ PPT_AI_KEY: "sk-test", PPT_AI_PROVIDER: "openai" }).ok, true);
    assert.equal(resolveLiveGateConfig({ OPENAI_API_KEY: "sk-test" }).ok, true);
    assert.equal(resolveLiveGateConfig({ AI_PROVIDER: "ollama" }).ok, true);
    assert.equal(LIVE_GATE_SKIP_REASON.includes("pnpm report:gate-pass-rate"), true);
  });

  it("parses seeds and formats wall-clock", () => {
    assert.deepEqual(parseLiveGateSeeds(undefined), [11, 22, 33]);
    assert.deepEqual(parseLiveGateSeeds("7,8,9"), [7, 8, 9]);
    assert.match(formatWallClock(15), /15ms/);
    assert.match(formatWallClock(125000), /2m 5s/);
  });

  it("extracts gateResult from generate failures", () => {
    const err = new Error("P0 quality gates failed") as Error & { gateResult: { passed: boolean; findings: [] } };
    err.gateResult = { passed: false, findings: [] };
    assert.deepEqual(extractGateResult(err), { passed: false, findings: [] });
    assert.equal(extractGateResult(new Error("network")), undefined);
  });

  it("injectable generate: ≥2/3 pass + bad-deck FAIL meets helm", async () => {
    const seen: Array<{ seed?: number; constraintsEnabled?: boolean }> = [];
    const result = await runLiveGatePassRateHarness({
      env: { AI_API_KEY: "sk-test", AI_PROVIDER: "openai" },
      seeds: [11, 22, 33],
      now: (() => {
        let t = 0;
        return () => {
          t += 1000;
          return t;
        };
      })(),
      generate: async (_outline, _guidance, opts: GenerateOptions) => {
        seen.push({ seed: opts.designSeed, constraintsEnabled: opts.constraintsEnabled });
        opts.onLlmUsage?.({ input_tokens: 24, output_tokens: 12 });
        if (opts.designSeed === 22) {
          const pres = compileFixture(22, false);
          const err = new Error("P0 quality gates failed") as Error & { gateResult: ReturnType<typeof runP0Gates> };
          err.gateResult = runP0Gates(pres);
          opts.onPresentationDraft?.(pres);
          throw err;
        }
        return compileFixture(opts.designSeed ?? 11, true);
      },
    });
    assert.equal(result.skipped, false);
    assert.equal(result.live.length, 3);
    assert.equal(result.livePass, 2);
    assert.equal(result.providerFailed, false);
    assert.ok(result.live.every((r) => r.modelCalls > 0));
    assert.equal(result.badDeck.passed, false);
    assert.deepEqual(
      seen.map((s) => s.constraintsEnabled),
      [true, true, true],
    );
    assert.deepEqual(
      seen.map((s) => s.seed),
      [11, 22, 33],
    );
    const ev = evaluateLiveGatePassRate(result);
    assert.equal(ev.verdict, "pass");
    assert.equal(ev.helmMet, true);
    assert.ok(result.live[1]?.error);
    assert.ok(result.livePass >= GATE_PASS_RATE_TARGET.minPass);
    const md = formatLivePassRateMarkdown(result);
    assert.match(md, /2\/3/);
    assert.match(md, /constraints=on/);
  });

  it("fails helm when live pass-rate is below 2/3", async () => {
    const result = await runLiveGatePassRateHarness({
      env: { AI_API_KEY: "sk-test" },
      seeds: [11, 22, 33],
      generate: async (_outline, _guidance, opts: GenerateOptions) => {
        opts.onLlmUsage?.({ input_tokens: 8, output_tokens: 4 });
        return compileFixture(11, false);
      },
    });
    assert.ok(result.livePass < GATE_PASS_RATE_TARGET.minPass);
    assert.equal(evaluateLiveGatePassRate(result).verdict, "fail");
  });

  it("fails skip path if the bad-deck fixture unexpectedly passes", () => {
    const ev = evaluateLiveGatePassRate({
      brief: "t",
      seeds: [11, 22, 33],
      skipped: true,
      skipReason: LIVE_GATE_SKIP_REASON,
      live: [],
      livePass: 0,
      badDeck: {
        label: "bad-deck fixture",
        slideCount: 16,
        passed: true,
        findingCount: 0,
        byKind: tallyGateFindings([]),
        findings: [],
        elapsedMs: 0,
      },
      wallClockMs: 1,
    });
    assert.equal(ev.verdict, "fail");
    assert.equal(ev.badDeckFailed, false);
  });

  it("classifies 401 / invalid_api_key as auth errors", () => {
    const apiErr = Object.assign(new Error("Incorrect API key provided"), {
      statusCode: 401,
      code: "invalid_api_key",
    });
    assert.equal(isLiveGateAuthOrProviderError(apiErr), true);
    assert.equal(isLiveGateAuthOrProviderError(new Error("401 invalid_api_key")), true);
    assert.equal(isLiveGateAuthOrProviderError("Unauthorized: invalid credentials"), true);
    assert.equal(isLiveGateAuthOrProviderError(new Error("P0 quality gates failed")), false);
  });

  it("injected generate that throws auth-like error → 0 PASS, suite fails (not SKIP)", async () => {
    const err = Object.assign(new Error("Incorrect API key provided: sk-test"), {
      statusCode: 401,
      code: "invalid_api_key",
    });
    const result = await runLiveGatePassRateHarness({
      env: { AI_API_KEY: "sk-test", AI_PROVIDER: "openai" },
      seeds: [11, 22, 33],
      generate: async (_outline, _guidance, opts: GenerateOptions) => {
        opts.onPresentationDraft?.(compileFixture(11, true));
        throw err;
      },
    });
    assert.equal(result.skipped, false);
    assert.equal(result.livePass, 0);
    assert.equal(result.providerFailed, true);
    assert.equal(result.abortReason, LIVE_GATE_AUTH_FAIL_REASON);
    assert.ok(result.live.length >= 1);
    assert.ok(result.live.length < 3, "auth error must abort remaining seeds");
    assert.ok(result.live.every((r) => r.report.passed === false));
    const ev = evaluateLiveGatePassRate(result);
    assert.equal(ev.verdict, "fail");
    assert.equal(ev.helmMet, false);
    const md = formatLivePassRateMarkdown(result);
    assert.match(md, /FAIL/);
    assert.doesNotMatch(md, /3\/3 hard P0 pass/);
    assert.doesNotMatch(md, /Status: SKIP/);
  });

  it("does not count compile-only generate (0 LLM calls / swallowed 401) as PASS", async () => {
    const result = await runLiveGatePassRateHarness({
      env: { AI_API_KEY: "sk-test", AI_PROVIDER: "openai" },
      seeds: [11, 22, 33],
      generate: async () => compileFixture(11, true),
    });
    assert.equal(result.skipped, false);
    assert.equal(result.livePass, 0);
    assert.ok(result.live.every((r) => r.report.passed === false));
    assert.ok(result.live.every((r) => r.modelCalls === 0));
    assert.equal(result.live[0]?.error, LIVE_GATE_NO_LLM_REASON);
    const ev = evaluateLiveGatePassRate(result);
    assert.equal(ev.verdict, "fail");
    const md = formatLivePassRateMarkdown(result);
    assert.doesNotMatch(md, /3\/3 hard P0 pass/);
    assert.match(md, /0\/3/);
  });

  it("evaluate refuses faked livePass without LLM evidence", () => {
    const emptyByKind = tallyGateFindings([]);
    const fakePass = {
      label: "wizard live",
      slideCount: 16,
      passed: true,
      findingCount: 0,
      byKind: emptyByKind,
      findings: [],
      elapsedMs: 12,
    };
    const ev = evaluateLiveGatePassRate({
      brief: "t",
      seeds: [11, 22, 33],
      skipped: false,
      live: [
        { seed: 11, report: fakePass, modelCalls: 0 },
        { seed: 22, report: fakePass, modelCalls: 0 },
        { seed: 33, report: fakePass, modelCalls: 0 },
      ],
      livePass: 3,
      badDeck: {
        label: "bad-deck fixture",
        slideCount: 16,
        passed: false,
        findingCount: 4,
        byKind: emptyByKind,
        findings: [],
        elapsedMs: 0,
      },
      wallClockMs: 800,
    });
    assert.equal(ev.verdict, "fail");
    assert.equal(ev.helmMet, false);
  });
});
