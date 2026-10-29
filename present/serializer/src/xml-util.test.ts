import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  angleToEmu,
  attrs,
  esc,
  firstCssTypeface,
  hex,
  parseColor,
  pxToEmu,
  pxToHundredthPt,
  tag,
  underlineToOoxml,
} from "./xml-util.js";

describe("xml-util", () => {
  it("escapes XML and skips empty attrs", () => {
    assert.equal(esc(`a&b<"'>`), "a&amp;b&lt;&quot;&apos;&gt;");
    assert.equal(esc(undefined), "");
    assert.equal(attrs({ a: 1, b: false, c: undefined, d: true }), ' a="1" d');
    assert.equal(tag("p:sp", { id: 1 }), '<p:sp id="1"/>');
    assert.equal(tag("a:t", {}, "hi"), "<a:t>hi</a:t>");
  });

  it("converts units and underline / typeface / color", () => {
    assert.equal(pxToEmu(1), 9525);
    assert.equal(pxToHundredthPt(1), 75);
    assert.equal(angleToEmu(1), 60000);
    assert.equal(underlineToOoxml(true), "sng");
    assert.equal(underlineToOoxml("double"), "dbl");
    assert.equal(underlineToOoxml("dashed"), "dash");
    assert.equal(underlineToOoxml(undefined), undefined);
    assert.equal(firstCssTypeface('"Tahoma, Calibri", Tahoma'), "Tahoma, Calibri");
    assert.equal(firstCssTypeface("Inter, sans-serif"), "Inter");
    assert.deepEqual(parseColor("#abc"), { hex: "AABBCC" });
    assert.deepEqual(parseColor("rgba(255,0,0,0.5)"), { hex: "FF0000", alpha: 0.5 });
    assert.equal(hex("not-a-color"), "000000");
  });
});
