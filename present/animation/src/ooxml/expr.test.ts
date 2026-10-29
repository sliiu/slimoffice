import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evalBool, evalExpr, evalNumberValue, pptVars } from "./expr.js";
import type { ExprEnv } from "./expr.js";

const env: ExprEnv = {
  slideWidth: 1000,
  slideHeight: 500,
  bbox: { x: 100, y: 50, w: 200, h: 100 },
};

describe("pptVars / evalExpr", () => {
  it("exposes normalized ppt_* from the target box", () => {
    const vars = pptVars(env);
    assert.equal(vars.ppt_w, 0.2);
    assert.equal(vars.ppt_h, 0.2);
    assert.equal(vars.ppt_x, 0.2);
    assert.equal(vars.ppt_y, 0.2);
  });

  it("evaluates arithmetic and #ppt_ references", () => {
    assert.equal(evalExpr(4, env), 4);
    assert.equal(evalExpr("1+2*3", env), 7);
    assert.equal(evalExpr("#ppt_w", env), 0.2);
    assert.equal(evalExpr(undefined, env), 0);
  });

  it("evaluates fly-in and function formulas without eval", () => {
    assert.equal(evalExpr("#ppt_x", env), 0.2);
    assert.equal(evalExpr("0-#ppt_h/2", env), -0.1);
    assert.ok(Math.abs(evalExpr("#ppt_y+0.31", env) - 0.51) < 1e-9);
    assert.equal(evalExpr("-#ppt_w", env), -0.2);
    assert.equal(evalExpr("sin(pi/2)", env), 1);
    assert.equal(evalExpr("min(3,1)+pow(2,3)", env), 9);
    assert.equal(evalExpr("alert(1)", env), 0);
  });
});

describe("evalNumberValue / evalBool", () => {
  it("parses pt and px literals", () => {
    assert.equal(evalNumberValue("72pt"), 96);
    assert.equal(evalNumberValue("10px"), 10);
    assert.equal(evalNumberValue(undefined), undefined);
  });

  it("treats true/1/visible/show as true", () => {
    assert.equal(evalBool("true"), true);
    assert.equal(evalBool("1"), true);
    assert.equal(evalBool("visible"), true);
    assert.equal(evalBool("false"), false);
    assert.equal(evalBool(undefined), false);
  });
});
