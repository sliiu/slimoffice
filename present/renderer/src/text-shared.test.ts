import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatBulletNumber,
  hexWithAlpha,
  isVerticalStack,
  stackedColumnsLtr,
  vertRotateDeg,
} from "./text-shared.js";

describe("text-shared", () => {
  it("formats bullets, vert modes, and hex alpha", () => {
    assert.equal(formatBulletNumber(1, "arabicPeriod"), "1.");
    assert.equal(formatBulletNumber(2, "alphaLcParenR"), "b)");
    assert.equal(formatBulletNumber(4, "romanUcPeriod"), "IV.");
    assert.equal(vertRotateDeg("vert"), 90);
    assert.equal(vertRotateDeg("vert270"), -90);
    assert.equal(vertRotateDeg(undefined), 0);
    assert.equal(isVerticalStack("eaVert"), true);
    assert.equal(isVerticalStack("vert"), false);
    assert.equal(stackedColumnsLtr("wordArtVertRtl"), false);
    assert.equal(stackedColumnsLtr("wordArtVert"), true);
    assert.equal(hexWithAlpha("#112233", 1), "#112233");
    assert.equal(hexWithAlpha("#112233", 0.5).toLowerCase(), "#11223380");
  });
});
