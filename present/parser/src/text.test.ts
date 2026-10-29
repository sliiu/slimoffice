import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAction, splitTextByScript } from "./text.js";

describe("splitTextByScript", () => {
  it("splits latin and CJK, attaching punctuation to the current run", () => {
    assert.deepEqual(splitTextByScript(""), [{ text: "", script: "neutral" }]);
    const parts = splitTextByScript("Hello世界");
    assert.equal(parts.length, 2);
    assert.equal(parts[0]?.script, "latin");
    assert.equal(parts[0]?.text, "Hello");
    assert.equal(parts[1]?.script, "ea");
    assert.equal(parts[1]?.text, "世界");
  });
});

describe("mapAction", () => {
  it("maps ppaction URIs, preferring lastslideviewed over lastslide", () => {
    assert.equal(mapAction("ppaction://hlinksldjump"), "slide");
    assert.equal(mapAction("ppaction://hlinkshowjump?jump=nextslide"), "next");
    assert.equal(mapAction("ppaction://hlinkshowjump?jump=lastslideviewed"), "back");
    assert.equal(mapAction("ppaction://hlinkshowjump?jump=lastslide"), "last");
    assert.equal(mapAction("ppaction://hlinkshowjump?jump=endshow"), "endShow");
    assert.equal(mapAction("http://example.com"), null);
  });
});
