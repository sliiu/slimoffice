import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GroupShape, LineShape, PathShape, PolygonShape, RectShape } from "@ppt/core";
import { catForSmartArtLayout, layoutUniqueId, offsetShapeTree, SLIMPPT_LAYOUT_URN } from "./pptx-smartart.js";

const meta = {
  name: "s",
  zIndex: 0,
  visible: true,
  locked: false,
  opacity: 1,
  transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
};

describe("smartart helpers", () => {
  it("maps layout category / urn and offsets nested bboxes", () => {
    assert.equal(layoutUniqueId("process"), `${SLIMPPT_LAYOUT_URN}process`);
    assert.equal(catForSmartArtLayout("orgChart"), "hierarchy");
    assert.equal(catForSmartArtLayout("cycle"), "cycle");
    assert.equal(catForSmartArtLayout("horizontalList"), "horizontal");
    const child: RectShape = {
      ...meta,
      id: "c",
      kind: "rect",
      bbox: { x: 10, y: 20, w: 5, h: 5 },
    };
    const group: GroupShape = {
      ...meta,
      id: "g",
      kind: "group",
      bbox: { x: 0, y: 0, w: 100, h: 100 },
      children: [child],
    };
    const moved = offsetShapeTree(group, -4, 3) as GroupShape;
    assert.deepEqual(moved.bbox, { x: -4, y: 3, w: 100, h: 100 });
    assert.deepEqual(moved.children[0]?.bbox, { x: 6, y: 23, w: 5, h: 5 });
  });

  it("offsets geometry that is not derived from bbox (line endpoints, polygon points, custom path d)", () => {
    const line: LineShape = { ...meta, id: "l", kind: "line", bbox: { x: 100, y: 200, w: 30, h: 0 }, x1: 100, y1: 200, x2: 130, y2: 200 };
    const poly: PolygonShape = { ...meta, id: "p", kind: "polygon", bbox: { x: 100, y: 200, w: 10, h: 10 }, points: [[100, 200], [110, 210]] };
    const path: PathShape = { ...meta, id: "d", kind: "path", bbox: { x: 100, y: 200, w: 10, h: 10 }, d: "M100 200 L110 210 Z" };
    const preset: PathShape = { ...meta, id: "pr", kind: "path", presetType: "chevron", bbox: { x: 100, y: 200, w: 10, h: 10 }, d: "M100 200 L110 210 Z" };
    const movedLine = offsetShapeTree(line, -100, -200) as LineShape;
    assert.deepEqual([movedLine.x1, movedLine.y1, movedLine.x2, movedLine.y2], [0, 0, 30, 0]);
    const movedPoly = offsetShapeTree(poly, -100, -200) as PolygonShape;
    assert.deepEqual(movedPoly.points, [[0, 0], [10, 10]]);
    const movedPath = offsetShapeTree(path, -100, -200) as PathShape;
    assert.equal(movedPath.d.replace(/\s+/g, " "), "M 0 0 L 10 10 Z");
    // preset path 的 d 不参与写出（prstGeom + bbox），保持原样。
    const movedPreset = offsetShapeTree(preset, -100, -200) as PathShape;
    assert.equal(movedPreset.d, preset.d);
    assert.deepEqual(movedPreset.bbox, { x: 0, y: 0, w: 10, h: 10 });
  });
});
