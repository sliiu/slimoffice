import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { looksCjkTypeface, pickEaTypeface, primaryTypeface } from "./theme-export.js";

describe("theme typefaces", () => {
  it("picks latin first and CJK ea from a CSS stack", () => {
    assert.equal(looksCjkTypeface("微软雅黑"), true);
    assert.equal(looksCjkTypeface("Microsoft YaHei"), true);
    assert.equal(looksCjkTypeface("Inter"), false);
    assert.equal(primaryTypeface('"Poppins", Inter, sans-serif'), "Poppins");
    assert.equal(pickEaTypeface('"Inter", "Microsoft YaHei", sans-serif'), "Microsoft YaHei");
    assert.equal(pickEaTypeface("Inter, sans-serif"), undefined);
  });
});
