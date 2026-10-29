import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SMARTART_LAYOUT_KINDS,
  buildSmartArtShapes,
  smartArtLayoutFromUniqueId,
} from "./smartart-layouts.js";

const items = [
  { id: "a", text: "A" },
  { id: "b", text: "B" },
  { id: "c", text: "C" },
];
const bbox = { x: 0, y: 0, w: 400, h: 300 };

describe("smartart layouts", () => {
  it("maps Office uniqueId tails onto the new layouts", () => {
    assert.equal(
      smartArtLayoutFromUniqueId("urn:microsoft.com/office/officeart/2005/8/layout/gear1"),
      "gear",
    );
    assert.equal(smartArtLayoutFromUniqueId("urn:slimppt:smartart/pie"), "pie");
    assert.equal(
      smartArtLayoutFromUniqueId("urn:microsoft.com/office/officeart/2005/8/layout/process1"),
      "process",
    );
    assert.equal(
      smartArtLayoutFromUniqueId("urn:microsoft.com/office/officeart/2005/8/layout/alternatingflow"),
      "alternating",
    );
    assert.equal(
      smartArtLayoutFromUniqueId("urn:microsoft.com/office/officeart/2005/8/layout/picturecaptionlist"),
      "pictureCaption",
    );
    assert.equal(smartArtLayoutFromUniqueId("urn:slimppt:smartart/hexagon"), "hexagon");
  });

  it("builds a shape for every registered layout", () => {
    for (const layout of SMARTART_LAYOUT_KINDS) {
      const shapes = buildSmartArtShapes(layout, items, bbox);
      assert.ok(shapes.length > 0, layout);
    }
  });
});
