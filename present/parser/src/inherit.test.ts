import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phMatch } from "./inherit.js";

describe("phMatch", () => {
  it("matches by idx first, then type family", () => {
    assert.equal(phMatch({ idx: "1" }, { idx: "1", type: "body" }), true);
    assert.equal(phMatch({ idx: "1" }, { idx: "2" }), false);
    assert.equal(phMatch({ type: "title" }, { type: "ctrTitle" }), true);
    assert.equal(phMatch({ type: "body" }, { type: "obj" }), true);
    assert.equal(phMatch({ type: "title" }, { type: "body" }), false);
    assert.equal(phMatch({}, {}), true);
  });
});
