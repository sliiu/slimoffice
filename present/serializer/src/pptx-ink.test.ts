import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PathShape } from "@ppt/core";
import { inkPartPath, isInkPath, svgPathToPoints } from "./pptx-ink.js";

const base = {
  name: "Ink",
  zIndex: 0,
  visible: true,
  locked: false,
  opacity: 1,
  bbox: { x: 0, y: 0, w: 10, h: 10 },
  transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
};

describe("ink helpers", () => {
  it("detects ink paths and parses M/L points", () => {
    const ink = { ...base, kind: "path" as const, id: "p1", d: "M0 0 L1 2", ink: { mode: "pen" as const } };
    const named = { ...base, kind: "path" as const, id: "sp_ink_9", d: "M0 0" };
    const plain = { ...base, kind: "path" as const, id: "p2", d: "M0 0" };
    assert.equal(isInkPath(ink as PathShape), true);
    assert.equal(isInkPath(named as PathShape), true);
    assert.equal(isInkPath(plain as PathShape), false);
    assert.deepEqual(svgPathToPoints("M1 2 L3 4 Z"), [
      [1, 2],
      [3, 4],
    ]);
    assert.equal(inkPartPath(3), "ppt/ink/ink3.xml");
  });
});
