import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSlideMoveTarget,
  remapIndexAfterSlideMove,
  remapSlideIndexSetAfterMove,
} from "./slide-commands.js";

describe("slide move remap", () => {
  it("computes insert index and remaps selection", () => {
    assert.equal(computeSlideMoveTarget(1, 1), null);
    assert.equal(computeSlideMoveTarget(1, 2), null);
    assert.equal(computeSlideMoveTarget(0, 3), 2);
    assert.equal(computeSlideMoveTarget(3, 0), 0);
    assert.equal(remapIndexAfterSlideMove(0, 2, 0), 2);
    assert.equal(remapIndexAfterSlideMove(0, 2, 2), 1);
    assert.equal(remapIndexAfterSlideMove(2, 0, 0), 1);
    assert.deepEqual([...remapSlideIndexSetAfterMove(0, 2, new Set([0, 1]))].sort(), [0, 2]);
  });
});
