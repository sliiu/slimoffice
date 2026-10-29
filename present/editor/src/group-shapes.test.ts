import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, Shape } from "@ppt/core";
import { identityTransform } from "@ppt/core";
import { GroupShapesCmd } from "./commands.js";

function rect(id: string, x: number): Shape {
  return {
    id,
    name: id,
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    kind: "rect",
    bbox: { x, y: 10, w: 40, h: 30 },
    transform: identityTransform(),
  };
}

describe("GroupShapesCmd", () => {
  it("selects the new group id after apply", () => {
    const pres = {
      size: { width: 200, height: 100 },
      slides: [
        {
          id: "s1",
          layers: [
            {
              id: "content",
              name: "Content",
              visible: true,
              locked: false,
              shapes: [rect("a", 0), rect("b", 50)],
            },
          ],
        },
      ],
    } as unknown as Presentation;
    const cmd = new GroupShapesCmd(0, ["a", "b"]);
    cmd.apply(pres);
    const groupId = cmd.createdGroupId;
    assert.ok(groupId);
    const shapes = pres.slides[0]!.layers[0]!.shapes;
    assert.equal(shapes.length, 1);
    assert.equal(shapes[0]!.id, groupId);
    assert.equal(shapes[0]!.kind, "group");
  });
});
