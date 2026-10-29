import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DeckComment } from "@ppt/core";
import { commentSubtreeIds } from "./comment-commands.js";

describe("commentSubtreeIds", () => {
  it("includes the root and nested replies", () => {
    const comments: DeckComment[] = [
      { id: "a", slideIndex: 0, author: "A", text: "t", createdAt: 1 },
      { id: "b", slideIndex: 0, author: "B", text: "t", createdAt: 2, parentId: "a" },
      { id: "c", slideIndex: 0, author: "C", text: "t", createdAt: 3, parentId: "b" },
      { id: "d", slideIndex: 0, author: "D", text: "t", createdAt: 4 },
    ];
    assert.deepEqual([...commentSubtreeIds(comments, "a")].sort(), ["a", "b", "c"]);
    assert.deepEqual([...commentSubtreeIds(undefined, "x")], ["x"]);
  });
});
