import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blipRidAttr,
  isExternalMediaSrc,
  mediaNamePrefix,
  parseMediaRef,
} from "./media-table.js";

describe("media-table helpers", () => {
  it("classifies src, blip attrs, name prefix, and ref mime", () => {
    assert.equal(isExternalMediaSrc("https://cdn.example/a.png"), true);
    assert.equal(isExternalMediaSrc("file:///tmp/a.png"), true);
    assert.equal(isExternalMediaSrc("data:image/png;base64,AA"), false);
    assert.equal(blipRidAttr("https://x", "rId3"), 'r:link="rId3"');
    assert.equal(blipRidAttr("data:image/png;base64,AA", "rId3"), 'r:embed="rId3"');
    assert.equal(mediaNamePrefix("video/mp4"), "media");
    assert.equal(mediaNamePrefix("model/gltf-binary"), "model3d");
    assert.equal(mediaNamePrefix("image/png"), "image");
    assert.equal(parseMediaRef("pptmedia:video/mp4:abc").mime, "video/mp4");
    assert.equal(parseMediaRef("data:image/svg+xml;utf8,<svg/>").mime, "image/svg+xml");
    assert.equal(parseMediaRef("plain").mime, "image/png");
  });
});
