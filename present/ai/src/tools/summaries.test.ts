import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { elideUrlForSummary, paintSummary } from "./summaries.js";

describe("tool summaries", () => {
  it("elides data URLs and summarizes paints", () => {
    const data = "data:image/png;base64,AAAA";
    assert.match(elideUrlForSummary(data), /elided/);
    assert.equal(elideUrlForSummary("blob:https://x/1"), "blob:(session-only)");
    assert.deepEqual(paintSummary({ kind: "solid", color: "#111", alpha: 0.4 }), {
      kind: "solid",
      color: "#111",
      alpha: 0.4,
    });
    assert.deepEqual(paintSummary({ kind: "none" }), { kind: "none" });
    assert.equal(paintSummary(undefined), undefined);
  });
});
