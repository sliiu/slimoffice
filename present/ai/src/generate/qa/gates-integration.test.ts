import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { runP0Gates } from "./gates";
import { buildBadDeckFixture } from "./fixtures";

describe("runP0Gates integration: 16-page bad deck fixture", () => {
  it("fails a 16-page deck with multiple gate violations", () => {
    const result = runP0Gates(buildBadDeckFixture());
    assert.equal(result.passed, false, "16-page bad deck should fail gates");
    assert.ok(result.findings.length >= 4, `Expected ≥4 findings, got ${result.findings.length}`);
    const kinds = result.findings.map((f) => f.kind);
    assert.ok(kinds.includes("cover-visual"), "Should fail cover-visual (no bg image)");
    assert.ok(kinds.includes("web-exclusive"), "Should fail web-exclusive (only 3 web layouts, need ≥4)");
    assert.ok(kinds.includes("speaker-notes"), "Should fail speaker-notes (10/16 = 62.5% < 80%)");
    assert.ok(kinds.includes("text-overlap"), "Should fail text-overlap (slide 5 has overlapping text)");
    assert.ok(kinds.includes("banned-imagery"), "Should fail banned-imagery (slide 8 has 'violence' keyword)");
  });
});
