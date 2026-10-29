import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wordArtFitTransform } from "./text-wordart.js";

describe("wordArtFitTransform", () => {
  it("stretches a short glyph to the shape box", () => {
    const fit = wordArtFitTransform({ x: 10, y: 20, w: 40, h: 30 }, { x: 100, y: 200, w: 80, h: 90 });
    assert.ok(fit);
    assert.equal(fit.sx, 2);
    assert.equal(fit.sy, 3);
    // ink origin lands on the box origin
    assert.equal(10 * fit.sx + fit.tx, 100);
    assert.equal(20 * fit.sy + fit.ty, 200);
    // ink far corner lands on the box far corner
    assert.equal(50 * fit.sx + fit.tx, 180);
    assert.equal(50 * fit.sy + fit.ty, 290);
  });

  it("skips a glyph that already fills the box", () => {
    assert.equal(
      wordArtFitTransform({ x: 0, y: 0, w: 72, h: 70 }, { x: 0, y: 0, w: 72.5, h: 70.4 }),
      null,
    );
  });

  it("skips empty ink", () => {
    assert.equal(wordArtFitTransform({ x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 40, h: 40 }), null);
  });
});
