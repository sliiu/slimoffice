import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathHasSubPaths, presetToShape } from "./preset-geom.js";

describe("pathHasSubPaths", () => {
  it("detects a second M/m as a hole", () => {
    assert.equal(pathHasSubPaths(""), false);
    assert.equal(pathHasSubPaths("M0 0 L10 0 Z"), false);
    assert.equal(pathHasSubPaths("M0 0 L10 0 Z M2 2 L4 2 Z"), true);
    assert.equal(pathHasSubPaths("M0 0 m2 2"), true);
  });
});

describe("presetToShape", () => {
  it("maps rect and line presets to native kinds", () => {
    const bbox = { x: 1, y: 2, w: 10, h: 20 };
    assert.deepEqual(presetToShape("rect", bbox), { kind: "rect" });
    assert.deepEqual(presetToShape("line", bbox), {
      kind: "line",
      x1: 1,
      y1: 2,
      x2: 11,
      y2: 22,
    });
  });
});
