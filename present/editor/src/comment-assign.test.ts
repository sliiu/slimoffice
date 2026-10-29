import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commentMentionsAi } from "./comment-assign.js";

describe("commentMentionsAi", () => {
  it("matches a standalone @ai mention", () => {
    assert.equal(commentMentionsAi("@ai 把标题改大"), true);
    assert.equal(commentMentionsAi("请 @AI 处理"), true);
    assert.equal(commentMentionsAi("标题太小\n@ai"), true);
  });

  it("ignores emails and longer tokens", () => {
    assert.equal(commentMentionsAi("write to me@ai.com"), false);
    assert.equal(commentMentionsAi("@aibot"), false);
    assert.equal(commentMentionsAi("只是一条批注"), false);
  });
});
