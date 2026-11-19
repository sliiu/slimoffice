import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { Workbook } from "@sliiu/sheet-core";
import { mountWorkbook } from "./index";

function host(): HTMLElement {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
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

test("clearing removes a formula cell", () => {
  const book: Workbook = { sheets: [{ name: "销售", cells: [[{ value: "2", formula: "1+1" }]] }] };
  const view = mountWorkbook(host(), book);
  view.clearCell();
  assert.equal(book.sheets[0]?.cells[0]?.[0]?.value, "");
  assert.equal(book.sheets[0]?.cells[0]?.[0]?.formula, undefined);
  assert.equal(book.edited, true);
});

test("autoSum writes a SUM formula on the focused cell", () => {
  const book: Workbook = {
    sheets: [{ name: "销售", cells: [[{ value: "1" }], [{ value: "2" }], [{ value: "" }]] }],
  };
  const root = host();
  const view = mountWorkbook(root, book);
  const td = root.querySelector('td[data-row="2"][data-col="0"]');
  assert.ok(td);
  td.dispatchEvent(new Event("focus"));
  view.autoSum();
  assert.equal(book.sheets[0]?.cells[2]?.[0]?.formula, "SUM(A1:A2)");
  assert.equal(book.sheets[0]?.cells[2]?.[0]?.value, "3");
});

test("insert column shifts cells", () => {
  const book: Workbook = { sheets: [{ name: "销售", cells: [[{ value: "a" }, { value: "b" }]] }] };
  const view = mountWorkbook(host(), book);
  view.insertColumn();
  assert.equal(book.sheets[0]?.cells[0]?.[1]?.value, "a");
});
