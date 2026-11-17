import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { Workbook } from "@sliiu/sheet-core";
import { mountWorkbook } from "./index";

function host(): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  return document.createElement("div");
}

test("bold marks the cell and the workbook as edited", () => {
  const book: Workbook = { sheets: [{ name: "销售", cells: [[{ value: "12" }]] }] };
  const view = mountWorkbook(host(), book);
  view.bold();
  assert.equal(book.sheets[0]?.cells[0]?.[0]?.bold, true);
  assert.equal(book.edited, true);
  assert.equal(view.canUndo(), true);
  view.undo();
  assert.equal(book.sheets[0]?.cells[0]?.[0]?.bold, undefined);
});

test("a formula cell is not rewritten", () => {
  const book: Workbook = { sheets: [{ name: "销售", cells: [[{ value: "=A1+1" }]] }] };
  const view = mountWorkbook(host(), book);
  view.clearCell();
  assert.equal(book.sheets[0]?.cells[0]?.[0]?.value, "=A1+1");
  assert.equal(book.edited, undefined);
});

