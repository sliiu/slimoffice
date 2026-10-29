import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scaleTextShapeForAutofit } from "./text-autofit.js";
import type { TextShape } from "@ppt/core";

describe("scaleTextShapeForAutofit", () => {
  it("scales run fontSize and paragraph spacing", () => {
    const s = {
      paragraphs: [
        {
          lineHeightPx: 20,
          spaceBeforePx: 4,
          runs: [{ text: "Hi", fontSize: 16 }],
        },
      ],
    } as TextShape;
    const out = scaleTextShapeForAutofit(s, 0.5);
    assert.equal(out.paragraphs[0]?.runs[0]?.fontSize, 8);
    assert.equal(out.paragraphs[0]?.lineHeightPx, 10);
    assert.equal(out.paragraphs[0]?.spaceBeforePx, 2);
    assert.equal(s.paragraphs[0]?.runs[0]?.fontSize, 16);
  });
});
