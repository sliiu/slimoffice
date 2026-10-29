import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import type { LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { generateJson, stripJsonFences } from "./json.js";

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "stop" },
    usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
    warnings: [],
  };
}

describe("generateJson timeout retry", () => {
  it("retries once after a step timeout when the stage opted in, and surfaces the error otherwise", async () => {
    let calls = 0;
    const flaky = new MockLanguageModelV3({
      doGenerate: async () => {
        calls += 1;
        if (calls === 1) {
          const err = new Error("Generate timed out");
          err.name = "TimeoutError";
          throw err;
        }
        return textResult('{"a":"ok"}');
      },
    });
    const out = await generateJson({
      model: flaky as never,
      schema: z.object({ a: z.string() }),
      system: "s",
      prompt: "p",
      retryOnTimeout: 1,
      timeoutMs: 1000,
    });
    assert.deepEqual(out, { a: "ok" });
    assert.equal(calls, 2);

    calls = 0;
    await assert.rejects(
      () =>
        generateJson({
          model: flaky as never,
          schema: z.object({ a: z.string() }),
          system: "s",
          prompt: "p",
        }),
      (e: unknown) => e instanceof Error && e.name === "TimeoutError",
    );
    assert.equal(calls, 1);
  });

  it("does not retry a timeout when the caller's signal is the one that aborted", async () => {
    let calls = 0;
    const ac = new AbortController();
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls += 1;
        const err = new Error("aborted by user");
        err.name = "AbortError";
        ac.abort(err);
        throw err;
      },
    });
    await assert.rejects(
      () =>
        generateJson({
          model: model as never,
          schema: z.object({ a: z.string() }),
          system: "s",
          prompt: "p",
          signal: ac.signal,
          retryOnTimeout: 3,
        }),
      (e: unknown) => e instanceof Error && e.name === "AbortError",
    );
    assert.equal(calls, 1);
  });
});

describe("stripJsonFences", () => {
  it("unwraps markdown fences and leaves plain JSON", () => {
    assert.equal(stripJsonFences('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(stripJsonFences('```\n[]\n```'), "[]");
    assert.equal(stripJsonFences('  {"ok":true}  '), '{"ok":true}');
  });
});

describe("generateJson abort", () => {
  it("honors an already-aborted signal and does not call the model", async () => {
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      () =>
        generateJson({
          model: {} as LanguageModel,
          schema: z.object({ a: z.string() }),
          system: "s",
          prompt: "p",
          signal: ac.signal,
        }),
      (e: unknown) => e instanceof Error && e.name === "AbortError",
    );
  });

  it("rethrows a timeout abort reason without calling the model", async () => {
    const ac = new AbortController();
    const err = new Error("Generate timed out");
    err.name = "AbortError";
    (err as { kind?: string }).kind = "generate-timeout";
    ac.abort(err);
    await assert.rejects(
      () =>
        generateJson({
          model: {} as LanguageModel,
          schema: z.object({ a: z.string() }),
          system: "s",
          prompt: "p",
          signal: ac.signal,
        }),
      (e: unknown) => e === err,
    );
  });
});
