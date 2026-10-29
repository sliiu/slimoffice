import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TextParagraph } from "@ppt/core";
import { applyKinsoku, glueUnbrokenEastAsian, wrapParagraphIntoLines, type Token } from "./text-layout.js";

/** Fixed-advance measurer: every code point is 10px wide, so line widths are easy to reason about. */
function fakeCtx(): CanvasRenderingContext2D {
  return {
    font: "",
    measureText(text: string) {
      return { width: Array.from(text).length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 };
    },
  } as unknown as CanvasRenderingContext2D;
}

function lineTexts(lines: ReturnType<typeof wrapParagraphIntoLines>): string[] {
  return lines.map((l) => l.segments.map((s) => s.text).join(""));
}

describe("kinsoku line-break prohibitions", () => {
  it("glues closing punctuation to the preceding CJK character", () => {
    const tokens: Token[] = [
      { text: "本", kind: "cjk" },
      { text: "机", kind: "cjk" },
      { text: "。", kind: "cjk" },
    ];
    assert.deepEqual(applyKinsoku(tokens).map((t) => t.text), ["本", "机。"]);
  });

  it("glues an opening bracket to the character after it", () => {
    const tokens: Token[] = [
      { text: "「", kind: "cjk" },
      { text: "本", kind: "cjk" },
      { text: "」", kind: "cjk" },
    ];
    assert.deepEqual(applyKinsoku(tokens).map((t) => t.text), ["「本」"]);
  });

  it("leaves Latin punctuation between Latin words alone", () => {
    const tokens: Token[] = [
      { text: "a", kind: "word" },
      { text: " ", kind: "ws" },
      { text: ".", kind: "word" },
    ];
    assert.deepEqual(applyKinsoku(tokens).map((t) => t.text), ["a", " ", "."]);
  });

  it("keeps a run of ideographs on one line when eaLnBrk is off", () => {
    const tokens: Token[] = [
      { text: "甲", kind: "cjk" },
      { text: "乙", kind: "cjk" },
      { text: "，", kind: "cjk" },
      { text: "丙", kind: "cjk" },
      { text: "丁", kind: "cjk" },
    ];
    const glued = applyKinsoku(tokens);
    assert.deepEqual(glueUnbrokenEastAsian(glued).map((t) => t.text), ["甲乙，", "丙丁"]);
  });

  it("does not split ideographs to fit the line when eaLnBrk is off", () => {
    const p: TextParagraph = { eaLnBrk: false, runs: [{ text: "甲乙丙丁戊己庚辛" }] };
    const lines = lineTexts(wrapParagraphIntoLines(p, 40, 16, fakeCtx(), 40, false));
    assert.deepEqual(lines, ["甲乙丙丁戊己庚辛"]);
  });

  it("still wraps after punctuation when eaLnBrk is off", () => {
    const p: TextParagraph = { eaLnBrk: false, runs: [{ text: "甲乙丙丁，戊己庚辛" }] };
    const lines = lineTexts(wrapParagraphIntoLines(p, 50, 16, fakeCtx(), 50, false));
    assert.deepEqual(lines, ["甲乙丙丁，", "戊己庚辛"]);
  });

  it("keeps a Latin word whole unless latinLnBrk is on", () => {
    const whole = lineTexts(
      wrapParagraphIntoLines({ latinLnBrk: false, runs: [{ text: "HELLO" }] }, 30, 16, fakeCtx(), 30, false),
    );
    assert.deepEqual(whole, ["HELLO"]);
    const split = lineTexts(
      wrapParagraphIntoLines({ latinLnBrk: true, runs: [{ text: "HELLO" }] }, 30, 16, fakeCtx(), 30, false),
    );
    assert.deepEqual(split, ["HEL", "LO"]);
  });

  it("hangs closing punctuation past the margin when hangingPunct is on", () => {
    const p: TextParagraph = { hangingPunct: true, runs: [{ text: "甲乙。" }] };
    const lines = wrapParagraphIntoLines(p, 20, 16, fakeCtx(), 20, false);
    assert.deepEqual(lineTexts(lines), ["甲乙。"]);
    assert.equal(lines[0]!.hang, 10);
    const wrapped = lineTexts(
      wrapParagraphIntoLines({ runs: [{ text: "甲乙。" }] }, 20, 16, fakeCtx(), 20, false),
    );
    assert.deepEqual(wrapped, ["甲", "乙。"]);
  });

  it("still wraps between ideographs when eaLnBrk is on", () => {
    const p: TextParagraph = { eaLnBrk: true, runs: [{ text: "甲乙丙丁戊己庚辛" }] };
    const lines = lineTexts(wrapParagraphIntoLines(p, 40, 16, fakeCtx(), 40, false));
    assert.deepEqual(lines, ["甲乙丙丁", "戊己庚辛"]);
  });

  it("never starts a wrapped line with a CJK full stop", () => {
    // 11 ideographs + 。 at 10px each; a 110px line fits exactly the ideographs, so a naive
    // per-character wrap would push the lone 。 onto line two.
    const p: TextParagraph = { runs: [{ text: "草稿默认不离开浏览器本机。" }] };
    const lines = lineTexts(wrapParagraphIntoLines(p, 110, 16, fakeCtx(), 110, false));
    assert.equal(lines.length, 2);
    for (const l of lines) assert.ok(!l.startsWith("。"), `line starts with 。: ${JSON.stringify(lines)}`);
    assert.equal(lines.join(""), "草稿默认不离开浏览器本机。");
  });
});
