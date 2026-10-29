import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveHold, resolveIterations, resolveSpdRatio, reversedLocalTime, spdReverses } from "./timing-prop.js";

describe("resolveHold", () => {
  it("holds on hold/freeze, including ancestor fill", () => {
    assert.equal(resolveHold({ fill: "hold" }), true);
    assert.equal(resolveHold({ fill: "freeze" }), true);
    assert.equal(resolveHold({}, "hold"), true);
    assert.equal(resolveHold({ fill: "remove" }), false);
    assert.equal(resolveHold({}), false);
  });
});

describe("resolveIterations", () => {
  it("reads repeatCount as thousandths and honors indefinite", () => {
    assert.equal(resolveIterations({ repeatCount: "indefinite" }, 1), Infinity);
    assert.equal(resolveIterations({ repeatCount: 3000 }, 1), 3);
    assert.equal(resolveIterations({ repeatDur: 4000 }, 2), 2);
    assert.equal(resolveIterations({}, 1), 1);
  });
});

describe("resolveSpdRatio", () => {
  it("maps named speeds, percent, and thousandths", () => {
    assert.equal(resolveSpdRatio(undefined), 1);
    assert.equal(resolveSpdRatio("slow"), 0.5);
    assert.equal(resolveSpdRatio("fast"), 2);
    assert.equal(resolveSpdRatio("50%"), 0.5);
    assert.equal(resolveSpdRatio("100000"), 1);
    assert.equal(resolveSpdRatio("nope"), 1);
    assert.equal(resolveSpdRatio("-100000"), 1);
    assert.equal(resolveSpdRatio("-50%"), 0.5);
  });
});

describe("spd reverse", () => {
  it("treats a negative speed as reverse and keeps the absolute ratio", () => {
    assert.equal(spdReverses("-100000"), true);
    assert.equal(spdReverses("-50%"), true);
    assert.equal(spdReverses("100000"), false);
    assert.equal(spdReverses("fast"), false);
    assert.equal(reversedLocalTime(0, 1, true), 1);
    assert.equal(reversedLocalTime(0.25, 1, true), 0.75);
    assert.equal(reversedLocalTime(0.25, 1, false), 0.25);
  });
});
