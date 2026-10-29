import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeIconDescr, encodeIconDescr } from "./icon-picker-dialog.js";

describe("icon descr codec", () => {
  it("round-trips id and color", () => {
    const encoded = encodeIconDescr("star", "#ff00aa");
    assert.deepEqual(decodeIconDescr(encoded), { iconId: "star", color: "#ff00aa" });
    assert.equal(decodeIconDescr("star|#fff"), null);
    assert.equal(decodeIconDescr(undefined), null);
  });
});
