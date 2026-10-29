import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeckComment } from "@ppt/core";
import {
  commentModernId,
  isModernCommentsPartPath,
  isModernCommentsXml,
  parseModernAuthorsFromXml,
  shouldUseModernComments,
} from "./pptx-modern-comments.js";

const c = (partial: Partial<DeckComment>): DeckComment => ({
  id: "c1",
  slideIndex: 0,
  author: "Ada",
  text: "n",
  createdAt: 1,
  ...partial,
});

describe("modern comments", () => {
  it("turns on for threads / resolved / source flag and keeps modernId", () => {
    assert.equal(shouldUseModernComments([c({})], false), false);
    assert.equal(shouldUseModernComments([c({ parentId: "c0" })]), true);
    assert.equal(shouldUseModernComments([c({ resolved: true })]), true);
    assert.equal(shouldUseModernComments([c({})], true), true);
    const kept = c({ modernId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
    assert.equal(commentModernId(kept), kept.modernId);
    assert.match(commentModernId(c({ id: "x" })), /^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[A-F0-9]{4}-[0-9A-F]{12}\}$/);
    assert.equal(isModernCommentsXml('<p188:cmLst xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main"/>'), true);
    assert.equal(isModernCommentsPartPath("ppt/comments/modernComment1.xml"), true);
    const authors = parseModernAuthorsFromXml('<p188:author id="g1" name="Ada"/>');
    assert.equal(authors.get("Ada"), "g1");
  });
});
