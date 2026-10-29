import type { UsageMetrics } from "./types.js";
import type { LlmUsage } from "../llm/usage.js";
export type { LlmUsage } from "../llm/usage.js";
export { extractLlmUsage } from "../llm/usage.js";
export declare class UsageCounter {
    private metrics;
    private startTime;
    addCall(usage?: LlmUsage): void;
    snapshot(): UsageMetrics;
    private estimateCost;
}
