import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeMotionPath, samplePath } from "./path.js";

describe("normalizeMotionPath", () => {
  it("strips the OOXML E terminator and collapses whitespace", () => {
    assert.equal(normalizeMotionPath("M 0 0 L 1 0 E"), "M 0 0 L 1 0");
    assert.equal(normalizeMotionPath("  M  0  0  "), "M 0 0");
  });
});

describe("samplePath", () => {
  it("samples a horizontal line including endpoints", () => {
    const pts = samplePath("M 0 0 L 1 0", 3, 100, 100);
    assert.equal(pts.length, 3);
    assert.equal(pts[0]!.x, 0);
    assert.equal(pts[2]!.x, 100);
    assert.equal(pts[1]!.y, 0);
  });
});
