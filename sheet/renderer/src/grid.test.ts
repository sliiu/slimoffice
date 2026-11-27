import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { summarizePivot } from "./charts";
import { cfLook } from "./cf";
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
  assert.deepEqual(summarizePivot(pivot), { columns: [], rows: [{ label: "甲", values: [17, 17] }, { label: "乙", values: [5, 5] }], totals: [22, 22] });
  assert.match(host.querySelector(".sheet-pivot")?.textContent ?? "", /甲17/);
  assert.match(host.querySelector(".sheet-pivot")?.textContent ?? "", /总计22/);
  const counted = { ...pivot, agg: "count" as const, columns: ["地区"], fields: ["品类", "数量", "地区"], cache: [["甲", "10", "东"], ["甲", "7", "西"], ["甲", "3", "东"]] };
  assert.deepEqual(summarizePivot(counted), { columns: ["东", "西"], rows: [{ label: "甲", values: [2, 1, 3] }], totals: [2, 1, 3] });
  assert.deepEqual(summarizePivot({ ...pivot, agg: "max" }).rows.map((row) => row.values), [[10, 10], [5, 5]]);
  assert.deepEqual(summarizePivot({ ...pivot, agg: "min" }).rows.map((row) => row.values), [[7, 7], [5, 5]]);
  assert.deepEqual(summarizePivot({ ...pivot, agg: "product" }).rows.map((row) => row.values), [[70, 70], [5, 5]]);
  // An average total divides the whole column, not the sum of the row averages.
  assert.deepEqual(summarizePivot({ ...pivot, agg: "average" }).totals, [22 / 3, 22 / 3]);
});

test("shows a data validation list and an outline level", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook = {
    calcMode: "manual" as const,
    sheets: [{
      name: "销售",
      cells: [[{ value: "甲" }]],
      validations: [{ id: "dv1", r1: 0, c1: 0, r2: 0, c2: 0, type: "list" as const, formula1: "甲,乙" }],
      outline: { rows: [0], summaryBelow: true },
    }],
  };
  mountWorkbook(host, workbook);
  const cell = host.querySelector("td");
  assert.equal(cell?.dataset.validation, "list");
  assert.equal(cell?.title, "甲,乙");
  assert.equal(cell?.dataset.outline, "row");
  // A value outside the list is rejected: the cell is marked and the stored value stays "甲".
  const InputEvent = (dom.window as unknown as Record<string, new (type: string, init?: { bubbles?: boolean }) => Event>)["Event"];
  if (!InputEvent) throw new Error("missing Event");
  cell!.textContent = "丙";
  cell!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.equal(cell?.classList.contains("is-invalid"), true);
  assert.equal(workbook.sheets[0]?.cells[0]?.[0]?.value, "甲");
  // A value on the list is stored.
  cell!.textContent = "乙";
  cell!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.equal(cell?.classList.contains("is-invalid"), false);
  assert.equal(workbook.sheets[0]?.cells[0]?.[0]?.value, "乙");
});

test("checks a number against its bounds and a custom formula", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const InputEvent = (dom.window as unknown as Record<string, new (type: string, init?: { bubbles?: boolean }) => Event>)["Event"];
  if (!InputEvent) throw new Error("missing Event");
  const workbook = {
    calcMode: "manual" as const,
    sheets: [{
      name: "销售",
      cells: [[{ value: "5" }, { value: "甲" }]],
      validations: [
        { id: "dv1", r1: 0, c1: 0, r2: 0, c2: 0, type: "whole" as const, op: "between" as const, formula1: "1", formula2: "9" },
        { id: "dv2", r1: 0, c1: 1, r2: 0, c2: 1, type: "custom" as const, formula1: "LEN(B1)<=2" },
      ],
    }],
  };
  mountWorkbook(host, workbook);
  const cells = host.querySelectorAll("td");
  // 12 falls outside 1 to 9, so the stored value stays 5.
  cells[0]!.textContent = "12";
  cells[0]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.equal(cells[0]?.classList.contains("is-invalid"), true);
  assert.equal(workbook.sheets[0]?.cells[0]?.[0]?.value, "5");
  // A value inside the bounds is stored.
  cells[0]!.textContent = "7";
  cells[0]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.equal(workbook.sheets[0]?.cells[0]?.[0]?.value, "7");
  // The custom formula counts the typed text, so three characters fail and the stored value stays 甲.
  cells[1]!.textContent = "甲乙丙";
  cells[1]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.equal(workbook.sheets[0]?.cells[0]?.[1]?.value, "甲");
  cells[1]!.textContent = "乙";
  cells[1]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.equal(workbook.sheets[0]?.cells[0]?.[1]?.value, "乙");
});

test("draws an area chart filled and a scatter chart as dots", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const cells = [[{ value: "1" }], [{ value: "4" }], [{ value: "2" }]];
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{ name: "销售", cells, charts: [{ id: "c1", kind: "area", range: "A1:A3" }, { id: "c2", kind: "scatter", range: "A1:A3" }] }],
  });
  const charts = host.querySelectorAll(".sheet-chart");
  // The area chart fills down to the baseline; the scatter chart marks points and draws no line.
  assert.equal(charts[0]?.querySelector("polygon")?.getAttribute("fill"), "#4f46e5");
  assert.equal(charts[1]?.querySelectorAll("circle").length, 3);
  assert.equal(charts[1]?.querySelector("polyline"), null);
});

test("hides the rows a column filter leaves out", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const grid = mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }], [{ value: "甲" }], [{ value: "乙" }]],
      filter: { r1: 0, c1: 0, r2: 2, c2: 0, columns: [{ col: 0, values: ["甲"] }] },
    }],
  });
  const shown = [...host.querySelectorAll("td")].map((cell) => cell.textContent);
  assert.deepEqual(shown, ["品类", "甲"]);
  // Clearing the column brings the hidden row back.
  grid.filterBy();
  const again = [...host.querySelectorAll("td")].map((cell) => cell.textContent);
  assert.deepEqual(again, ["品类", "甲", "乙"]);
});

test("finds comments and validated cells", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const grid = mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "甲" }], [{ value: "乙", comment: "核对" }]],
      validations: [{ id: "dv1", r1: 0, c1: 0, r2: 0, c2: 0, type: "list", formula1: "甲,乙" }],
    }],
  });
  assert.equal(grid.goToSpecial("comments"), 1);
  assert.equal(grid.goToSpecial("validation"), 1);
  assert.equal(grid.goToSpecial("conditional"), 0);
});

test("evaluates a conditional format formula", () => {
  const sheet = {
    name: "销售",
    cells: [[{ value: "8" }, { value: "3" }]],
    conditionalFormats: [{ id: "cf1", r1: 0, c1: 0, r2: 0, c2: 0, rule: { type: "expression" as const, formula: "AND(A1>5,B1<4)", fill: "#ff0" } }],
  };
  assert.equal(cfLook(sheet, 0, 0, sheet.cells[0]?.[0])?.fill, "#ff0");
  sheet.cells[0]![1]!.value = "9";
  assert.equal(cfLook(sheet, 0, 0, sheet.cells[0]?.[0])?.fill, undefined);
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

test("marks a table header, an array formula, the print area, and the theme", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    theme: { name: "Office", colors: ["", "", "", "", "#4472c4"], fonts: { minor: "Calibri" } },
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "30", array: true, formula: "SUM(B2:B3)" }], [{ value: "甲" }, { value: "10" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 1, c2: 1, headerRow: true }],
      pageSetup: { printArea: "A1:B1", scale: 80 },
    }],
  });
  const cells = host.querySelectorAll("td");
  assert.equal(cells[0]?.classList.contains("is-table-header"), true);
  assert.equal(cells[0]?.dataset.table, "Table1");
  assert.equal(cells[1]?.dataset.array, "1");
  assert.equal(cells[0]?.dataset.printArea, "1");
  assert.equal(cells[2]?.dataset.printArea, undefined);
  const frame = host.querySelector(".sheet-frame") as HTMLElement;
  assert.equal(frame.style.fontFamily, "Calibri");
  assert.equal(frame.dataset.scale, "80");
});

test("marks the cells a consolidation wrote", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "汇总",
      cells: [[{ value: "甲" }, { value: "13" }], [{ value: "乙" }, { value: "10" }]],
      consolidation: { func: "sum", sources: ["一月!A1:B2"], dest: "汇总!A1", rows: 2, cols: 2 },
    }],
  });
  const cells = host.querySelectorAll("td");
  assert.equal(cells[0]?.dataset.consolidation, "sum");
  assert.equal(cells[1]?.dataset.consolidation, "sum");
  assert.equal(cells[2]?.dataset.consolidation, "sum");
});

test("lists the VBA module names without running them", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const seen: string[] = [];
  const grid = mountWorkbook(host, { sheets: [{ name: "销售", cells: [] }], vbaModules: ["模块一", "ThisWorkbook"] }, { locale: "zh-CN", onStatus: (text) => seen.push(text) });
  assert.deepEqual(grid.listMacros(), ["模块一", "ThisWorkbook"]);
  assert.deepEqual(seen, ["宏 模块一、ThisWorkbook"]);
});
