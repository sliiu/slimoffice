import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrowPathD, arrowRefX, arrowSize } from "./arrow-geom.js";

describe("arrow-geom", () => {
  it("sizes markers and anchors triangle vs oval", () => {
    assert.deepEqual(arrowSize({}), { w: 5, l: 5 });
    assert.deepEqual(arrowSize({ w: "sm", len: "lg" }), { w: 3, l: 8 });
    assert.equal(arrowRefX("triangle", "end", 5), 0);
    assert.equal(arrowRefX("triangle", "start", 5), 5);
    assert.equal(arrowRefX("diamond", "end", 8), 4);
    assert.equal(arrowRefX("oval", "end", 8), 0);
    assert.match(arrowPathD("triangle", 4, 6, "end"), /^M 0 -2 L 6 0 L 0 2 Z$/);
  });
});
