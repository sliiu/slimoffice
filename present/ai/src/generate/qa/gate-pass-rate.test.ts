import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  GATE_PASS_RATE_TARGET,
  darkLaunchWizardOutline,
  formatPassRateMarkdown,
  runGatePassRateHarness,
} from "../compile/constraints-harness";

describe("gate pass-rate harness", () => {
  it("prints before/after for the 16-page dark-launch wizard and meets ≥2/3 after constraints", () => {
    const outline = darkLaunchWizardOutline();
    assert.equal(outline.slides.length, 16);
    const cmp = runGatePassRateHarness();
    console.log("\n" + formatPassRateMarkdown(cmp) + "\n");
    assert.equal(cmp.seeds.length, GATE_PASS_RATE_TARGET.runs);
    assert.equal(cmp.badDeck.passed, false, "bad-deck fixture must still FAIL");
    assert.ok(cmp.badDeck.findingCount >= 4);
    assert.equal(cmp.beforePass, 0, `baseline scrap expected 0/${cmp.seeds.length} pass, got ${cmp.beforePass}`);
    assert.ok(
      cmp.afterPass >= GATE_PASS_RATE_TARGET.minPass,
      `constraints on expected ≥${GATE_PASS_RATE_TARGET.minPass}/${GATE_PASS_RATE_TARGET.runs}, got ${cmp.afterPass}/${cmp.seeds.length}\n${formatPassRateMarkdown(cmp)}`,
    );
    const beforeKinds = new Set(cmp.before.flatMap((r) => r.report.findings.map((f) => f.kind)));
    const afterKinds = new Set(cmp.after.flatMap((r) => r.report.findings.map((f) => f.kind)));
    // The wizard outline itself carries ≥4 web-exclusive hints (Outline-valid web layouts), so the
    // baseline no longer trips that gate; what constraints must still fix is cover visual + notes.
    const webHints = outline.slides.filter((s) => /cards|process|comparison|two-column/.test(s.layoutHint ?? "")).length;
    assert.ok(webHints >= 4, `fixture should carry ≥4 web-exclusive hints, has ${webHints}`);
    assert.ok(beforeKinds.has("cover-visual") || beforeKinds.has("speaker-notes"));
    for (const kind of ["cover-visual", "web-exclusive", "no-bullets"] as const) {
      assert.equal(afterKinds.has(kind), false, `constrained path still fails ${kind}`);
    }
  });
});
