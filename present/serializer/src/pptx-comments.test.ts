import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeckComment } from "@ppt/core";
import { exportableComments, slideCommentsForExport } from "./pptx-comments.js";

function c(partial: Partial<DeckComment> & Pick<DeckComment, "id" | "slideIndex">): DeckComment {
  return {
    author: "Ada",
    text: "n",
    createdAt: 1,
    ...partial,
  };
}

describe("comment export filters", () => {
  it("drops resolved comments unless modern, and filters by slide", () => {
    const comments = [
      c({ id: "a", slideIndex: 0 }),
      c({ id: "b", slideIndex: 0, resolved: true }),
      c({ id: "c", slideIndex: 1 }),
    ];
    assert.deepEqual(
      exportableComments(comments).map((x) => x.id),
      ["a", "c"],
    );
    assert.deepEqual(
      slideCommentsForExport(comments, 0, false).map((x) => x.id),
      ["a"],
    );
    assert.deepEqual(
      slideCommentsForExport(comments, 0, true).map((x) => x.id),
      ["a", "b"],
    );
    assert.deepEqual(exportableComments(undefined), []);
  });
});
