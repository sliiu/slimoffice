import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowedProductHome, resolveEndScreenKind } from "./end-screen.js";

describe("end screen", () => {
  it("keeps the editor exit screen unless a product home or a live audience is set", () => {
    assert.equal(resolveEndScreenKind({}), "exit");
    assert.equal(resolveEndScreenKind({ homeHref: "https://slimppt.com" }), "share");
    assert.equal(resolveEndScreenKind({ homeHref: "https://slimppt.cn", follow: true }), "quiet");
    assert.equal(resolveEndScreenKind({ endQuiet: true, homeHref: "https://slimppt.com" }), "quiet");
  });

  it("accepts only the two product sites", () => {
    assert.equal(allowedProductHome("https://slimppt.com"), "https://slimppt.com");
    assert.equal(allowedProductHome("https://slimppt.cn"), "https://slimppt.cn");
    assert.equal(allowedProductHome("https://slimppt.com/deck"), undefined);
    assert.equal(allowedProductHome("http://slimppt.com"), undefined);
    assert.equal(allowedProductHome("https://evil.example"), undefined);
  });
});
