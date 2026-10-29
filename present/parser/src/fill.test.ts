import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modulateColor, modulatePaint } from "./fill.js";

describe("modulateColor / modulatePaint", () => {
  it("lightens toward white and darkens toward black", () => {
    assert.equal(modulateColor("#000000", "lighten"), "#808080");
    assert.equal(modulateColor("#000000", "lightenLess"), "#333333");
    assert.equal(modulateColor("#ffffff", "darken"), "#808080");
    assert.equal(modulateColor("#ffffff", "darkenLess"), "#cccccc");
  });

  it("applies the modifier to solid paint and leaves image paint unchanged", () => {
    assert.deepEqual(modulatePaint({ kind: "solid", color: "#000000" }, "lighten"), {
      kind: "solid",
      color: "#808080",
    });
    assert.deepEqual(modulatePaint({ kind: "solid", color: "#111111" }, "none"), { kind: "none" });
    const img = { kind: "image" as const, src: "x", fit: "cover" as const };
    assert.equal(modulatePaint(img, "darken"), img);
    assert.equal(modulatePaint(undefined, "lighten"), undefined);
  });
});
