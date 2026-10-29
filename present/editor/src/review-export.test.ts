import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AccessibilityReport } from "./accessibility-audit.js";
import {
  accessibilityReadinessPercent,
  filterAccessibilityIssues,
  formatAccessibilityScoreLine,
  slideWithMostAccessibilityIssues,
} from "./review-export.js";

const report = (issues: AccessibilityReport["issues"], checkedSlides = 2): AccessibilityReport => ({
  issues,
  passed: Math.max(0, checkedSlides - issues.length),
  checkedSlides,
});

describe("accessibility review export", () => {
  it("filters, scores, and finds the hottest slide", () => {
    const empty = report([], 3);
    assert.equal(formatAccessibilityScoreLine(empty), "3 slide(s) checked · no issues");
    assert.equal(accessibilityReadinessPercent(empty), 100);
    const dirty = report([
      { slideIndex: 1, kind: "contrast", detail: "d" },
      { slideIndex: 1, kind: "tiny-text", detail: "d" },
      { slideIndex: 0, kind: "contrast", detail: "d" },
    ]);
    assert.equal(filterAccessibilityIssues(dirty.issues, "contrast").length, 2);
    assert.equal(slideWithMostAccessibilityIssues(dirty), 1);
    assert.ok(accessibilityReadinessPercent(dirty) < 100);
  });
});
