import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCopyReplacements, copyTargetsFromSlides, isCopyVoiceIssue, mirrorOutlineCopy } from "./copy-rewrite.js";

describe("copy rewrite", () => {
  it("targets buzzwords and a second antithesis title, not the layout", () => {
    const slides = [
      {
        elements: [
          { kind: "text", text: "不是再一个演示文稿", fontSize: 40 },
          { kind: "rect" },
        ],
      },
      {
        elements: [
          { kind: "text", text: "不是又一个做幻灯片的网站", fontSize: 40 },
          { kind: "text", text: "赋能团队一起打造未来", fontSize: 18 },
        ],
      },
    ];
    const targets = copyTargetsFromSlides(slides);
    assert.ok(targets.some((t) => t.text.startsWith("不是又一个")));
    assert.ok(targets.some((t) => t.text.includes("赋能")));
    assert.ok(targets.some((t) => t.text.startsWith("不是再一个")));
    assert.equal(isCopyVoiceIssue("copy voice — launch-copy word"), true);
    assert.equal(isCopyVoiceIssue("overlapping text"), false);
  });

  it("replaces the offending string and drops a rewrite that still fails", () => {
    const slides = [
      {
        elements: [
          { kind: "text", text: "赋能团队" },
          { kind: "text", text: "70+ 种切换" },
          { kind: "rect" },
        ],
      },
    ];
    const applied = applyCopyReplacements(slides, [
      { slideIdx: 0, from: "赋能团队", to: "十二个人同时改一页" },
      { slideIdx: 0, from: "70+ 种切换", to: "无缝赋能！" },
    ]);
    assert.equal(applied.elements, 1);
    const outline = [{ title: "赋能团队", bullets: ["70+ 种切换", "另一句"] }];
    mirrorOutlineCopy(outline, applied.rows);
    assert.equal(outline[0]!.title, "十二个人同时改一页");
    assert.deepEqual(outline[0]!.bullets, ["70+ 种切换", "另一句"]);
    assert.equal(slides[0]!.elements[0]!.text, "十二个人同时改一页");
    assert.equal(slides[0]!.elements[1]!.text, "70+ 种切换");
    assert.equal(slides[0]!.elements[2]!.kind, "rect");
  });
});
