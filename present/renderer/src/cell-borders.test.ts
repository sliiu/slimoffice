import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellBorderSegments, cellHasPerSideBorders } from "./cell-borders.js";
import type { TextShape } from "@ppt/core";

const stroke = { width: 1, paint: { kind: "solid" as const, color: "#000" } };

describe("cell-borders", () => {
  it("emits per-side segments including diagonals", () => {
    assert.equal(cellHasPerSideBorders({} as TextShape), false);
    const segs = cellBorderSegments({ x: 0, y: 0, w: 10, h: 8 }, { l: stroke, tl2br: stroke });
    assert.equal(segs.length, 2);
    assert.deepEqual(segs[0], { x1: 0, y1: 0, x2: 0, y2: 8, stroke });
    assert.deepEqual(segs[1], { x1: 0, y1: 0, x2: 10, y2: 8, stroke });
  });
});
