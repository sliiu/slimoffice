import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Shape, Transform } from "@ppt/core";
import { SceneNode } from "./scene-node";
import { accumulatedAffine } from "./node-affine";

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
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    transform,
    ...partial,
  } as Shape;
}

describe("accumulated affine", () => {
  it("rotates a child around the group center", () => {
    const group = new SceneNode(
      shape({
        id: "g",
        kind: "group",
        bbox: { x: 0, y: 0, w: 200, h: 200 },
        children: [shape({ id: "c", kind: "rect", bbox: { x: 100, y: 100, w: 10, h: 10 } })],
      }),
      "L",
    );
    group.rotation = 90;
    const child = group.children[0]!;
    const m = accumulatedAffine(child);
    const x = 105;
    const y = 105;
    const px = m.a * x + m.c * y + m.e;
    const py = m.b * x + m.d * y + m.f;
    assert.ok(Math.abs(px - 95) < 1e-6, String(px));
    assert.ok(Math.abs(py - 105) < 1e-6, String(py));
  });
});