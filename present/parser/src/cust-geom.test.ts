import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createGuides, evalFmla, resolveVar } from "./cust-geom.js";

describe("DrawingML formulas", () => {
  it("resolves builtins and val/*/pin", () => {
    const g = createGuides(200, 100);
    assert.equal(g.get("w"), 200);
    assert.equal(g.get("hd2"), 50);
    assert.equal(g.get("ss"), 100);
    assert.equal(resolveVar("wd2", g), 100);
    assert.equal(resolveVar("7", g), 7);
    assert.equal(evalFmla("val 42", g), 42);
    assert.equal(evalFmla("*/ 10 4 2", g), 20);
    assert.equal(evalFmla("pin 0 5 10", g), 5);
    assert.equal(evalFmla("max 1 9", g), 9);
  });
});
