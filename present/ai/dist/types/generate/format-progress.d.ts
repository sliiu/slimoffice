import type { PipelineEvent, UsageMetrics } from "./types.js";
export type ProgressTranslate = (key: string, params?: Record<string, string | number>) => string;
export declare function hasRealGenerateUsage(usage?: UsageMetrics | null): boolean;
export declare function formatYuan(n: number): string | null;
export declare function formatUsageAmounts(usage: UsageMetrics): {
    tokens: string;
    y: string;
} | null;
export declare function formatGenerateProgress(p: PipelineEvent, t: ProgressTranslate): string;
