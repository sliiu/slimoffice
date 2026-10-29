import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { combinedReadRatio, mediaKindOf, progressLabel } from "./file-kind";

describe("file read progress", () => {
  it("recognizes pictures, video, and audio", () => {
    assert.equal(mediaKindOf({ name: "a.PNG", type: "" }), "image");
    assert.equal(mediaKindOf({ name: "clip", type: "video/mp4" }), "video");
    assert.equal(mediaKindOf({ name: "talk.mp3" }), "audio");
    assert.equal(mediaKindOf({ name: "deck.pptx" }), null);
  });

  it("weights the current file into the overall ratio", () => {
    assert.equal(combinedReadRatio(500, 0.5, 500, 1000), 0.75);
    assert.equal(Number.isNaN(combinedReadRatio(0, 1, 10, 0)), true);
  });

  it("appends a percent only when the ratio is known", () => {
    assert.equal(progressLabel("Reading deck.pptx", 0.42), "Reading deck.pptx 42%");
    assert.equal(progressLabel("Opening deck.pptx", Number.NaN), "Opening deck.pptx");
  });
});
