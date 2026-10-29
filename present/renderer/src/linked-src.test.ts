import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { displayImageSrc, isFileLinkedSrc, linkedImageLabel } from "./linked-src.js";

describe("linked-src", () => {
  it("detects file: URLs and extracts a short label", () => {
    assert.equal(isFileLinkedSrc("file:///tmp/photo.png"), true);
    assert.equal(isFileLinkedSrc("https://x/a.png"), false);
    assert.equal(linkedImageLabel("file:///Users/me/cover.png"), "cover.png");
    assert.equal(displayImageSrc("https://cdn.example/a.png"), "https://cdn.example/a.png");
    assert.ok(displayImageSrc("file:///no-such/missing.png").startsWith("data:image/svg+xml"));
  });
});
