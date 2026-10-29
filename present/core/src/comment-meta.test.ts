import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeckComment } from "./slide";
import { applyCommentMeta, buildCommentMeta } from "./comment-meta";

describe("comment meta shapeId", () => {
  it("keeps the shape id on a comment that is otherwise only a pin", () => {
    const comments: DeckComment[] = [
      {
        id: "c1",
        slideIndex: 0,
        author: "Ada",
        text: "here",
        createdAt: 1,
        x: 10,
        y: 20,
        shapeId: "title",
      },
    ];
    const raw = buildCommentMeta(comments);
    assert.match(raw ?? "", /"shapeId":"title"/);
    const restored: DeckComment[] = comments.map((c) => ({ ...c, shapeId: undefined }));
    applyCommentMeta(restored, raw);
    assert.equal(restored[0]?.shapeId, "title");
  });
});
