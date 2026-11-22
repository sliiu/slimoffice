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

test("a column break moves to the next column and wraps onto a new page", () => {
  const story = document(4);
  const section = story.sections[0]!;
  section.page = { ...section.page, columns: 2 };
  const broken = (text: string) => ({ runs: [{ text, breakBefore: "column" as const }] });
  section.blocks = [section.blocks[0]!, broken("Second"), section.blocks[2]!, broken("Fourth")];
  const pages = paginate(story);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0]?.blocks.map((block) => ("runs" in block ? block.runs[0]?.text : "")), ["Line 0", "Second", "Line 2"]);
  assert.equal("runs" in (pages[1]?.blocks[0] ?? {}) ? pages[1]?.blocks[0] && "runs" in pages[1].blocks[0] && pages[1].blocks[0].runs[0]?.text : "", "Fourth");
});
