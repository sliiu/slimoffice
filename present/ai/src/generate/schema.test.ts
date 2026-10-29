import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bannedLayoutsForFamily, inferStyleFamilyFromGuidance } from "./schema.js";

describe("style family routing", () => {
  it("infers family from cues and lists banned layouts", () => {
    assert.equal(inferStyleFamilyFromGuidance({ topic: "瑞士国际主义海报" }), "swiss");
    assert.equal(inferStyleFamilyFromGuidance({ topic: "a dashboard for ops" }), "data-journalism");
    assert.equal(inferStyleFamilyFromGuidance({ topic: "hello" }), undefined);
    assert.ok(bannedLayoutsForFamily("swiss").includes("image-text"));
    assert.deepEqual(bannedLayoutsForFamily("nope"), []);
  });
});
