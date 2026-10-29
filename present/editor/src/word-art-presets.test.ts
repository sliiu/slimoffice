import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultWordArtState, WORDART_PRESETS } from "./word-art-presets.js";

describe("defaultWordArtState", () => {
  it("copies the first gallery preset onto the given text", () => {
    const s = defaultWordArtState("Hello");
    assert.equal(s.text, "Hello");
    assert.equal(s.fillColor, WORDART_PRESETS[0]!.state.fillColor);
    assert.equal(WORDART_PRESETS.length, 17);
    const tan = WORDART_PRESETS.find((p) => p.id === "fillTan");
    assert.equal(tan?.state.shadowKind, "inner");
    const grad = WORDART_PRESETS.find((p) => p.id === "gradientAccent1");
    assert.equal(grad?.state.fillGradient?.angle, 90);
    const refl = WORDART_PRESETS.find((p) => p.id === "fillAccent1Reflection");
    assert.equal(refl?.state.shadowKind, "reflection");
  });
});
