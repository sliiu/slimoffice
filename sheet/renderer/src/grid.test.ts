import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { summarizePivot } from "./charts";
import { mountWorkbook } from "./index";

test("shows the named sheet and its cells", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    sheets: [
      { name: "销售", cells: [[{ value: "合计", bold: true }], [], [{ value: "第一" }]] },
      { name: "库存", cells: [[{ value: "3" }]] },
    ],
  });
  assert.equal(host.querySelectorAll(".sheet-tab").length, 2);
  assert.equal(host.querySelector(".sheet-tab.is-active")?.textContent, "销售");
  assert.match(host.querySelector(".sheet-grid")?.textContent ?? "", /合计/);
  (host.querySelectorAll(".sheet-tab")[1] as HTMLButtonElement).click();
  assert.equal(host.querySelector(".sheet-tab.is-active")?.textContent, "库存");
  assert.match(host.querySelector(".sheet-grid")?.textContent ?? "", /3/);
});

test("paints a number with its format code and marks a comment", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{ name: "销售", cells: [[{ value: "1234.5", numFmt: "#,##0.00", comment: "核对" }]] }],
  });
  const cell = host.querySelector("td");
  assert.equal(cell?.textContent, "1,234.50");
  assert.equal(cell?.title, "核对");
});

test("sums a pivot cache by its row field", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const pivot = {
    id: "pivot1",
    name: "销量透视",
    source: "A1:B3",
    rows: ["品类"],
    values: ["数量"],
    fields: ["品类", "数量"],
    cache: [["甲", "10"], ["乙", "5"], ["甲", "7"]],
  };
  mountWorkbook(host, { calcMode: "manual", sheets: [{ name: "销售", cells: [], pivots: [pivot] }] });
  assert.deepEqual(summarizePivot(pivot), { columns: [], rows: [{ label: "甲", values: [17] }, { label: "乙", values: [5] }] });
  assert.match(host.querySelector(".sheet-pivot")?.textContent ?? "", /甲17/);
  const counted = { ...pivot, agg: "count" as const, columns: ["地区"], fields: ["品类", "数量", "地区"], cache: [["甲", "10", "东"], ["甲", "7", "西"], ["甲", "3", "东"]] };
  assert.deepEqual(summarizePivot(counted), { columns: ["东", "西"], rows: [{ label: "甲", values: [2, 1] }] });
});

test("shows a data validation list and an outline level", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "甲" }]],
      validations: [{ id: "dv1", r1: 0, c1: 0, r2: 0, c2: 0, type: "list", formula1: "甲,乙" }],
      outline: { rows: [0], summaryBelow: true },
    }],
  });
  const cell = host.querySelector("td");
  assert.equal(cell?.dataset.validation, "list");
  assert.equal(cell?.title, "甲,乙");
  assert.equal(cell?.dataset.outline, "row");
});

test("marks page breaks and what-if data tables", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "1" }], [{ value: "2" }]],
      pageBreaks: { rows: [2] },
      dataTables: [{ ref: "A2:A2", colInput: "B1" }],
    }],
  });
  const cells = host.querySelectorAll("td");
  assert.equal(cells[1]?.dataset.pageBreak, "row");
  assert.equal(cells[1]?.dataset.dataTable, "B1");
});

test("marks a filter header, a hyperlink, and frozen cells", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "数量", hyperlink: "Sheet2!A1" }], [{ value: "甲" }, { value: "10" }]],
      filter: { r1: 0, c1: 0, r2: 1, c2: 1 },
      freeze: { row: 1, col: 1 },
    }],
  });
  const cells = host.querySelectorAll("td");
  assert.equal(cells[0]?.classList.contains("is-filter-header"), true);
  assert.equal(cells[1]?.classList.contains("is-link"), true);
  assert.equal(cells[1]?.title, "Sheet2!A1");
  assert.equal(cells[0]?.classList.contains("is-frozen"), true);
  assert.equal(cells[2]?.classList.contains("is-frozen"), true);
  assert.equal(cells[3]?.classList.contains("is-frozen"), false);
});
