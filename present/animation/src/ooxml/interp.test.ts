import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatColor, lerpColor, lerpNumber, parseColor, sampleKeyframes } from "./interp.js";

describe("parseColor / formatColor", () => {
  it("parses hash, bare hex, rgb, and rgba", () => {
    assert.deepEqual(parseColor("#ff0000"), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("00ff00"), { r: 0, g: 255, b: 0, a: 1 });
    assert.deepEqual(parseColor("rgb(0, 0, 255)"), { r: 0, g: 0, b: 255, a: 1 });
    assert.deepEqual(parseColor("rgba(10,20,30,0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
    assert.equal(parseColor("nope"), null);
    assert.equal(parseColor(null), null);
  });

  it("formats opaque colors as hex and translucent as rgba", () => {
    assert.equal(formatColor({ r: 255, g: 0, b: 0, a: 1 }), "#ff0000");
    assert.equal(formatColor({ r: 1, g: 2, b: 3, a: 0.5 }), "rgba(1,2,3,0.500)");
  });
});

describe("lerp / sampleKeyframes", () => {
  it("lerps numbers and colors", () => {
    assert.equal(lerpNumber(0, 10, 0.5), 5);
    assert.deepEqual(lerpColor({ r: 0, g: 0, b: 0, a: 0 }, { r: 10, g: 20, b: 30, a: 1 }, 0.5), {
      r: 5,
      g: 10,
      b: 15,
      a: 0.5,
    });
  });

  it("samples linear and discrete keyframes", () => {
    const keys = [
      { time: 0, value: 0 },
      { time: 1, value: 10 },
    ];
    assert.equal(sampleKeyframes(keys, 0.5, "number", "lin"), 5);
    assert.equal(sampleKeyframes(keys, 0.5, "number", "discrete"), 0);
    assert.equal(sampleKeyframes([], 0.5, "number"), undefined);
    assert.equal(sampleKeyframes([{ time: 0, value: 7 }], 1, "number"), 7);
  });
});
