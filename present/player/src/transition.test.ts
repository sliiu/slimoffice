import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampTransitionForPlan } from "./transition.js";

describe("clampTransitionForPlan", () => {
  it("keeps basic kinds and demotes advanced ones on free plans", () => {
    const fade = { kind: "fade" as const, duration: 0.5 };
    assert.equal(clampTransitionForPlan(fade, false), fade);
    const morph = { kind: "morph" as const, duration: 1.2 };
    const clamped = clampTransitionForPlan(morph, false);
    assert.equal(clamped?.kind, "fade");
    assert.equal(clamped?.duration, 0.75);
    assert.equal(clampTransitionForPlan(morph, true)?.kind, "morph");
  });
});
