import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Presentation, TextShape } from "@ppt/core";
import { validateAndRepairPresentation } from "./validate.js";

function deck(shape: TextShape): Presentation {
  return {
    size: { width: 1280, height: 720 },
    slides: [{ id: "s0", layers: [{ id: "l0", shapes: [shape] }] }],
  } as Presentation;
}

describe("text overflow repair", () => {
  it("shrinks free text that does not fit its box and leaves a fitting line alone", () => {
    const tight: TextShape = {
      id: "t0",
      kind: "text",
      name: "body",
      bbox: { x: 80, y: 160, w: 80, h: 28 },
      paragraphs: [{ runs: [{ text: "twelve people editing one page at the same time with notes", fontSize: 28, color: "#111111" }] }],
    } as TextShape;
    const fitted: TextShape = {
      id: "t1",
      kind: "text",
      name: "title",
      bbox: { x: 80, y: 40, w: 600, h: 80 },
      paragraphs: [{ runs: [{ text: "Numbers", fontSize: 32, color: "#111111" }] }],
    } as TextShape;
    const pres = deck(tight);
    pres.slides[0]!.layers[0]!.shapes.push(fitted);
    const report = validateAndRepairPresentation(pres);
    assert.equal(tight.autoFit?.kind, "normAutofit");
    assert.equal(fitted.autoFit, undefined);
    assert.ok(report.fixes.some((f) => f.kind === "autofit"));
  });
});
