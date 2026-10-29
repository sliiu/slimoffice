import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Shape } from "@ppt/core";
import { needs3DBake } from "./runtime";
import { shape3DInfo, shape3DPathD, shape3DPad, shapeSupports3D } from "./shape-path";

const bbox = { x: 10, y: 20, w: 100, h: 40 };

describe("shape 3D path", () => {
  it("accepts image, autoshape, and text", () => {
    assert.equal(shapeSupports3D({ kind: "text", bbox } as Shape), true);
    assert.equal(shapeSupports3D({ kind: "rect", bbox } as Shape), true);
    assert.equal(shape3DPad("image"), 0.05);
    assert.equal(shape3DPad("text"), 0.05);
    assert.equal(shape3DPad("rect"), 0.15);
  });

  it("builds a local ellipse and shifts absolute polygon points into the bbox", () => {
    const d = shape3DPathD({ kind: "ellipse", bbox } as Shape);
    assert.ok(d);
    assert.match(d, /^M 50 0 C/);
    assert.doesNotMatch(d, /[Aa] /);
    const poly = {
      kind: "polygon",
      bbox,
      points: [
        [10, 20],
        [110, 20],
        [60, 60],
      ],
    } as Shape;
    assert.equal(shape3DPathD(poly), "M 0 0 L 100 0 L 50 40 Z");
  });

  it("queues a rotated rectangle for bake and skips text", () => {
    const meta3D = {
      sp3d: {},
      scene3d: { camera: { rot: { lat: 20, lon: 10, rev: 0 } } },
    };
    assert.equal(needs3DBake({ kind: "rect", id: "a", bbox, meta3D } as Shape), true);
    assert.equal(needs3DBake({ kind: "text", id: "b", bbox, meta3D } as Shape), false);
    const word = { kind: "text", id: "c", bbox, body3D: meta3D } as Shape;
    assert.equal(shape3DInfo(word), meta3D);
    assert.equal(needs3DBake(word), true);
  });
});
