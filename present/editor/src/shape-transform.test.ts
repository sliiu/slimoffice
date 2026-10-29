import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ancestorFlipParity, applyNodeTransform, inverseNodeTransform, oppositeHandlePoint, shapeCenter } from "./shape-transform.js";

describe("shape-transform", () => {
  it("centers, opposite handles, and round-trips translate", () => {
    assert.deepEqual(shapeCenter({ bbox: { x: 10, y: 20, w: 40, h: 10 } }), { x: 30, y: 25 });
    assert.deepEqual(oppositeHandlePoint({ x: 0, y: 0, w: 10, h: 8 }, "se"), { x: 0, y: 0 });
    assert.deepEqual(oppositeHandlePoint({ x: 0, y: 0, w: 10, h: 8 }, "nw"), { x: 10, y: 8 });
    const node = {
      bbox: { x: 0, y: 0, w: 10, h: 10 },
      transform: { tx: 5, ty: -3, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
    };
    const world = applyNodeTransform(node, 2, 4);
    assert.deepEqual(world, { x: 7, y: 1 });
    assert.deepEqual(inverseNodeTransform(node, world.x, world.y), { x: 2, y: 4 });
    assert.deepEqual(
      ancestorFlipParity([
        {
          transform: { tx: 0, ty: 0, rotation: 0, scaleX: -1, scaleY: 1, skewX: 0, skewY: 0 },
        } as never,
      ]),
      { x: -1, y: 1 },
    );
  });
});
