import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseConfig } from "../config/types.js";
import { generateFromOutline } from "./pipeline.js";
import { classifyGenerateEndError, isGenerateTimeoutError, startGenerateWallClock } from "./abort.js";
import type { Outline } from "./schema.js";

const outline: Outline = {
  title: "Demo",
  themeId: "ai",
  slides: [
    { title: "Cover", layoutHint: "cover", bullets: ["hello"], notes: "one two three." },
    { title: "Cards", layoutHint: "cards", bullets: ["A: one", "B: two"], notes: "one two three." },
  ],
};

function usableConfig() {
  return parseConfig({ text: { provider: "openai", apiKey: "sk-test", model: "gpt-4o-mini" } });
}

describe("generateFromOutline abort", () => {
  it("aborts mid-pipeline without returning a presentation or applying drafts", async () => {
    const ac = new AbortController();
    const drafts: unknown[] = [];
    let applied = 0;
    await assert.rejects(
      () =>
        generateFromOutline(outline, { topic: "Demo" }, {
          config: usableConfig(),
          signal: ac.signal,
          wallClock: false,
          enableImageEnrichment: false,
          enableArtDirector: false,
          enableAnimations: false,
          enableQaRepair: false,
          onPresentationDraft: (pres) => {
            drafts.push(pres);
            applied += 1;
          },
          onProgress: (p) => {
            if (p.detailKey === "research.drafting") ac.abort();
          },
        }),
      (e: unknown) => e instanceof Error && e.name === "AbortError",
    );
    assert.equal(drafts.length, 0);
    assert.equal(applied, 0);
  });

  it("wall-clock timeout aborts mid-pipeline without applying a deck", async () => {
    const ac = new AbortController();
    const drafts: unknown[] = [];
    let applied = 0;
    let now = 0;
    let queued: (() => void) | undefined;
    const dispose = startGenerateWallClock(ac, {
      wallMs: 25,
      now: () => now,
      startedAt: 0,
      setTimeoutFn: (fn) => {
        queued = fn;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {
        queued = undefined;
      },
    });
    await assert.rejects(
      () =>
        generateFromOutline(outline, { topic: "Demo" }, {
          config: usableConfig(),
          signal: ac.signal,
          wallClock: false,
          enableImageEnrichment: false,
          enableArtDirector: false,
          enableAnimations: false,
          enableQaRepair: false,
          onPresentationDraft: (pres) => {
            drafts.push(pres);
            applied += 1;
          },
          onProgress: (p) => {
            if (p.detailKey === "research.drafting") {
              now = 25;
              queued?.();
            }
          },
        }),
      (e: unknown) => isGenerateTimeoutError(e) && classifyGenerateEndError(e, ac.signal) === "timed-out",
    );
    dispose();
    assert.equal(drafts.length, 0);
    assert.equal(applied, 0);
    assert.equal(classifyGenerateEndError(ac.signal.reason, ac.signal), "timed-out");
  });

  it("does not apply a successful deck when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      () =>
        generateFromOutline(outline, { topic: "Demo" }, {
          config: usableConfig(),
          signal: ac.signal,
          wallClock: false,
          enableImageEnrichment: false,
          enableArtDirector: false,
          enableAnimations: false,
          onPresentationDraft: () => {
            throw new Error("must not apply");
          },
        }),
      (e: unknown) => e instanceof Error && e.name === "AbortError",
    );
  });
});
