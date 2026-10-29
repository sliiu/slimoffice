import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityTransform, type Presentation, type Shape, type TextParagraph, type TextRun } from "@ppt/core";
import { SetTextStyleCmd } from "./commands.js";
import { applyStyleToCharRanges, runAtCharRanges } from "./text-char-style.js";

function para(text: string, color: string, fill?: string): TextParagraph {
  const run: TextRun = { text, color, fontSize: 84, fontWeight: 700 };
  if (fill) run.fill = { kind: "solid", color: fill };
  return { runs: [run] };
}

describe("applyStyleToCharRanges", () => {
  it("changes only the selected character and keeps the solid fill in sync", () => {
    const next = applyStyleToCharRanges(
      [para("70+", "#1a2233", "#0071e3")],
      [{ paragraph: 0, start: 0, end: 1 }],
      { color: "#ff0000" },
    );
    const runs = next[0]!.runs;
    assert.deepEqual(runs.map((r) => r.text), ["7", "0+"]);
    assert.equal(runs[0]!.color, "#ff0000");
    assert.equal(runs[0]!.fill?.kind === "solid" && runs[0]!.fill.color, "#ff0000");
    assert.equal(runs[1]!.color, "#1a2233");
    assert.equal(runs[1]!.fill?.kind === "solid" && runs[1]!.fill.color, "#0071e3");
    assert.equal(runs[0]!.fontSize, 84);
    assert.equal(runs[1]!.fontWeight, 700);
  });

  it("changes a character in the middle", () => {
    const next = applyStyleToCharRanges(
      [para("70+", "#111111")],
      [{ paragraph: 0, start: 1, end: 2 }],
      { fontWeight: 400 },
    );
    assert.deepEqual(next[0]!.runs.map((r) => [r.text, r.fontWeight]), [
      ["7", 700],
      ["0", 400],
      ["+", 700],
    ]);
  });

  it("leaves a gradient fill on the untouched slice", () => {
    const source: TextParagraph[] = [{
      runs: [{
        text: "70+",
        color: "#111111",
        fill: { kind: "linear", angle: 0, stops: [{ offset: 0, color: "#111111" }, { offset: 1, color: "#0071e3" }] },
      }],
    }];
    const next = applyStyleToCharRanges(source, [{ paragraph: 0, start: 0, end: 1 }], { color: "#00ff00" });
    assert.equal(next[0]!.runs[0]!.color, "#00ff00");
    assert.equal(next[0]!.runs[0]!.fill?.kind, "linear");
    assert.equal(next[0]!.runs[1]!.fill?.kind, "linear");
    assert.equal(source[0]!.runs[0]!.text, "70+");
  });
});

describe("runAtCharRanges", () => {
  it("returns the run under the selection, not the first run", () => {
    const paragraphs = applyStyleToCharRanges(
      [para("SlimPPT", "#111111")],
      [{ paragraph: 0, start: 4, end: 7 }],
      { fontFamily: "Georgia", fontSize: 20 },
    );
    const hit = runAtCharRanges(paragraphs, [{ paragraph: 0, start: 4, end: 7 }]);
    assert.equal(hit?.text, "PPT");
    assert.equal(hit?.fontFamily, "Georgia");
    assert.equal(hit?.fontSize, 20);
    assert.equal(paragraphs[0]!.runs[0]!.fontSize, 84);
  });
});

describe("SetTextStyleCmd character range", () => {
  it("restores the original run when undone", () => {
    const run: TextRun = { text: "70+", color: "#1a2233", fill: { kind: "solid", color: "#0071e3" } };
    const shape: Shape = {
      id: "t",
      name: "t",
      zIndex: 0,
      visible: true,
      locked: false,
      opacity: 1,
      kind: "text",
      bbox: { x: 0, y: 0, w: 40, h: 20 },
      transform: identityTransform(),
      paragraphs: [{ runs: [run] }],
    };
    const pres = {
      id: "p",
      size: { width: 1280, height: 720 },
      slides: [{ id: "s", layers: [{ id: "content", visible: true, locked: false, shapes: [shape] }] }],
    } as unknown as Presentation;
    const cmd = new SetTextStyleCmd(0, "t", { color: "#112233" }, [{ paragraph: 0, start: 0, end: 1 }]);
    cmd.apply(pres);
    const text = shape as Shape & { kind: "text" };
    assert.equal(text.paragraphs[0]!.runs[0]!.text, "7");
    assert.equal(text.paragraphs[0]!.runs[0]!.color, "#112233");
    assert.equal(text.paragraphs[0]!.runs[1]!.text, "0+");
    cmd.revert(pres);
    assert.equal(text.paragraphs[0]!.runs.length, 1);
    assert.equal(text.paragraphs[0]!.runs[0]!.text, "70+");
    assert.equal(text.paragraphs[0]!.runs[0]!.color, "#1a2233");
    assert.equal(text.paragraphs[0]!.runs[0]!.fill?.kind === "solid" && text.paragraphs[0]!.runs[0]!.fill.color, "#0071e3");
  });
});
