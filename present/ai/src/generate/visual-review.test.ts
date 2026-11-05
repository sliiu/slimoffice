import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { repairScope } from "./deckgen-adapter.js";
import { visualRepairFindings, visualReviewRound } from "./visual-review.js";
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

describe("visualReviewRound", () => {
  const shot = [{ slideIdx: 0, dataUrl: "data:image/png;base64,AA" }];
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
        repair: async (findings: unknown[]) => {
          log.push(`repair:${findings.length}`);
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
    assert.deepEqual(h.log, ["capture", "review", "repair:2", "capture", "review"]);
    assert.equal(out?.report.score, 7);
    assert.equal(out?.scoreBefore, 5);
    assert.deepEqual(out?.repairedPages, [2, 6]);
  });

  it("skips the re-review when it would eat the call kept for the copy rewrite", async () => {
    const h = harness(3, [{ score: 5, findings: [f(2, "high", "whitespace")] }]);
    const out = await visualReviewRound(h.deps);
    assert.deepEqual(h.log, ["capture", "review", "repair:1"]);
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

  it("does nothing without screenshots or budget", async () => {
    const none = harness(4, []);
    none.deps.capture = async () => [];
    assert.equal(await visualReviewRound(none.deps), undefined);
    const broke = harness(0, []);
    assert.equal(await visualReviewRound(broke.deps), undefined);
    assert.deepEqual(broke.log, ["capture"]);
  });
});
