import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatGenerateProgress, formatUsageAmounts, hasRealGenerateUsage } from "./format-progress.js";
import type { PipelineEvent, UsageMetrics } from "./types.js";

const MEASURING = "Measuring usage…";

function t(key: string, params?: Record<string, string | number>): string {
  if (key === "ai.generate.progress.usageMeasuring") return MEASURING;
  if (key === "ai.generate.progress.usage") return `已用 ${params?.tokens} token（约 ¥${params?.y}）`;
  if (key === "ai.generate.progress.title") return `生成中 · 第 ${params?.current}/${params?.total} 页`;
  if (key === "ai.status.progress.slide.progressWithTitle") return `Slide ${params?.title}`;
  return key;
}

function usage(partial: Partial<UsageMetrics>): UsageMetrics {
  return {
    modelCalls: 1,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    wallTimeMs: 10,
    estimatedCostCNY: 0,
    ...partial,
  };
}

describe("formatGenerateProgress usage reveal", () => {
  it("shows measuring when usage is missing", () => {
    const p: PipelineEvent = {
      stage: "slide",
      progress: 0.66,
      detailKey: "slide.progress",
      detailParams: { current: 8, total: 16 },
    };
    const text = formatGenerateProgress(p, t);
    assert.match(text, /生成中 · 第 8\/16 页/);
    assert.match(text, new RegExp(MEASURING));
    assert.doesNotMatch(text, /¥0\.00/);
    assert.doesNotMatch(text, / 0 /);
  });

  it("shows measuring when calls exist but tokens are still zero", () => {
    const p: PipelineEvent = {
      stage: "slide",
      progress: 0.66,
      detailKey: "slide.progress",
      detailParams: { current: 8, total: 16 },
      usage: usage({ modelCalls: 3, estimatedCostCNY: 0 }),
    };
    const text = formatGenerateProgress(p, t);
    assert.match(text, new RegExp(MEASURING));
    assert.doesNotMatch(text, /¥0\.00/);
    assert.equal(formatUsageAmounts(p.usage!), null);
    assert.equal(hasRealGenerateUsage(p.usage), false);
  });

  it("shows real tokens and estimated yuan when provider usage is present", () => {
    const p: PipelineEvent = {
      stage: "slide",
      progress: 0.66,
      detailKey: "slide.progress",
      detailParams: { current: 8, total: 16 },
      usage: usage({ inputTokens: 4000, outputTokens: 2000, estimatedCostCNY: 0.01 }),
    };
    const text = formatGenerateProgress(p, t);
    assert.doesNotMatch(text, new RegExp(MEASURING));
    assert.match(text, /已用 6\.0k token（约 ¥0\.01）/);
  });
});
