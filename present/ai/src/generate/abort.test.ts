import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyGenerateEndError,
  GENERATE_WALL_MS,
  generatePauseError,
  generateTimeoutError,
  isAbortError,
  isGeneratePauseError,
  isGenerateTimeoutError,
  shouldCommitGeneratedDeck,
  startGenerateWallClock,
  throwIfAborted,
} from "./abort.js";
import { generateFromOutline } from "./pipeline.js";

describe("generate abort helpers", () => {
  it("throwIfAborted raises AbortError when the signal is aborted", () => {
    const ac = new AbortController();
    ac.abort();
    assert.throws(() => throwIfAborted(ac.signal), (e: unknown) => isAbortError(e));
  });

  it("does not commit a deck after abort", () => {
    const ac = new AbortController();
    assert.equal(shouldCommitGeneratedDeck(ac.signal), true);
    ac.abort();
    assert.equal(shouldCommitGeneratedDeck(ac.signal), false);
  });

  it("classifies abort as cancelled, not gate-failed", () => {
    const gate = new Error("P0 quality gates failed") as Error & { gateResult: { findings: unknown[] } };
    gate.gateResult = { findings: [{ kind: "cover-visual" }] };
    const ac = new AbortController();
    ac.abort();
    assert.equal(classifyGenerateEndError(gate, ac.signal), "cancelled");
    assert.equal(classifyGenerateEndError(gate, null), "gate-failed");
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";
    assert.equal(classifyGenerateEndError(aborted), "cancelled");
  });

  it("classifies timeout abort as timed-out, not cancelled or gate-failed", () => {
    const gate = new Error("P0 quality gates failed") as Error & { gateResult: { findings: unknown[] } };
    gate.gateResult = { findings: [{ kind: "cover-visual" }] };
    const ac = new AbortController();
    ac.abort(generateTimeoutError());
    assert.equal(classifyGenerateEndError(gate, ac.signal), "timed-out");
    assert.equal(classifyGenerateEndError(ac.signal.reason, null), "timed-out");
    assert.equal(isGenerateTimeoutError(ac.signal.reason), true);
    assert.equal(shouldCommitGeneratedDeck(ac.signal), false);
    assert.equal(GENERATE_WALL_MS, 12 * 60 * 1000);
  });

  it("classifies pause abort as paused, not cancelled or timed-out", () => {
    const ac = new AbortController();
    ac.abort(generatePauseError());
    assert.equal(classifyGenerateEndError(ac.signal.reason, ac.signal), "paused");
    assert.equal(isGeneratePauseError(ac.signal.reason), true);
    assert.equal(isGenerateTimeoutError(ac.signal.reason), false);
    assert.throws(
      () => throwIfAborted(ac.signal),
      (e: unknown) => isGeneratePauseError(e),
    );
  });
});

describe("generate wall clock", () => {
  it("aborts with timeout reason when the injectable clock elapses", () => {
    const ac = new AbortController();
    let now = 0;
    let queued: { fn: () => void; ms: number } | undefined;
    let onTimeout = 0;
    const dispose = startGenerateWallClock(ac, {
      wallMs: 100,
      now: () => now,
      startedAt: 0,
      setTimeoutFn: (fn, ms) => {
        queued = { fn, ms };
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {
        queued = undefined;
      },
      onTimeout: () => {
        onTimeout += 1;
      },
    });
    assert.equal(ac.signal.aborted, false);
    assert.equal(queued?.ms, 100);
    now = 100;
    queued?.fn();
    assert.equal(ac.signal.aborted, true);
    assert.equal(classifyGenerateEndError(ac.signal.reason, ac.signal), "timed-out");
    assert.equal(onTimeout, 1);
    dispose();
  });

  it("does not reclassify a user cancel as timeout", () => {
    const ac = new AbortController();
    let queued: (() => void) | undefined;
    const dispose = startGenerateWallClock(ac, {
      wallMs: 50,
      setTimeoutFn: (fn) => {
        queued = fn;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeoutFn: () => {
        queued = undefined;
      },
    });
    ac.abort();
    queued?.();
    assert.equal(classifyGenerateEndError(ac.signal.reason, ac.signal), "cancelled");
    dispose();
  });

  it("rejects generateFromOutline immediately when the shortened limit already elapsed", async () => {
    let applied = 0;
    await assert.rejects(
      () =>
        generateFromOutline(
          { title: "Demo", themeId: "ai", slides: [{ title: "Cover", layoutHint: "cover", bullets: ["a"] }] },
          { topic: "Demo" },
          {
            wallClock: { wallMs: 10, startedAt: 0, now: () => 10_000 },
            onPresentationDraft: () => {
              applied += 1;
            },
          },
        ),
      (e: unknown) => isGenerateTimeoutError(e) && classifyGenerateEndError(e) === "timed-out",
    );
    assert.equal(applied, 0);
  });
});
