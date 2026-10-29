import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gridForLayout, imagesPerSlide } from "./photo-album-layout.js";

describe("photo-album layout", () => {
  it("maps layout ids to grid and images-per-slide", () => {
    assert.equal(imagesPerSlide(undefined), 1);
    assert.equal(imagesPerSlide("4pic"), 4);
    assert.equal(imagesPerSlide("2pic"), 2);
    assert.deepEqual(gridForLayout("4pic"), { cols: 2, rows: 2 });
    assert.deepEqual(gridForLayout("2picVert"), { cols: 1, rows: 2 });
    assert.deepEqual(gridForLayout("2pic"), { cols: 2, rows: 1 });
    assert.deepEqual(gridForLayout(undefined), { cols: 1, rows: 1 });
  });
});
