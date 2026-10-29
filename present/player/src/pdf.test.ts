import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { concat, slideSizeToPdfPoints } from "./pdf.js";

describe("pdf helpers", () => {
  it("converts 96-dpi px to points and concatenates bytes", () => {
    assert.deepEqual(slideSizeToPdfPoints({ width: 96, height: 192 }), { widthPt: 72, heightPt: 144 });
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3]);
    assert.deepEqual(Array.from(concat([a, b])), [1, 2, 3]);
  });
});
