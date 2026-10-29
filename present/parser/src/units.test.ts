import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMU_PER_PX,
  angle60kToDeg,
  boolish,
  emuToPx,
  msToSec,
  percentToFloat,
  ptToPx,
  stHundredthPtToPx,
} from "./units.js";

describe("OOXML unit conversions", () => {
  it("converts EMU / pt / hundredth-pt / 60k angles", () => {
    assert.equal(emuToPx(EMU_PER_PX), 1);
    assert.equal(emuToPx(undefined), 0);
    assert.equal(emuToPx("nope"), 0);
    assert.equal(ptToPx(72), 96);
    assert.equal(stHundredthPtToPx(100), ptToPx(1));
    assert.equal(angle60kToDeg(60000), 1);
  });

  it("parses ST_Percentage, ms durations, and boolish attrs", () => {
    assert.equal(percentToFloat(50000), 0.5);
    assert.equal(percentToFloat("50%"), 0.5);
    assert.equal(percentToFloat("100000"), 1);
    assert.equal(msToSec(2500), 2.5);
    assert.equal(msToSec("indefinite", 1), 1);
    assert.equal(boolish("1"), true);
    assert.equal(boolish("false"), false);
    assert.equal(boolish("maybe"), undefined);
  });
});
