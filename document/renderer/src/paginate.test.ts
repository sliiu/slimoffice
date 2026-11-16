import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PAGE, type Document } from "@sliiu/document-core";
import { paginate } from "./index";

function document(count: number): Document {
  return {
    sections: [{
      page: DEFAULT_PAGE,
      header: [{ runs: [{ text: "Head" }] }],
      footer: [],
      blocks: Array.from({ length: count }, (_, index) => ({ runs: [{ text: `Line ${index}` }] })),
    }],
  };
}

test("keeps the header on every page", () => {
  const pages = paginate(document(80));
  assert.ok(pages.length > 1);
  assert.equal(pages.every((page) => page.header[0]?.runs[0]?.text === "Head"), true);
});

test("does not split a paragraph across pages", () => {
  const pages = paginate(document(3));
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.blocks.length, 3);
});
