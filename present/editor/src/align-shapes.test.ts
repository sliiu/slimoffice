import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, Shape } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import { AlignShapesCmd } from "./commands.js";

function rect(id: string, x: number, y: number): Shape {
  return {
    id,
    name: id,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "rect",
    bbox: { x, y, w: 40, h: 20 },
    transform: identityTransform(),
  };
}

function presWith(shapes: Shape[]): Presentation {
  return {
    size: { width: 200, height: 100 },
    slides: [
      {
        id: "s1",
        layers: [{ id: "content", name: "Content", visible: true, locked: false, shapes }],
      },
    ],
  } as unknown as Presentation;
}

describe("AlignShapesCmd", () => {
  it("aligns a single shape to the slide and reverts", () => {
    const a = rect("a", 30, 10);
    const pres = presWith([a]);
    const right = new AlignShapesCmd(0, ["a"], "right");
    right.apply(pres);
    assert.equal(a.bbox.x, 160);
    const middle = new AlignShapesCmd(0, ["a"], "centerV");
    middle.apply(pres);
    assert.equal(a.bbox.y, 40);
    middle.revert(pres);
    right.revert(pres);
    assert.deepEqual([a.bbox.x, a.bbox.y], [30, 10]);
  });

  it("aligns several shapes to their union bbox", () => {
    const a = rect("a", 10, 10);
    const b = rect("b", 80, 50);
    const pres = presWith([a, b]);
    new AlignShapesCmd(0, ["a", "b"], "left").apply(pres);
    assert.equal(a.bbox.x, 10);
    assert.equal(b.bbox.x, 10);
  });
});
