import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { commentMentionsAi } from "./comment-assign.js";
import {
  appendCommentText,
  bindCommentMentionField,
  commentMentionOptions,
  commentParticipants,
  splitCommentMentions,
} from "./comment-mention.js";

describe("comment mentions", () => {
  it("lists each person once and leaves the AI shortcut separate", () => {
    assert.deepEqual(commentParticipants(["Ada", " ada ", "AI", "", "Bo"]), ["Ada", "Bo"]);
    assert.deepEqual(
      commentMentionOptions("", ["Ada"]).map((item) => item.token),
      ["ai", "Ada"],
    );
    assert.deepEqual(
      commentMentionOptions("ad", ["Ada", "Bo"]).map((item) => item.token),
      ["Ada"],
    );
  });

  it("styles @ai and a participant, and ignores an email", () => {
    assert.deepEqual(splitCommentMentions("请 @AI 处理"), [
      { kind: "text", text: "请 " },
      { kind: "mention", who: "ai", text: "@AI" },
      { kind: "text", text: " 处理" },
    ]);
    assert.deepEqual(splitCommentMentions("@Ada 看一下", ["Ada"]), [
      { kind: "mention", who: "person", text: "@Ada" },
      { kind: "text", text: " 看一下" },
    ]);
    assert.deepEqual(splitCommentMentions("me@ai.com"), [{ kind: "text", text: "me@ai.com" }]);
    assert.equal(commentMentionsAi("@ai"), true);
    assert.equal(commentMentionsAi("@Ada"), false);
    assert.equal(commentMentionsAi("@aibot"), false);
  });

  it("opens a shortcut menu and inserts the person", () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    const doc = dom.window.document;
    const g = globalThis as unknown as { HTMLElement: typeof HTMLElement; Event: typeof Event };
    g.HTMLElement = dom.window.HTMLElement;
    g.Event = dom.window.Event;
    const area = doc.createElement("textarea");
    doc.body.appendChild(area);
    bindCommentMentionField(area, { names: () => ["Ada"] });
    area.value = "@";
    area.setSelectionRange(1, 1);
    area.dispatchEvent(new dom.window.Event("input"));
    const menu = doc.querySelector(".ppt-comment-mention-menu");
    assert.ok(menu);
    assert.match(menu!.textContent ?? "", /@ai/);
    assert.match(menu!.textContent ?? "", /@Ada/);
    const person = [...menu!.querySelectorAll("button")].find((b) => b.textContent?.includes("@Ada"));
    person!.click();
    assert.equal(area.value, "@Ada ");
    assert.equal(doc.querySelector(".ppt-comment-field-back .ppt-comment-mention-person")?.textContent, "@Ada");
    const shown = doc.createElement("p");
    appendCommentText(shown, area.value, ["Ada"]);
    assert.equal(shown.querySelector(".ppt-comment-mention-person")?.textContent, "@Ada");
  });
});
