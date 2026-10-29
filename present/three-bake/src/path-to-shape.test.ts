import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathDToShapes } from "./path-to-shape";

describe("path arc extrusion", () => {
  it("bulges a semicircle off the chord instead of collapsing to a line", () => {
    const parsed = pathDToShapes("M -10 0 A 10 10 0 0 1 10 0");
    assert.equal(parsed.shapes.length, 1);
    const { minY, maxY } = parsed.bbox;
    assert.ok(maxY - minY > 5, `arc height ${maxY - minY}`);
  });
});