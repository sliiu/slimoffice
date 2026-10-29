import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type Slide, type TextShape } from "@ppt/core";
import { commentShapeCaption, commentShapeLabel, shapeAtPoint } from "./comment-target.js";
import type { Shape } from "@ppt/core";

function text(id: string, label: string, x: number, y: number): TextShape {
  return {
    id,
    kind: "text",
    name: id,
    bbox: { x, y, w: 100, h: 40 },
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
    paragraphs: [{ align: "start", runs: [{ text: label }] }],
  };
}

function slide(shapes: Slide["layers"][number]["shapes"]): Slide {
  return {
    id: "s",
    layers: [{ id: "main", name: "main", visible: true, shapes }],
  } as Slide;
}

describe("shapeAtPoint", () => {
  it("returns the text under the point and ignores decorations", () => {
    const s = slide([
      text("dec_corner", "decoration", 0, 0),
      text("title", "Hello", 20, 20),
    ]);
    assert.equal(shapeAtPoint(s, 30, 30)?.id, "title");
    assert.equal(commentShapeCaption(shapeAtPoint(s, 30, 30)!).text, "Hello");
    assert.equal(shapeAtPoint(s, 5, 5), undefined);
    assert.equal(shapeAtPoint(s, 500, 500), undefined);
    assert.equal(commentShapeLabel(shapeAtPoint(s, 30, 30)!), "Hello");
  });

  it("labels a named shape as kind and name", () => {
    const box = {
      id: "target",
      kind: "rect",
      name: "target",
      bbox: { x: 0, y: 0, w: 40, h: 40 },
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      transform: identityTransform(),
    } as Shape;
    assert.equal(commentShapeLabel(box), "Rectangle · target");
  });
});
