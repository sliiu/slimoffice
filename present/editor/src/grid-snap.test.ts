import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VISUAL_GRID_STEP, closestGridLine, pickGridSnap } from "./grid-snap.js";

describe("visual grid snap", () => {
  it("picks the drawn line, not a step past the slide edge", () => {
    assert.equal(closestGridLine(48, VISUAL_GRID_STEP, 1280), 50);
    assert.equal(closestGridLine(20, VISUAL_GRID_STEP, 1280), 0);
    assert.equal(closestGridLine(1275, VISUAL_GRID_STEP, 1280), 1250);
  });

  it("snaps an edge when it is close and leaves it when it is not", () => {
    const close = pickGridSnap([103], VISUAL_GRID_STEP, 1280, 6);
    assert.deepEqual(close, { delta: -3, at: 100 });
    assert.equal(pickGridSnap([120], VISUAL_GRID_STEP, 1280, 6), null);
  });

  it("uses the closer of the two edges", () => {
    const hit = pickGridSnap([12, 90], VISUAL_GRID_STEP, 1280, 15);
    assert.deepEqual(hit, { delta: 10, at: 100 });
  });
});
