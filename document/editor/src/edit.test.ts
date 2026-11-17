import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { Document } from "@sliiu/document-core";
import { mountDocument } from "./index";

function host(): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  return document.createElement("div");
}

function sample(): Document {
  return {
    sections: [{ page: { width: 12240, height: 15840, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } }, header: [], footer: [], blocks: [{ runs: [{ text: "季报" }] }] }],
    source: new Map<string, Uint8Array>([["word/document.xml", new Uint8Array()]]),
  };
}

test("bold marks the paragraph and the document as edited", () => {
  const doc = sample();
  const view = mountDocument(host(), doc);
  view.bold();
  const block = doc.sections[0]?.blocks[0];
  assert.equal(block && "runs" in block ? block.runs[0]?.bold : false, true);
  assert.equal(doc.edited, true);
  assert.equal(view.boldOn(), true);
  assert.equal(view.canUndo(), true);
  view.undo();
  const restored = doc.sections[0]?.blocks[0];
  assert.equal(restored && "runs" in restored ? restored.runs[0]?.bold : true, undefined);
});

