import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinPath } from "./zip.js";

describe("joinPath", () => {
  it("resolves relative OOXML targets against a part path", () => {
    assert.equal(joinPath("ppt/slides/slide1.xml", "../media/image1.png"), "ppt/media/image1.png");
    assert.equal(joinPath("ppt/presentation.xml", "slides/slide1.xml"), "ppt/slides/slide1.xml");
    assert.equal(joinPath("ppt/a.xml", "/ppt/b.xml"), "ppt/b.xml");
    assert.equal(joinPath("ppt/a.xml", "https://cdn.example/x.png"), "https://cdn.example/x.png");
    assert.equal(joinPath("ppt/slides/slide1.xml", "../../xl/workbook.xml"), "xl/workbook.xml");
  });
});
