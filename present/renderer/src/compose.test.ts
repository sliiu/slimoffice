import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type RectShape, type Slide, type SlideMaster } from "@ppt/core";
import { composeSlideForRender } from "./compose.js";

function rect(id: string, extra: Partial<Pick<RectShape, "placeholder" | "userDrawn">> = {}): RectShape {
  return {
    id,
    kind: "rect",
    name: id,
    bbox: { x: 0, y: 0, w: 10, h: 10 },
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
    fill: { kind: "solid", color: "#f00" },
    ...extra,
  };
}

function slide(showMasterSp?: boolean): Slide {
  return {
    id: "s0",
    name: "cover",
    index: 0,
    layoutRef: { masterId: "m1", layoutId: "l1" },
    ...(showMasterSp === false ? { showMasterSp: false } : {}),
    layers: [
      {
        id: "layer_main",
        name: "Main",
        visible: true,
        locked: false,
        shapes: [rect("sp_content")],
      },
    ],
  };
}

const masters: SlideMaster[] = [
  {
    id: "m1",
    name: "Master",
    shapes: [
      rect("chrome_spine", { userDrawn: true }),
      rect("ph_title", { placeholder: { type: "title", idx: "0" } }),
    ],
    layouts: [
      {
        id: "l1",
        name: "Cover",
        shapes: [rect("ph_ctrTitle", { placeholder: { type: "ctrTitle", idx: "0" } })],
      },
    ],
  },
];

describe("composeSlideForRender", () => {
  it("composites non-placeholder master chrome under slide content", () => {
    const layers = composeSlideForRender(slide(), masters);
    assert.deepEqual(layers.map((l) => l.id), ["master", "layer_main"]);
    assert.equal(layers[0]!.shapes[0]!.id, "master__chrome_spine");
    assert.equal(layers[0]!.shapes[0]!.locked, true);
    assert.ok(!layers.some((l) => l.shapes.some((s) => s.id.includes("ph_title") || s.id.includes("ph_ctrTitle"))));
  });

  it("hides master graphics when showMasterSp is false", () => {
    const layers = composeSlideForRender(slide(false), masters);
    assert.deepEqual(layers.map((l) => l.id), ["layer_main"]);
    assert.equal(layers[0]!.shapes[0]!.id, "sp_content");
  });
});
