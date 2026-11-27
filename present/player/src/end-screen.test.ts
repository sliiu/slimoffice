import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedProductHome, resolveEndScreenKind } from "./end-screen.js";

describe("end screen", () => {
  it("keeps the editor exit screen unless a product home or a live audience is set", () => {
    assert.equal(resolveEndScreenKind({}), "exit");
    assert.equal(resolveEndScreenKind({ homeHref: "https://parchon.sliiu.com" }), "share");
    assert.equal(resolveEndScreenKind({ homeHref: "https://parchon.sliiu.cn", follow: true }), "quiet");
    assert.equal(resolveEndScreenKind({ endQuiet: true, homeHref: "https://parchon.sliiu.com" }), "quiet");
  });

  it("accepts only the two product sites", () => {
    assert.equal(allowedProductHome("https://parchon.sliiu.com"), "https://parchon.sliiu.com");
    assert.equal(allowedProductHome("https://parchon.sliiu.cn"), "https://parchon.sliiu.cn");
    assert.equal(allowedProductHome("https://parchon.sliiu.com/deck"), undefined);
    assert.equal(allowedProductHome("http://parchon.sliiu.com"), undefined);
    assert.equal(allowedProductHome("https://evil.example"), undefined);
  });
});
