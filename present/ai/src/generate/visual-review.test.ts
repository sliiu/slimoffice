import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairScope } from "./deckgen-adapter.js";
import { mergeRepairFindings, visualRepairFindings, visualReviewRound } from "./visual-review.js";
import type { ArtDirectorFinding } from "./qa/art-director.js";

const f = (slideIdx: number, severity: ArtDirectorFinding["severity"], category: ArtDirectorFinding["category"]): ArtDirectorFinding => ({
  slideIdx,
  severity,
  category,
  issue: `issue on ${slideIdx}`,
  suggestion: "fix it",
});

describe("visualRepairFindings", () => {
  it("keeps high / medium layout findings, worst pages first, capped to three pages", () => {
    const out = visualRepairFindings(
      {
        findings: [
          f(5, "medium", "whitespace"),
          f(2, "high", "hierarchy"),
          f(7, "low", "density"),
          f(3, "high", "imagery"),
          f(1, "medium", "density"),
          f(6, "medium", "typography"),
          f(2, "medium", "whitespace"),
          f(40, "high", "density"),
        ],
      },
      10,
    );
    assert.deepEqual([...new Set(out.map((x) => x.slideIdx))].sort(), [1, 2, 5]);
    assert.equal(out.filter((x) => x.slideIdx === 2).length, 2);
    assert.ok(out.every((x) => x.kind === "design" && x.pages?.length === 1 && /visual review/.test(x.issue)));
  });

  it("stays page-scoped for the repair pass", () => {
    const out = visualRepairFindings({ findings: [f(1, "high", "whitespace"), f(4, "medium", "density")] }, 10);
    assert.deepEqual(repairScope(out, 10), [1, 4]);
  });

  it("returns nothing when the review found only low-severity or non-layout issues", () => {
    assert.deepEqual(visualRepairFindings({ findings: [f(1, "low", "whitespace"), f(2, "high", "color")] }, 10), []);
  });
});

describe("mergeRepairFindings", () => {
  const gate = (slideIdx: number, issue: string) => ({ kind: "design" as const, slideIdx, issue });

  it("keeps the reviewer's pages and adds the pages only the geometry gate names", () => {
    const visual = visualRepairFindings({ findings: [f(0, "high", "hierarchy"), f(1, "medium", "density")] }, 8);
    const merged = mergeRepairFindings(visual, [gate(2, "content stops at y=523")], 8);
    assert.deepEqual([...new Set(merged.map((x) => x.slideIdx))], [0, 1, 2]);
    assert.ok(merged.some((x) => x.slideIdx === 2 && x.issue.startsWith("geometry: ")));
    // Reviewer's words stay first on their own pages.
    assert.ok(merged.find((x) => x.slideIdx === 0)!.issue.startsWith("visual review"));
  });

  it("puts a page both channels name first, with the measurement attached", () => {
    const visual = visualRepairFindings({ findings: [f(0, "high", "hierarchy"), f(4, "high", "density")] }, 8);
    const merged = mergeRepairFindings(visual, [gate(4, "empty block 768×224px")], 8);
    assert.equal(merged[0]!.slideIdx, 4);
    assert.ok(merged.filter((x) => x.slideIdx === 4).some((x) => x.issue.startsWith("geometry: ")));
  });

  it("does not grow the scope past the page cap", () => {
    const visual = visualRepairFindings({ findings: [f(0, "high", "hierarchy"), f(1, "high", "density"), f(2, "high", "whitespace")] }, 8);
    const merged = mergeRepairFindings(visual, [gate(5, "void"), gate(6, "void")], 8);
    assert.deepEqual([...new Set(merged.map((x) => x.slideIdx))], [0, 1, 2]);
  });

  it("drops findings that name no page and leaves a review-only set untouched", () => {
    const visual = visualRepairFindings({ findings: [f(0, "high", "hierarchy")] }, 8);
    const merged = mergeRepairFindings(visual, [{ kind: "coherence" as const, slideIdx: -1, issue: "deck-wide" }], 8);
    assert.deepEqual([...new Set(merged.map((x) => x.slideIdx))], [0]);
    assert.deepEqual(mergeRepairFindings([], [], 8), []);
  });
});

describe("visualReviewRound", () => {
  // A capture covers every page, as the host's does; the round forwards only the re-authored ones.
  const shot = Array.from({ length: 8 }, (_, i) => ({ slideIdx: i, dataUrl: "data:image/png;base64,AA" }));
  function harness(budget: number, reports: Array<{ score: number; findings: ArtDirectorFinding[] }>) {
    const log: string[] = [];
    let left = budget;
    let n = 0;
    return {
      log,
      deps: {
        pageCount: () => 8,
        capture: async () => {
          log.push("capture");
          return shot;
        },
        review: async () => {
          log.push("review");
          return reports[n++]!;
        },
        repair: async (findings: unknown[], shots: Array<{ slideIdx: number; dataUrl: string }> = []) => {
          log.push(`repair:${findings.length}:shots${shots.map((s) => s.slideIdx).join("")}`);
        },
        tryConsume: () => (left > 0 ? (left--, true) : false),
        remaining: () => left,
        reserveAfter: 1,
      },
    };
  }

  it("reviews, re-authors the flagged pages, then reviews the repaired deck and reports both scores", async () => {
    const h = harness(4, [
      { score: 5, findings: [f(2, "high", "whitespace"), f(6, "medium", "density")] },
      { score: 7, findings: [] },
    ]);
    const out = await visualReviewRound(h.deps);
    assert.deepEqual(h.log, ["capture", "review", "repair:2:shots26", "capture", "review"]);
    assert.equal(out?.report.score, 7);
    assert.equal(out?.scoreBefore, 5);
    assert.deepEqual(out?.repairedPages, [2, 6]);
  });

  it("skips the re-review when it would eat the call kept for the copy rewrite", async () => {
    const h = harness(3, [{ score: 5, findings: [f(2, "high", "whitespace")] }]);
    const out = await visualReviewRound(h.deps);
    assert.deepEqual(h.log, ["capture", "review", "repair:1:shots2"]);
    assert.equal(out?.report.score, 5);
    assert.equal(out?.scoreBefore, undefined);
    assert.deepEqual(out?.repairedPages, [2]);
  });

  it("stops after the first review when nothing is worth re-authoring", async () => {
    const h = harness(4, [{ score: 8, findings: [f(1, "low", "whitespace")] }]);
    const out = await visualReviewRound(h.deps);
    assert.deepEqual(h.log, ["capture", "review"]);
    assert.deepEqual(out?.repairedPages, []);
  });

  it("skips the re-author when there is no time for it, and reports the review", async () => {
    const h = harness(4, [{ score: 5, findings: [f(2, "high", "whitespace")] }]);
    const out = await visualReviewRound({ ...h.deps, hasTimeFor: (step) => step !== "repair" });
    assert.deepEqual(h.log, ["capture", "review"]);
    assert.equal(out?.report.score, 5);
    assert.deepEqual(out?.repairedPages, []);
  });

  it("keeps the repair when the re-review has no time or fails", async () => {
    const noTime = harness(4, [{ score: 5, findings: [f(2, "high", "whitespace")] }]);
    const a = await visualReviewRound({ ...noTime.deps, hasTimeFor: (step) => step === "repair" });
    assert.deepEqual(noTime.log, ["capture", "review", "repair:1:shots2"]);
    assert.deepEqual(a?.repairedPages, [2]);

    const failing = harness(4, [{ score: 5, findings: [f(2, "high", "whitespace")] }]);
    let reviews = 0;
    const b = await visualReviewRound({
      ...failing.deps,
      review: async () => {
        if (reviews++) throw new Error("review timed out");
        return { score: 5, findings: [f(2, "high", "whitespace")] };
      },
      runAborted: () => false,
    });
    assert.equal(b?.report.score, 5);
    assert.equal(b?.scoreBefore, undefined);
    assert.deepEqual(b?.repairedPages, [2]);
  });

  it("undoes the re-author when the re-review scores the deck lower; a tie keeps it", async () => {
    const worse = harness(4, [
      { score: 6, findings: [f(2, "high", "whitespace")] },
      { score: 5, findings: [] },
    ]);
    let reverted = 0;
    const out = await visualReviewRound({ ...worse.deps, revert: () => reverted++ });
    assert.equal(reverted, 1);
    assert.equal(out?.report.score, 6);
    assert.deepEqual(out?.repairedPages, []);
    assert.deepEqual(out?.revertedPages, [2]);

    const tie = harness(4, [
      { score: 6, findings: [f(2, "high", "whitespace")] },
      { score: 6, findings: [] },
    ]);
    const kept = await visualReviewRound({ ...tie.deps, revert: () => reverted++ });
    assert.equal(reverted, 1);
    assert.deepEqual(kept?.repairedPages, [2]);
    assert.equal(kept?.scoreBefore, 6);
  });

  it("rethrows a failed re-review when the run itself was stopped", async () => {
    const h = harness(4, []);
    let reviews = 0;
    await assert.rejects(() =>
      visualReviewRound({
        ...h.deps,
        review: async () => {
          if (reviews++) throw new Error("Aborted");
          return { score: 5, findings: [f(2, "high", "whitespace")] };
        },
        runAborted: () => true,
      }),
    );
  });

  it("does nothing without screenshots or budget", async () => {
    const none = harness(4, []);
    none.deps.capture = async () => [];
    assert.equal(await visualReviewRound(none.deps), undefined);
    const broke = harness(0, []);
    assert.equal(await visualReviewRound(broke.deps), undefined);
    assert.deepEqual(broke.log, ["capture"]);
  });
});
