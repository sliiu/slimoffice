import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeMorphPathTween } from "./morph-path.js";

describe("degenerate arc morph", () => {
  it("morphs a zero-radius arc instead of falling back to FLIP", () => {
    const from = "M 10 10 A 0 0 0 0 1 80 10";
    const to = "M 10 40 A 0 0 0 0 1 80 40";
    const tween = makeMorphPathTween(from, to);
    assert.ok(tween);
    const mid = tween!(0.5);
    assert.match(mid, /[ML]/);
    assert.equal(mid.includes("NaN"), false);
  });

  it("samples a collapsed large arc as an ellipse", () => {
    const from = "M 40 40 A 20 12 0 1 1 40 40";
    const to = "M 80 40 A 28 16 0 1 1 80 40";
    const tween = makeMorphPathTween(from, to);
    assert.ok(tween);
    assert.equal(tween!(0.5).includes("NaN"), false);
  });

  it("keeps arc flags as bare 0/1 while interpolating a ring", () => {
    const ring = (cx: number, r: number) =>
      `M ${cx - r} 100 A ${r} ${r} 0 0 1 ${cx} ${100 - r} A ${r} ${r} 0 0 1 ${cx + r} 100 Z`;
    const tween = makeMorphPathTween(ring(100, 60), ring(400, 190));
    assert.ok(tween);
    const args = [...tween!(0.37).matchAll(/A ((?:\S+ ){6}\S+)/g)].map((m) => m[1]!.split(" "));
    assert.equal(args.length, 2);
    for (const a of args) {
      assert.match(a[3]!, /^[01]$/);
      assert.match(a[4]!, /^[01]$/);
    }
  });
});
