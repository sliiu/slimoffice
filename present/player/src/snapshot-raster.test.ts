import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SCREEN_DPI, snapshotPixelRatio } from "./snapshot-raster.js";

describe("snapshotPixelRatio", () => {
  it("maps dpi and legacy scale onto the 96-dpi baseline", () => {
    assert.equal(snapshotPixelRatio({ width: 960 }), 1);
    assert.equal(snapshotPixelRatio({ width: 960 }, { dpi: 192 }), 2);
    assert.equal(snapshotPixelRatio({ width: 960 }, { scale: 2 }), 2);
    assert.equal(SCREEN_DPI, 96);
  });
});
