import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cellMask,
  glitterParamsFromToken,
  glitterSweep,
  glitterToken,
  peelFlatClip,
  rippleAt,
  splitMotion,
  splitParamsFromToken,
  splitToken,
  stripsClips,
  wheelPolygon,
  wheelSpokes,
} from "./geometry";
import { getTransition } from "./registry";

describe("transition geometry", () => {
  it("splits vertical and horizontal on different axes, and in meets from the edges", () => {
    assert.deepEqual(splitMotion("vert", "out"), { kind: "expand", clip: "inset(0 50% 0 50%)" });
    assert.deepEqual(splitMotion("horz", "out"), { kind: "expand", clip: "inset(50% 0 50% 0)" });
    assert.deepEqual(splitMotion("vert", "in"), { kind: "meet", axis: "x" });
    assert.deepEqual(splitMotion("horz", "in"), { kind: "meet", axis: "y" });
    assert.equal(splitToken("vert", "in"), "vertIn");
    assert.deepEqual(splitParamsFromToken("horzOut"), { orient: "horz", dir: "out" });
  });

  it("opens a wheel by spoke count, and the reverse wheel turns the other way", () => {
    assert.equal(wheelSpokes(undefined), 4);
    assert.equal(wheelSpokes("8"), 8);
    assert.equal(wheelSpokes("99"), 4);
    const one = wheelPolygon(1, 1, false);
    const four = wheelPolygon(4, 1, false);
    assert.notEqual(one, four);
    assert.equal(wheelPolygon(4, 0, false).split(",").length, wheelPolygon(4, 1, false).split(",").length);
    assert.notEqual(wheelPolygon(4, 1, false), wheelPolygon(4, 1, true));
  });

  it("starts a strip wipe at the corner it travels from", () => {
    const [fromBr] = stripsClips("topLeft");
    const [fromBl] = stripsClips("topRight");
    assert.match(fromBr, /100% 100%/);
    assert.match(fromBl, /0% 100%/);
    assert.notEqual(fromBr, fromBl);
  });

  it("keeps glitter diamonds, hexagons, and honeycomb cells on different masks", () => {
    assert.notEqual(cellMask("diamond"), cellMask("hexagon"));
    assert.notEqual(cellMask("hexagon"), cellMask("honeycomb"));
    assert.match(cellMask("hexagon"), /polygon/);
    assert.deepEqual(glitterParamsFromToken(glitterToken("right", "hexagon")), { dir: "right", pattern: "hexagon" });
    assert.deepEqual(glitterParamsFromToken("nope"), { dir: "left", pattern: "diamond" });
    assert.notEqual(glitterSweep("left").from, glitterSweep("right").from);
    assert.notEqual(glitterSweep("up").from, glitterSweep("down").from);
  });

  it("puts the ripple on the chosen corner and peels opposite corners apart", () => {
    assert.equal(rippleAt("bottomLeft"), "0% 100%");
    assert.equal(rippleAt("topRight"), "100% 0%");
    assert.notEqual(peelFlatClip(false, 1), peelFlatClip(true, 1));
    assert.notEqual(peelFlatClip(false, 0), peelFlatClip(false, 1));
  });

  it("does not reuse one factory for effects that only shared a name", () => {
    const distinct: Array<[string, string]> = [
      ["wheel", "wheelReverse"],
      ["cube", "box"],
      ["doors", "window"],
      ["doors", "curtains"],
      ["pageCurl", "origami"],
      ["rotate", "ferris"],
      ["rotate", "flip"],
      ["rotate", "switch"],
      ["pageCurl", "peelOff"],
      ["pageCurl", "pageCurlSingle"],
      ["pageCurlSingle", "peelOff"],
      ["wind", "fade"],
      ["crush", "fade"],
      ["wind", "crush"],
      ["dissolve", "fade"],
      ["glitter", "honeycomb"],
      ["glitter", "prestige"],
      ["prestige", "fade"],
    ];
    for (const [a, b] of distinct) {
      assert.notEqual(getTransition(a), getTransition(b), `${a} and ${b}`);
    }
  });
});
