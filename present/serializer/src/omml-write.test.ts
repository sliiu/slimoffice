import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { latexToOmmlInner, latexToOMathPara } from "./omml-write.js";

describe("latexToOmml", () => {
  it("emits OMML for simple latex and empty for blank / invalid", () => {
    const inner = latexToOmmlInner("x^2");
    assert.match(inner, /<m:sSup>/);
    assert.match(latexToOMathPara("x"), /<m:oMathPara[\s>]/);
    assert.equal(latexToOmmlInner(""), "");
    assert.equal(latexToOMathPara("   "), "");
  });
});
