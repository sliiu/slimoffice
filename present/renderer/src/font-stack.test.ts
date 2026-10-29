import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withFontFallback } from "./font-stack.js";

describe("withFontFallback", () => {
  it("appends a class-matched generic so a missing typeface never lands on the browser's serif default", () => {
    assert.match(withFontFallback("Inter"), /^Inter, .*sans-serif$/);
    assert.match(withFontFallback("Helvetica Neue"), /^"Helvetica Neue", .*sans-serif$/);
    assert.match(withFontFallback("Playfair Display"), /^"Playfair Display", .*, serif$/);
    assert.match(withFontFallback("Songti SC"), /serif$/);
    assert.match(withFontFallback("宋体"), /serif$/);
    assert.match(withFontFallback("JetBrains Mono"), /monospace$/);
    assert.match(withFontFallback("Consolas"), /monospace$/);
  });

  it("passes stacks ending in a generic through, completes those that do not, and defaults missing families to sans", () => {
    const stack = `"Inter", "Noto Sans SC", sans-serif`;
    assert.equal(withFontFallback(stack), stack);
    assert.equal(withFontFallback("serif"), "serif");
    // A stack of named faces still gets the generic, judged from the lead family.
    assert.match(withFontFallback(`Inter, "Noto Sans SC"`), /^Inter, "Noto Sans SC", .*sans-serif$/);
    assert.match(withFontFallback(`"JetBrains Mono", "Noto Sans SC", Inter`), /^"JetBrains Mono", "Noto Sans SC", Inter, .*monospace$/);
    assert.match(withFontFallback(`"Songti SC", Inter`), /serif$/);
    assert.match(withFontFallback(undefined), /sans-serif$/);
    // CJK fallbacks ride along so Han glyphs do not fall to a Latin-only face.
    assert.match(withFontFallback("Inter"), /PingFang SC/);
  });
});
