import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { polygonPath } from "./chart-ex-render.js";

describe("polygonPath", () => {
  it("closes an M/L path", () => {
    assert.equal(polygonPath([]), "");
    assert.equal(polygonPath([[1, 2], [3, 4], [5, 0]]), "M 1 2 L 3 4 L 5 0 Z");
  });
});
