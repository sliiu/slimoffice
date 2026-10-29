import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LUCIDE_ICON, normalizeLucideIconName } from "./icons.js";

describe("normalizeLucideIconName", () => {
  it("maps empty, emoji, editor aliases, and known lucide ids", () => {
    assert.equal(normalizeLucideIconName(undefined), DEFAULT_LUCIDE_ICON);
    assert.equal(normalizeLucideIconName("  "), DEFAULT_LUCIDE_ICON);
    assert.equal(normalizeLucideIconName("🧩"), "puzzle");
    assert.equal(normalizeLucideIconName("alignParaLeft"), "text-align-start");
    assert.equal(normalizeLucideIconName("sparkles"), "sparkles");
    assert.equal(normalizeLucideIconName("not-an-icon"), DEFAULT_LUCIDE_ICON);
  });
});
