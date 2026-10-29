import type { Presentation } from "@ppt/core";
import { envConfigStore } from "../../config/store";
import { isConfigUsable } from "../../config/presets";
import type { AiConfig } from "../../config/types";
import {
  DARK_LAUNCH_WIZARD_GUIDANCE,
  GATE_PASS_RATE_SEEDS,
  GATE_PASS_RATE_TARGET,
  darkLaunchWizardOutline,
} from "../compile/constraints-harness";
import { generateFromOutline } from "../pipeline";
import type { GenerateOptions } from "../types";
import type { GuidanceInput, Outline } from "../schema";
import { buildBadDeckFixture } from "./fixtures";
import { runP0Gates, tallyGateFindings, type GateFinding, type GateResult } from "./gates";
import { formatGatePassMarkdown, reportGateResult, type GatePassReport } from "./gates-report";

export const LIVE_GATE_SKIP_REASON = [
  "SKIP: live LLM not configured — refusing to fake results.",
  "Set AI_API_KEY (or PPT_AI_KEY / OPENAI_API_KEY) and optionally:",
  "  AI_PROVIDER / AI_MODEL / AI_BASE_URL / AI_PROXY_URL",
  "  aliases: PPT_AI_PROVIDER / PPT_AI_MODEL / PPT_AI_BASE_URL",
  "Ollama / custom local endpoints do not require a key.",
  "Offline compile A/B (0 LLM): pnpm report:gate-pass-rate",
].join("\n");

export const LIVE_GATE_AUTH_FAIL_REASON =
  "FAIL: live LLM auth/provider error (key present but rejected) — not SKIP, not PASS.";

export const LIVE_GATE_NO_LLM_REASON =
  "FAIL: live generate produced no LLM calls — refusing to count compile fallback as PASS.";

function isDeckgenPresentation(pres: Presentation): boolean {
  const meta = pres.meta as { deckgen?: { system?: string } } | undefined;
  return Boolean(meta?.deckgen?.system);
}

/** Deckgen decks are scored on whitelist tags; PPTAgent fixtures still use P0. */
export function liveGenerateContentGate(pres: Presentation): GateResult {
  if (!isDeckgenPresentation(pres)) return runP0Gates(pres);
  const findings: GateFinding[] = [];
  if (pres.slides.length === 0) {
    findings.push({ kind: "cover-visual", slideIdx: -1, issue: "deckgen emitted no slides" });
  }
  for (let i = 0; i < pres.slides.length; i++) {
    const layout = pres.slides[i]?.customData?.tags?.layout ?? "";
    if (!layout) {
      findings.push({ kind: "web-exclusive", slideIdx: i, issue: "missing deckgen layout tag" });
    }
  }
  return { passed: findings.length === 0, findings };
}

export type LiveGenerateFn = (
  outline: Outline,
  guidance: GuidanceInput,
  opts: GenerateOptions,
) => Promise<Presentation>;

export interface LiveGatePassRateRun {
  seed: number;
  report: GatePassReport;
  error?: string;
  modelCalls: number;
}

export interface LiveGatePassRateResult {
  brief: string;
  seeds: readonly number[];
  skipped: boolean;
  skipReason?: string;
  live: LiveGatePassRateRun[];
  livePass: number;
  badDeck: GatePassReport;
  wallClockMs: number;
  providerFailed?: boolean;
  abortReason?: string;
}

export type LiveGateVerdict = "pass" | "fail" | "skip";

export interface LiveGateEvaluation {
  verdict: LiveGateVerdict;
  helmMet: boolean;
  badDeckFailed: boolean;
  reasons: string[];
}

export interface LiveGatePassRateOptions {
  seeds?: readonly number[];
  env?: NodeJS.ProcessEnv;
  generate?: LiveGenerateFn;
  now?: () => number;
}

function pickEnv(env: NodeJS.ProcessEnv, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = env[key];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export function liveGateEnvForStore(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  return {
    AI_PROVIDER: pickEnv(env, ["AI_PROVIDER", "PPT_AI_PROVIDER"]),
    AI_MODEL: pickEnv(env, ["AI_MODEL", "PPT_AI_MODEL"]),
    AI_API_KEY: pickEnv(env, ["AI_API_KEY", "PPT_AI_KEY", "OPENAI_API_KEY"]),
    AI_BASE_URL: pickEnv(env, ["AI_BASE_URL", "PPT_AI_BASE_URL"]),
    AI_PROXY_URL: pickEnv(env, ["AI_PROXY_URL", "PPT_AI_PROXY_URL"]),
    AI_IMAGE_API_KEY: pickEnv(env, ["AI_IMAGE_API_KEY", "PPT_AI_IMAGE_KEY"]),
    AI_IMAGE_PROVIDER: pickEnv(env, ["AI_IMAGE_PROVIDER", "PPT_AI_IMAGE_PROVIDER"]),
    AI_IMAGE_BASE_URL: pickEnv(env, ["AI_IMAGE_BASE_URL"]),
    AI_IMAGE_MODEL: pickEnv(env, ["AI_IMAGE_MODEL"]),
    UNSPLASH_KEY: pickEnv(env, ["UNSPLASH_KEY"]),
    PEXELS_KEY: pickEnv(env, ["PEXELS_KEY"]),
  };
}

export function resolveLiveGateConfig(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true; config: AiConfig } | { ok: false; reason: string } {
  const config = envConfigStore(liveGateEnvForStore(env)).load();
  if (!isConfigUsable(config)) {
    return { ok: false, reason: LIVE_GATE_SKIP_REASON };
  }
  return { ok: true, config };
}

export function parseLiveGateSeeds(
  raw: string | undefined,
  fallback: readonly number[] = GATE_PASS_RATE_SEEDS,
): readonly number[] {
  if (!raw?.trim()) return fallback;
  const seeds = raw
    .split(/[,\s]+/)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
  return seeds.length > 0 ? seeds : fallback;
}

function envFlag(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const v = env[key];
  if (v == null || !v.trim()) return fallback;
  return !["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}

export function extractGateResult(e: unknown): GateResult | undefined {
  if (!e || typeof e !== "object") return undefined;
  const gr = (e as { gateResult?: unknown }).gateResult;
  if (!gr || typeof gr !== "object") return undefined;
  if (!("passed" in gr) || !("findings" in gr)) return undefined;
  return gr as GateResult;
}

export function liveGateErrorHaystack(err: unknown, depth = 0): string {
  if (err == null || depth > 4) return "";
  if (typeof err === "string" || typeof err === "number" || typeof err === "boolean") return String(err);
  if (err instanceof Error) {
    const extra = err as Error & {
      statusCode?: unknown;
      status?: unknown;
      code?: unknown;
      cause?: unknown;
      data?: unknown;
      responseBody?: unknown;
    };
    const data =
      typeof extra.data === "string" ? extra.data : extra.data != null ? safeJson(extra.data) : "";
    return [
      err.name,
      err.message,
      extra.statusCode,
      extra.status,
      extra.code,
      extra.responseBody,
      data,
      extra.cause ? liveGateErrorHaystack(extra.cause, depth + 1) : "",
    ]
      .filter((p) => p != null && String(p).length > 0)
      .join(" ");
  }
  if (typeof err === "object") {
    const o = err as { statusCode?: unknown; status?: unknown; code?: unknown; message?: unknown };
    return [o.statusCode, o.status, o.code, o.message, safeJson(err)].filter(Boolean).join(" ");
  }
  return String(err);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
}

export function isLiveGateAuthOrProviderError(err: unknown): boolean {
  const status = statusOf(err);
  if (status === 401 || status === 403) return true;
  const hay = liveGateErrorHaystack(err);
  if (/\b(401|403)\b/.test(hay)) return true;
  return /invalid_api_key|invalid api key|incorrect api key|authentication(?:_| )?error|\bunauthorized\b|\bforbidden\b|invalid.?credentials|missing.?api.?key|api key (?:is )?(?:invalid|missing|not found)|incorrect.?api.?key|account.deactivated|permission_denied/i.test(
    hay,
  );
}

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const o = err as { statusCode?: unknown; status?: unknown };
  const n = Number(o.statusCode ?? o.status);
  return Number.isFinite(n) ? n : undefined;
}

export function liveSeedEvidencedPass(run: LiveGatePassRateRun): boolean {
  return (
    run.report.passed &&
    run.modelCalls > 0 &&
    !isLiveGateAuthOrProviderError(run.error)
  );
}

function shouldAbortLiveSuite(run: LiveGatePassRateRun): boolean {
  if (run.error && isLiveGateAuthOrProviderError(run.error)) return true;
  return run.modelCalls <= 0;
}

export function formatWallClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "n/a";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s (${Math.round(ms)}ms)`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s (${Math.round(ms)}ms)`;
}

function errorReport(label: string, elapsedMs: number): GatePassReport {
  return {
    label,
    slideCount: 0,
    passed: false,
    findingCount: 0,
    byKind: tallyGateFindings([]),
    findings: [],
    elapsedMs,
  };
}

function reportBadDeck(): GatePassReport {
  const pres = buildBadDeckFixture();
  return reportGateResult("bad-deck fixture", pres, runP0Gates(pres), 0);
}

function failLiveRun(
  seed: number,
  label: string,
  elapsedMs: number,
  error: string,
  modelCalls: number,
  draft?: Presentation,
  gate?: GateResult,
): LiveGatePassRateRun {
  const report = draft
    ? { ...reportGateResult(label, draft, gate ?? runP0Gates(draft), elapsedMs), passed: false }
    : errorReport(label, elapsedMs);
  return { seed, report, error, modelCalls };
}

async function runOneLive(
  seed: number,
  index: number,
  config: AiConfig,
  generate: LiveGenerateFn,
  env: NodeJS.ProcessEnv,
  now: () => number,
): Promise<LiveGatePassRateRun> {
  const label = `wizard live constraints=on run=${index + 1} seed=${seed}`;
  const outline = darkLaunchWizardOutline();
  let draft: Presentation | undefined;
  let modelCalls = 0;
  const t0 = now();
  try {
    const pres = await generate(outline, DARK_LAUNCH_WIZARD_GUIDANCE, {
      config,
      designSeed: seed,
      constraintsEnabled: true,
      enableQaRepair: true,
      enableArtDirector: envFlag(env, "GATE_LIVE_ART_DIRECTOR", true),
      enableImageEnrichment: envFlag(env, "GATE_LIVE_IMAGES", false),
      enableAnimations: envFlag(env, "GATE_LIVE_ANIMATIONS", false),
      enableDesignSpec: false,
      debug: envFlag(env, "GATE_LIVE_DEBUG", true),
      onPresentationDraft: (p) => {
        draft = p;
      },
      onLlmUsage: () => {
        modelCalls += 1;
      },
    });
    const elapsedMs = Math.round(now() - t0);
    if (modelCalls <= 0) {
      return failLiveRun(seed, label, elapsedMs, LIVE_GATE_NO_LLM_REASON, modelCalls, pres);
    }
    return { seed, report: reportGateResult(label, pres, liveGenerateContentGate(pres), elapsedMs), modelCalls };
  } catch (e) {
    const elapsedMs = Math.round(now() - t0);
    const err = e instanceof Error ? e.message : String(e);
    const hay = `${err} ${liveGateErrorHaystack(e)}`;
    if (isLiveGateAuthOrProviderError(e) || isLiveGateAuthOrProviderError(hay)) {
      return failLiveRun(seed, label, elapsedMs, hay.trim() || LIVE_GATE_AUTH_FAIL_REASON, modelCalls, draft);
    }
    if (modelCalls <= 0) {
      return failLiveRun(seed, label, elapsedMs, err || LIVE_GATE_NO_LLM_REASON, modelCalls, draft, extractGateResult(e));
    }
    const gate = extractGateResult(e);
    return failLiveRun(seed, label, elapsedMs, err, modelCalls, draft, gate);
  }
}

export async function runLiveGatePassRateHarness(
  opts: LiveGatePassRateOptions = {},
): Promise<LiveGatePassRateResult> {
  const env = opts.env ?? process.env;
  const seeds = opts.seeds ?? parseLiveGateSeeds(env.GATE_LIVE_SEEDS);
  const now = opts.now ?? (() => performance.now());
  const t0 = now();
  const badDeck = reportBadDeck();
  const resolved = resolveLiveGateConfig(env);
  if (!resolved.ok) {
    return {
      brief: "SlimPPT 16-page dark-launch wizard (cover + 14 bullets + closing) — live generate",
      seeds,
      skipped: true,
      skipReason: resolved.reason,
      live: [],
      livePass: 0,
      badDeck,
      wallClockMs: Math.round(now() - t0),
    };
  }
  const generate = opts.generate ?? generateFromOutline;
  const live: LiveGatePassRateRun[] = [];
  let abortReason: string | undefined;
  for (let i = 0; i < seeds.length; i++) {
    const run = await runOneLive(seeds[i]!, i, resolved.config, generate, env, now);
    live.push(run);
    if (shouldAbortLiveSuite(run)) {
      abortReason = isLiveGateAuthOrProviderError(run.error)
        ? LIVE_GATE_AUTH_FAIL_REASON
        : (run.error ?? LIVE_GATE_NO_LLM_REASON);
      break;
    }
  }
  const livePass = live.filter(liveSeedEvidencedPass).length;
  const providerFailed = live.some(
    (r) => r.modelCalls <= 0 || isLiveGateAuthOrProviderError(r.error),
  );
  return {
    brief: "SlimPPT 16-page dark-launch wizard (cover + 14 bullets + closing) — live generate",
    seeds,
    skipped: false,
    live,
    livePass,
    badDeck,
    wallClockMs: Math.round(now() - t0),
    providerFailed,
    ...(abortReason ? { abortReason } : {}),
  };
}

export function evaluateLiveGatePassRate(
  result: LiveGatePassRateResult,
  target = GATE_PASS_RATE_TARGET,
): LiveGateEvaluation {
  const reasons: string[] = [];
  const badDeckFailed = !result.badDeck.passed;
  if (!badDeckFailed) reasons.push("bad-deck fixture passed gates (expected FAIL)");
  if (result.skipped) {
    reasons.push(result.skipReason ?? LIVE_GATE_SKIP_REASON);
    return {
      verdict: badDeckFailed ? "skip" : "fail",
      helmMet: false,
      badDeckFailed,
      reasons,
    };
  }
  const evidencedPass = result.live.filter(liveSeedEvidencedPass).length;
  if (result.livePass !== evidencedPass) {
    reasons.push(`livePass ${result.livePass} disagrees with evidenced ${evidencedPass} — refusing to fake PASS`);
  }
  const totalCalls = result.live.reduce((n, r) => n + (r.modelCalls ?? 0), 0);
  const providerFailed =
    result.providerFailed === true ||
    !!result.abortReason ||
    result.live.some((r) => (r.modelCalls ?? 0) <= 0 || isLiveGateAuthOrProviderError(r.error));
  if (providerFailed) {
    reasons.push(result.abortReason ?? LIVE_GATE_AUTH_FAIL_REASON);
  }
  if (evidencedPass > 0 && totalCalls <= 0) {
    reasons.push(LIVE_GATE_NO_LLM_REASON);
  }
  const helmMet = evidencedPass >= target.minPass;
  if (!helmMet) {
    reasons.push(`live pass rate ${evidencedPass}/${result.seeds.length} < ${target.minPass}/${target.runs}`);
  }
  if (providerFailed || result.livePass !== evidencedPass || (evidencedPass > 0 && totalCalls <= 0)) {
    return {
      verdict: "fail",
      helmMet: false,
      badDeckFailed,
      reasons,
    };
  }
  return {
    verdict: helmMet && badDeckFailed ? "pass" : "fail",
    helmMet,
    badDeckFailed,
    reasons,
  };
}

export function formatLivePassRateMarkdown(result: LiveGatePassRateResult): string {
  const status = result.skipped
    ? "SKIP (no live LLM — results not faked)"
    : result.providerFailed || result.abortReason
      ? `FAIL (${result.abortReason ?? LIVE_GATE_AUTH_FAIL_REASON})`
      : `${result.livePass}/${result.seeds.length} hard P0 pass`;
  const liveRows = result.live.map((r) => {
    const clock = formatWallClock(r.report.elapsedMs);
    const err = r.error ? ` error=${r.error.replace(/\s+/g, " ").slice(0, 120)}` : "";
    return `| ${r.report.label} | ${r.report.passed ? "PASS" : "FAIL"} | ${r.report.passed ? 0 : 1} | ${clock} calls=${r.modelCalls}${err} |`;
  });
  const summary = [
    `Brief: ${result.brief}`,
    `Status: ${status}`,
    `Helm: hard P0 ≥${GATE_PASS_RATE_TARGET.minPass}/${GATE_PASS_RATE_TARGET.runs} (≤12min wall-clock is measure-only)`,
    "",
    `| Path | Pass / ${result.seeds.length} | Scrap | Wall-clock |`,
    `|---|---:|---:|---:|`,
    `| live×3 constraints=on | ${result.skipped ? "SKIP" : `${result.livePass}/${result.seeds.length}`} | ${result.skipped ? "n/a" : `${result.seeds.length - result.livePass}/${result.seeds.length}`} | ${formatWallClock(result.wallClockMs)} |`,
    `| bad-deck fixture | ${result.badDeck.passed ? "PASS" : "FAIL"} | n/a | n/a |`,
  ];
  if (liveRows.length) {
    summary.push("", "| Run | Pass | Scrap | Wall-clock |", "|---|:---:|---:|---|", ...liveRows);
  }
  if (result.skipReason) {
    summary.push("", result.skipReason);
  }
  if (result.abortReason) {
    summary.push("", result.abortReason);
  }
  const reports = [...result.live.map((r) => r.report), result.badDeck];
  return [...summary, "", formatGatePassMarkdown(reports)].join("\n");
}
