import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { condDelay, msOf } from "./helpers.js";

describe("msOf", () => {
  it("returns numeric durations and 0 for indefinite / missing", () => {
    assert.equal(msOf(250), 250);
    assert.equal(msOf("indefinite"), 0);
    assert.equal(msOf(undefined), 0);
  });
});

describe("condDelay", () => {
  it("returns a plain delay when there is no tn index hit", () => {
    assert.equal(condDelay(undefined), 0);
    assert.equal(condDelay([{ delay: 120 }]), 120);
  });

  it("adds delay onto a referenced tn begin/end", () => {
    const tnIndex = new Map([["tn1", { start: 100, end: 400 }]]);
    assert.equal(condDelay([{ tn: "tn1", evt: "begin", delay: 20 }], tnIndex), 120);
    assert.equal(condDelay([{ tn: "tn1", evt: "end" }], tnIndex), 400);
  });
});
