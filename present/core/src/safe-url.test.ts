import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSafeExternalUrl, sanitizeExternalUrl, sanitizeHyperlinkRef } from "./safe-url.js";

describe("sanitizeExternalUrl", () => {
  it("allows http / https / mailto and adds https when protocol is missing", () => {
    assert.equal(sanitizeExternalUrl("https://example.com/a"), "https://example.com/a");
    assert.equal(sanitizeExternalUrl("http://example.com"), "http://example.com/");
    assert.equal(sanitizeExternalUrl("mailto:ada@example.com"), "mailto:ada@example.com");
    assert.equal(sanitizeExternalUrl("example.com/x"), "https://example.com/x");
  });

  it("rejects javascript, data, and empty values", () => {
    assert.equal(sanitizeExternalUrl("javascript:alert(1)"), undefined);
    assert.equal(sanitizeExternalUrl("data:text/html,hi"), undefined);
    assert.equal(sanitizeExternalUrl("   "), undefined);
    assert.equal(sanitizeExternalUrl(null), undefined);
    assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
    assert.equal(isSafeExternalUrl("https://ok.com"), true);
  });
});

describe("sanitizeHyperlinkRef", () => {
  it("keeps a safe url target", () => {
    const out = sanitizeHyperlinkRef({ kind: "url", target: "example.com" });
    assert.equal(out?.target, "https://example.com/");
  });

  it("drops an unsafe url-only hyperlink", () => {
    assert.equal(sanitizeHyperlinkRef({ kind: "url", target: "javascript:alert(1)" }), undefined);
  });

  it("leaves slide links untouched", () => {
    const src = { kind: "slide" as const, target: "3" };
    assert.deepEqual(sanitizeHyperlinkRef(src), src);
  });
});
