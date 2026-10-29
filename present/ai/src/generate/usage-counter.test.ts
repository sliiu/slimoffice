import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UsageCounter, extractLlmUsage } from "./usage-counter.js";

describe("UsageCounter", () => {
  it("accumulates real provider usage and estimates cost", () => {
    const c = new UsageCounter();
    c.addCall({
      input_tokens: 2000,
      output_tokens: 1000,
      cache_read_tokens: 500,
      cache_creation_tokens: 100,
    });
    const snap = c.snapshot();
    assert.equal(snap.modelCalls, 1);
    assert.equal(snap.inputTokens, 2000);
    assert.equal(snap.outputTokens, 1000);
    assert.equal(snap.cacheReadTokens, 500);
    assert.equal(snap.cacheCreationTokens, 100);
    assert.ok(snap.estimatedCostCNY > 0);
  });

  it("addCall without usage does not invent tokens", () => {
    const c = new UsageCounter();
    c.addCall();
    const snap = c.snapshot();
    assert.equal(snap.modelCalls, 1);
    assert.equal(snap.inputTokens, 0);
    assert.equal(snap.outputTokens, 0);
    assert.equal(snap.estimatedCostCNY, 0);
  });
});

describe("extractLlmUsage", () => {
  it("reads AI SDK v6 usage + Anthropic cache metadata", () => {
    const usage = extractLlmUsage({
      usage: { inputTokens: 120, outputTokens: 40, cachedInputTokens: 10 },
      providerMetadata: { anthropic: { cacheCreationInputTokens: 8 } },
    });
    assert.deepEqual(usage, {
      input_tokens: 120,
      output_tokens: 40,
      cache_read_tokens: 10,
      cache_creation_tokens: 8,
    });
  });

  it("reads OpenAI-style prompt/completion tokens", () => {
    const usage = extractLlmUsage({
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    });
    assert.deepEqual(usage, { input_tokens: 11, output_tokens: 7 });
  });

  it("returns undefined when the provider sent no usage", () => {
    assert.equal(extractLlmUsage({ text: "hi" }), undefined);
    assert.equal(extractLlmUsage(null), undefined);
  });
});
