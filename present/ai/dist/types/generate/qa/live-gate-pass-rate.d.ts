import type { Presentation } from "@sliiu/present-core";
import type { AiConfig } from "../../config/types.js";
import type { GenerateOptions } from "../types.js";
import type { GuidanceInput, Outline } from "../schema.js";
import { type GateResult } from "./gates.js";
import { type GatePassReport } from "./gates-report.js";
export declare const LIVE_GATE_SKIP_REASON: string;
export declare const LIVE_GATE_AUTH_FAIL_REASON = "FAIL: live LLM auth/provider error (key present but rejected) \u2014 not SKIP, not PASS.";
export declare const LIVE_GATE_NO_LLM_REASON = "FAIL: live generate produced no LLM calls \u2014 refusing to count compile fallback as PASS.";
/** Deckgen decks are scored on whitelist tags; PPTAgent fixtures still use P0. */
export declare function liveGenerateContentGate(pres: Presentation): GateResult;
export type LiveGenerateFn = (outline: Outline, guidance: GuidanceInput, opts: GenerateOptions) => Promise<Presentation>;
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
export declare function liveGateEnvForStore(env?: NodeJS.ProcessEnv): Record<string, string | undefined>;
export declare function resolveLiveGateConfig(env?: NodeJS.ProcessEnv): {
    ok: true;
    config: AiConfig;
} | {
    ok: false;
    reason: string;
};
export declare function parseLiveGateSeeds(raw: string | undefined, fallback?: readonly number[]): readonly number[];
export declare function extractGateResult(e: unknown): GateResult | undefined;
export declare function liveGateErrorHaystack(err: unknown, depth?: number): string;
export declare function isLiveGateAuthOrProviderError(err: unknown): boolean;
export declare function liveSeedEvidencedPass(run: LiveGatePassRateRun): boolean;
export declare function formatWallClock(ms: number): string;
export declare function runLiveGatePassRateHarness(opts?: LiveGatePassRateOptions): Promise<LiveGatePassRateResult>;
export declare function evaluateLiveGatePassRate(result: LiveGatePassRateResult, target?: {
    readonly runs: 3;
    readonly minPass: 2;
}): LiveGateEvaluation;
export declare function formatLivePassRateMarkdown(result: LiveGatePassRateResult): string;
