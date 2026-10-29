"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIVE_GATE_NO_LLM_REASON = exports.LIVE_GATE_AUTH_FAIL_REASON = exports.LIVE_GATE_SKIP_REASON = void 0;
exports.liveGenerateContentGate = liveGenerateContentGate;
exports.liveGateEnvForStore = liveGateEnvForStore;
exports.resolveLiveGateConfig = resolveLiveGateConfig;
exports.parseLiveGateSeeds = parseLiveGateSeeds;
exports.extractGateResult = extractGateResult;
exports.liveGateErrorHaystack = liveGateErrorHaystack;
exports.isLiveGateAuthOrProviderError = isLiveGateAuthOrProviderError;
exports.liveSeedEvidencedPass = liveSeedEvidencedPass;
exports.formatWallClock = formatWallClock;
exports.runLiveGatePassRateHarness = runLiveGatePassRateHarness;
exports.evaluateLiveGatePassRate = evaluateLiveGatePassRate;
exports.formatLivePassRateMarkdown = formatLivePassRateMarkdown;
const store_1 = require("../../config/store");
const presets_1 = require("../../config/presets");
const constraints_harness_1 = require("../compile/constraints-harness");
const pipeline_1 = require("../pipeline");
const fixtures_1 = require("./fixtures");
const gates_1 = require("./gates");
const gates_report_1 = require("./gates-report");
exports.LIVE_GATE_SKIP_REASON = [
    "SKIP: live LLM not configured — refusing to fake results.",
    "Set AI_API_KEY (or PPT_AI_KEY / OPENAI_API_KEY) and optionally:",
    "  AI_PROVIDER / AI_MODEL / AI_BASE_URL / AI_PROXY_URL",
    "  aliases: PPT_AI_PROVIDER / PPT_AI_MODEL / PPT_AI_BASE_URL",
    "Ollama / custom local endpoints do not require a key.",
    "Offline compile A/B (0 LLM): pnpm report:gate-pass-rate",
].join("\n");
exports.LIVE_GATE_AUTH_FAIL_REASON = "FAIL: live LLM auth/provider error (key present but rejected) — not SKIP, not PASS.";
exports.LIVE_GATE_NO_LLM_REASON = "FAIL: live generate produced no LLM calls — refusing to count compile fallback as PASS.";
function isDeckgenPresentation(pres) {
    const meta = pres.meta;
    return Boolean(meta?.deckgen?.system);
}
/** Deckgen decks are scored on whitelist tags; PPTAgent fixtures still use P0. */
function liveGenerateContentGate(pres) {
    if (!isDeckgenPresentation(pres))
        return (0, gates_1.runP0Gates)(pres);
    const findings = [];
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
function pickEnv(env, keys) {
    for (const key of keys) {
        const v = env[key];
        if (v && v.trim())
            return v.trim();
    }
    return undefined;
}
function liveGateEnvForStore(env = process.env) {
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
function resolveLiveGateConfig(env = process.env) {
    const config = (0, store_1.envConfigStore)(liveGateEnvForStore(env)).load();
    if (!(0, presets_1.isConfigUsable)(config)) {
        return { ok: false, reason: exports.LIVE_GATE_SKIP_REASON };
    }
    return { ok: true, config };
}
function parseLiveGateSeeds(raw, fallback = constraints_harness_1.GATE_PASS_RATE_SEEDS) {
    if (!raw?.trim())
        return fallback;
    const seeds = raw
        .split(/[,\s]+/)
        .map((s) => Number.parseInt(s, 10))
        .filter((n) => Number.isFinite(n));
    return seeds.length > 0 ? seeds : fallback;
}
function envFlag(env, key, fallback) {
    const v = env[key];
    if (v == null || !v.trim())
        return fallback;
    return !["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}
function extractGateResult(e) {
    if (!e || typeof e !== "object")
        return undefined;
    const gr = e.gateResult;
    if (!gr || typeof gr !== "object")
        return undefined;
    if (!("passed" in gr) || !("findings" in gr))
        return undefined;
    return gr;
}
function liveGateErrorHaystack(err, depth = 0) {
    if (err == null || depth > 4)
        return "";
    if (typeof err === "string" || typeof err === "number" || typeof err === "boolean")
        return String(err);
    if (err instanceof Error) {
        const extra = err;
        const data = typeof extra.data === "string" ? extra.data : extra.data != null ? safeJson(extra.data) : "";
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
        const o = err;
        return [o.statusCode, o.status, o.code, o.message, safeJson(err)].filter(Boolean).join(" ");
    }
    return String(err);
}
function safeJson(v) {
    try {
        return JSON.stringify(v) ?? "";
    }
    catch {
        return "";
    }
}
function isLiveGateAuthOrProviderError(err) {
    const status = statusOf(err);
    if (status === 401 || status === 403)
        return true;
    const hay = liveGateErrorHaystack(err);
    if (/\b(401|403)\b/.test(hay))
        return true;
    return /invalid_api_key|invalid api key|incorrect api key|authentication(?:_| )?error|\bunauthorized\b|\bforbidden\b|invalid.?credentials|missing.?api.?key|api key (?:is )?(?:invalid|missing|not found)|incorrect.?api.?key|account.deactivated|permission_denied/i.test(hay);
}
function statusOf(err) {
    if (!err || typeof err !== "object")
        return undefined;
    const o = err;
    const n = Number(o.statusCode ?? o.status);
    return Number.isFinite(n) ? n : undefined;
}
function liveSeedEvidencedPass(run) {
    return (run.report.passed &&
        run.modelCalls > 0 &&
        !isLiveGateAuthOrProviderError(run.error));
}
function shouldAbortLiveSuite(run) {
    if (run.error && isLiveGateAuthOrProviderError(run.error))
        return true;
    return run.modelCalls <= 0;
}
function formatWallClock(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return "n/a";
    if (ms < 1000)
        return `${Math.round(ms)}ms`;
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60)
        return `${totalSec}s (${Math.round(ms)}ms)`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s}s (${Math.round(ms)}ms)`;
}
function errorReport(label, elapsedMs) {
    return {
        label,
        slideCount: 0,
        passed: false,
        findingCount: 0,
        byKind: (0, gates_1.tallyGateFindings)([]),
        findings: [],
        elapsedMs,
    };
}
function reportBadDeck() {
    const pres = (0, fixtures_1.buildBadDeckFixture)();
    return (0, gates_report_1.reportGateResult)("bad-deck fixture", pres, (0, gates_1.runP0Gates)(pres), 0);
}
function failLiveRun(seed, label, elapsedMs, error, modelCalls, draft, gate) {
    const report = draft
        ? { ...(0, gates_report_1.reportGateResult)(label, draft, gate ?? (0, gates_1.runP0Gates)(draft), elapsedMs), passed: false }
        : errorReport(label, elapsedMs);
    return { seed, report, error, modelCalls };
}
async function runOneLive(seed, index, config, generate, env, now) {
    const label = `wizard live constraints=on run=${index + 1} seed=${seed}`;
    const outline = (0, constraints_harness_1.darkLaunchWizardOutline)();
    let draft;
    let modelCalls = 0;
    const t0 = now();
    try {
        const pres = await generate(outline, constraints_harness_1.DARK_LAUNCH_WIZARD_GUIDANCE, {
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
            return failLiveRun(seed, label, elapsedMs, exports.LIVE_GATE_NO_LLM_REASON, modelCalls, pres);
        }
        return { seed, report: (0, gates_report_1.reportGateResult)(label, pres, liveGenerateContentGate(pres), elapsedMs), modelCalls };
    }
    catch (e) {
        const elapsedMs = Math.round(now() - t0);
        const err = e instanceof Error ? e.message : String(e);
        const hay = `${err} ${liveGateErrorHaystack(e)}`;
        if (isLiveGateAuthOrProviderError(e) || isLiveGateAuthOrProviderError(hay)) {
            return failLiveRun(seed, label, elapsedMs, hay.trim() || exports.LIVE_GATE_AUTH_FAIL_REASON, modelCalls, draft);
        }
        if (modelCalls <= 0) {
            return failLiveRun(seed, label, elapsedMs, err || exports.LIVE_GATE_NO_LLM_REASON, modelCalls, draft, extractGateResult(e));
        }
        const gate = extractGateResult(e);
        return failLiveRun(seed, label, elapsedMs, err, modelCalls, draft, gate);
    }
}
async function runLiveGatePassRateHarness(opts = {}) {
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
    const generate = opts.generate ?? pipeline_1.generateFromOutline;
    const live = [];
    let abortReason;
    for (let i = 0; i < seeds.length; i++) {
        const run = await runOneLive(seeds[i], i, resolved.config, generate, env, now);
        live.push(run);
        if (shouldAbortLiveSuite(run)) {
            abortReason = isLiveGateAuthOrProviderError(run.error)
                ? exports.LIVE_GATE_AUTH_FAIL_REASON
                : (run.error ?? exports.LIVE_GATE_NO_LLM_REASON);
            break;
        }
    }
    const livePass = live.filter(liveSeedEvidencedPass).length;
    const providerFailed = live.some((r) => r.modelCalls <= 0 || isLiveGateAuthOrProviderError(r.error));
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
function evaluateLiveGatePassRate(result, target = constraints_harness_1.GATE_PASS_RATE_TARGET) {
    const reasons = [];
    const badDeckFailed = !result.badDeck.passed;
    if (!badDeckFailed)
        reasons.push("bad-deck fixture passed gates (expected FAIL)");
    if (result.skipped) {
        reasons.push(result.skipReason ?? exports.LIVE_GATE_SKIP_REASON);
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
    const providerFailed = result.providerFailed === true ||
        !!result.abortReason ||
        result.live.some((r) => (r.modelCalls ?? 0) <= 0 || isLiveGateAuthOrProviderError(r.error));
    if (providerFailed) {
        reasons.push(result.abortReason ?? exports.LIVE_GATE_AUTH_FAIL_REASON);
    }
    if (evidencedPass > 0 && totalCalls <= 0) {
        reasons.push(exports.LIVE_GATE_NO_LLM_REASON);
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
function formatLivePassRateMarkdown(result) {
    const status = result.skipped
        ? "SKIP (no live LLM — results not faked)"
        : result.providerFailed || result.abortReason
            ? `FAIL (${result.abortReason ?? exports.LIVE_GATE_AUTH_FAIL_REASON})`
            : `${result.livePass}/${result.seeds.length} hard P0 pass`;
    const liveRows = result.live.map((r) => {
        const clock = formatWallClock(r.report.elapsedMs);
        const err = r.error ? ` error=${r.error.replace(/\s+/g, " ").slice(0, 120)}` : "";
        return `| ${r.report.label} | ${r.report.passed ? "PASS" : "FAIL"} | ${r.report.passed ? 0 : 1} | ${clock} calls=${r.modelCalls}${err} |`;
    });
    const summary = [
        `Brief: ${result.brief}`,
        `Status: ${status}`,
        `Helm: hard P0 ≥${constraints_harness_1.GATE_PASS_RATE_TARGET.minPass}/${constraints_harness_1.GATE_PASS_RATE_TARGET.runs} (≤12min wall-clock is measure-only)`,
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
    return [...summary, "", (0, gates_report_1.formatGatePassMarkdown)(reports)].join("\n");
}
