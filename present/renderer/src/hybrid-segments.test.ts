import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Shape, Transform } from "@ppt/core";
import { SceneNode } from "./scene-node";
import { buildHybridSegments } from "./hybrid-segments";

const transform: Transform = {
  tx: 0,
  ty: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
};

function shape(partial: Record<string, unknown>): Shape {
  return {
    name: String(partial.id),
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    bbox: { x: 0, y: 0, w: 40, h: 20 },
    transform,
    ...partial,
  } as Shape;
}

describe("hybrid segments", () => {
  it("peels a 3D child out of a group and keeps the following text above it", () => {
    const group = new SceneNode(
      shape({
        id: "g",
        kind: "group",
        children: [
          shape({ id: "plain", kind: "rect" }),
          shape({ id: "box", kind: "rect", meta3D: { sp3d: { extrusionH: 12 } } }),
          shape({ id: "label", kind: "text", paragraphs: [] }),
          shape({ id: "photo", kind: "image", src: "data:image/png;base64,xx" }),
        ],
      }),
      "L",
    );
    const plan = buildHybridSegments([group]);
    assert.deepEqual(
      plan.map((s) => ({ kind: s.kind, ids: s.ids })),
      [
        { kind: "svg", ids: ["plain"] },
        { kind: "webgl", ids: ["box"] },
        { kind: "svg", ids: ["label", "photo"] },
      ],
    );
  });

  it("sends a top-level image to canvas and a 3D image to webgl", () => {
    const image = new SceneNode(shape({ id: "im", kind: "image", src: "x" }), "L");
    const spun = new SceneNode(
      shape({
        id: "spun",
        kind: "image",
        src: "x",
        meta3D: { sp3d: {}, scene3d: { camera: { rot: { lat: 20, lon: 10, rev: 0 } } } },
      }),
      "L",
    );
    const plan = buildHybridSegments([image, spun]);
    assert.deepEqual(
      plan.map((s) => s.kind),
      ["canvas", "webgl"],
    );
  });
});