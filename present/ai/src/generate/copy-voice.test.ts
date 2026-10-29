import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COPY_VOICE_BLOCK, formatCopyVoiceHits, lintCopyVoice } from "./copy-voice.js";
import { canvasAuthorSystemPrompt } from "./canvas-author.js";
import { outlineSystemPrompt } from "./prompts.js";
import { organizeDeckSystemPrompt } from "./agent/prompts.js";
import { chatSystemPrompt } from "../chat/prompts.js";

describe("copy voice lint", () => {
  it("flags the deck that read like a model wrote it", () => {
    const hits = lintCopyVoice({
      titles: ["四个不是营销的数字", "不是又一个做幻灯片的网站", "动画不是贴片", "Not another slide website", "Motion is not a sticker. It is a timing tree."],
      body: ["摄影即画布，文字仍可读", "定向 scrim 保证对比度", "页码是 deck 决策", "Seamlessly unlock your workflow!", "The photo is the paper. Type still meets WCAG."],
    });
    const rules = hits.map((h) => h.rule);
    assert.ok(rules.filter((r) => r === "antithesis").length >= 4, "negation-framed titles are counted deck-wide");
    assert.ok(hits.some((h) => h.rule === "meta" && /scrim/.test(h.match ?? "")));
    assert.ok(hits.some((h) => h.rule === "meta" && /摄影即画布/.test(h.match ?? "")));
    assert.ok(hits.some((h) => h.rule === "meta" && /WCAG/.test(h.match ?? "")));
    assert.ok(hits.some((h) => h.rule === "buzzword" && h.match === "seamlessly"));
    assert.ok(hits.some((h) => h.rule === "exclamation"));
    assert.equal(formatCopyVoiceHits(hits).length, hits.length);
  });

  it("passes plain product copy and tolerates a single contrast title", () => {
    const clean = lintCopyVoice({
      titles: ["几个数字", "和常见方案的区别", "导出格式", "How animation plays", "One editor on every plan"],
      body: ["70+ 种切换，含 Morph / WebGL", "存回 .pptx，可以继续在 PowerPoint 里改", "Requests go straight to the model vendor; SlimPPT does not store the key"],
    });
    assert.deepEqual(clean, []);
    const one = lintCopyVoice({ titles: ["不是又一个做幻灯片的网站", "导出格式"] });
    assert.deepEqual(one, [], "one negation title in a deck is allowed");
    assert.deepEqual(lintCopyVoice({ body: ["robust user journey in a fast world"] }), [], "everyday words are not banned");
  });

  it("is injected into every stage that writes words", () => {
    for (const prompt of [outlineSystemPrompt(), organizeDeckSystemPrompt(), canvasAuthorSystemPrompt(), chatSystemPrompt()]) {
      assert.ok(prompt.includes(COPY_VOICE_BLOCK.split("\n")[0]!), "COPY VOICE block present");
    }
  });
});
