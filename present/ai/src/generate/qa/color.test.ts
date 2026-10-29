import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  contrastRatio,
  ensureContrast,
  parseHex,
  readableTextColor,
  SAFE_TEXT_DARK,
  SAFE_TEXT_LIGHT,
  toHex,
} from "./color.js";
import { paletteTextCandidates, pickRepairColor } from "./validate.js";

describe("qa color", () => {
  it("parses hex, reports WCAG contrast, and picks readable text", () => {
    assert.deepEqual(parseHex("#abc"), { r: 170, g: 187, b: 204 });
    assert.equal(parseHex("nope"), null);
    assert.equal(toHex({ r: 255, g: 0, b: 16 }), "#ff0010");
    assert.equal(Math.round(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })), 21);
    assert.equal(readableTextColor({ r: 255, g: 255, b: 255 }), SAFE_TEXT_DARK);
    assert.equal(readableTextColor({ r: 0, g: 0, b: 0 }), SAFE_TEXT_LIGHT);
    const bg = { r: 255, g: 255, b: 255 };
    const pale = { r: 220, g: 220, b: 220 };
    const target = parseHex(SAFE_TEXT_DARK)!;
    assert.ok(contrastRatio(ensureContrast(pale, bg, target, 4.5), bg) >= 4.5);
  });
});

describe("qa contrast repair picks palette tokens first", () => {
  it("uses the deck's own ink / onPhoto / bg before falling back to the safe colors", () => {
    const colors = { bg: "#0A0A0B", ink: "#F1EFEA", muted: "#9A958C", accent: "#E5484D", onPhoto: "#F8FAFC" };
    const cands = paletteTextCandidates(colors);
    assert.deepEqual(cands.map((c) => c.hex), ["#F1EFEA", "#F8FAFC", "#0A0A0B", "#9A958C"]);
    // Dark field → the palette's ink (kept in its original spelling), never a third near-white.
    assert.equal(pickRepairColor(parseHex("#0A0A0B")!, 4.5, cands), "#F1EFEA");
    // Light field → the palette's bg is the darkest token that clears the threshold.
    assert.equal(pickRepairColor(parseHex("#FFFFFF")!, 4.5, cands), "#0A0A0B");
    // Nothing in the palette clears a mid-grey field → safe color as last resort.
    const greys = paletteTextCandidates({ ink: "#777777", bg: "#888888" });
    assert.equal(pickRepairColor(parseHex("#808080")!, 4.5, greys), readableTextColor(parseHex("#808080")!));
    assert.deepEqual(paletteTextCandidates(undefined), []);
  });
});
