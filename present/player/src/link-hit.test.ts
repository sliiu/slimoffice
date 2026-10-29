import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type RectShape, type Slide, type TextShape } from "@ppt/core";
import { createScene } from "@ppt/renderer";
import { findHyperlinkAt, nodeShownForPointer } from "./link-hit.js";

function rect(id: string, x: number, y: number, extra: Partial<RectShape> = {}): RectShape {
  return {
    id,
    kind: "rect",
    name: id,
    bbox: { x, y, w: 100, h: 40 },
    zIndex: 0,
    visible: true,
    locked: false,
    opacity: 1,
    transform: identityTransform(),
    fill: { kind: "solid", color: "#123456" },
    ...extra,
  };
}

function slideOf(shapes: Slide["layers"][number]["shapes"]): Slide {
  return {
    id: "s0",
    name: "agenda",
    index: 0,
    layers: [{ id: "layer_main", name: "Main", visible: true, locked: false, shapes }],
  };
}

describe("findHyperlinkAt", () => {
  it("ignores a slide-jump link until the entrance target is shown", () => {
    const hidden = rect("row", 20, 80, {
      opacity: 0,
      hyperlink: { kind: "slide", target: "3" },
    });
    const scene = createScene(slideOf([hidden]), { width: 320, height: 180 });
    const node = scene.root.findById("row");
    assert.ok(node);
    assert.equal(nodeShownForPointer(node), false);
    assert.equal(findHyperlinkAt(scene.root, 40, 90, "hyperlink"), null);

    node.setProperty("opacity", 1);
    const hit = findHyperlinkAt(scene.root, 40, 90, "hyperlink");
    assert.equal(hit?.id, "row");
    assert.equal(hit?.link.kind, "slide");
    assert.equal(hit?.link.target, "3");
  });

  it("ignores a link on a child while its group is still hidden", () => {
    const child = rect("child", 10, 10, { hyperlink: { kind: "slide", target: "2" } });
    const group = {
      id: "row-group",
      kind: "group" as const,
      name: "row",
      bbox: { x: 0, y: 0, w: 120, h: 60 },
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 0,
      transform: identityTransform(),
      children: [child],
    };
    const scene = createScene(slideOf([group]), { width: 320, height: 180 });
    assert.equal(findHyperlinkAt(scene.root, 20, 20, "hyperlink"), null);
    scene.root.findById("row-group")!.setProperty("opacity", 1);
    assert.equal(findHyperlinkAt(scene.root, 20, 20, "hyperlink")?.id, "child");
  });

  it("ignores a run link while that paragraph is still hidden", () => {
    const text: TextShape = {
      id: "bullets",
      kind: "text",
      name: "bullets",
      bbox: { x: 0, y: 0, w: 200, h: 80 },
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      transform: identityTransform(),
      paragraphs: [
        {
          align: "start",
          runs: [{ text: "Scoreboard", hyperlink: { kind: "slide", target: "2" } }],
        },
      ],
    };
    const scene = createScene(slideOf([text]), { width: 320, height: 180 });
    const node = scene.root.findById("bullets")!;
    node.setParaProperty(0, "opacity", 0);
    assert.equal(findHyperlinkAt(scene.root, 20, 16, "hyperlink"), null);
    node.setParaProperty(0, "opacity", 1);
    const hit = findHyperlinkAt(scene.root, 20, 16, "hyperlink");
    assert.equal(hit?.id, "bullets");
    assert.equal(hit?.link.target, "2");
  });

  it("still hits a visible shape that sits above a hidden one", () => {
    const hidden = rect("later", 0, 0, {
      opacity: 0,
      hyperlink: { kind: "slide", target: "9" },
    });
    const shown = rect("now", 0, 0, {
      hyperlink: { kind: "url", target: "https://example.com" },
    });
    const scene = createScene(slideOf([hidden, shown]), { width: 320, height: 180 });
    const hit = findHyperlinkAt(scene.root, 10, 10, "hyperlink");
    assert.equal(hit?.id, "now");
    assert.equal(hit?.link.kind, "url");
  });
});
