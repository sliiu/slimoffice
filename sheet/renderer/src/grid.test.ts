import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import type { Workbook } from "@sliiu/sheet-core";
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
  const cells = [[{ value: "1" }, { value: "3" }], [{ value: "4" }, { value: "6" }], [{ value: "2" }, { value: "5" }]];
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells,
      charts: [
        { id: "c1", kind: "area", range: "A1:A3" },
        { id: "c2", kind: "scatter", range: "A1:A3" },
        { id: "c3", kind: "column", range: "A1:A3", series: ["A1:A3", "B1:B3"] },
      ],
    }],
  });
  const charts = host.querySelectorAll(".sheet-chart");
  // The area chart fills down to the baseline; the scatter chart marks points and draws no line.
  assert.equal(charts[0]?.querySelector("polygon")?.getAttribute("fill"), "#4f46e5");
  assert.equal(charts[1]?.querySelectorAll("circle").length, 3);
  assert.equal(charts[1]?.querySelector("polyline"), null);
  // Two series share the scale, so the second is drawn in its own color.
  const column = charts[2]?.querySelectorAll("rect") ?? [];
  assert.equal(column.length, 6);
  assert.equal(column[0]?.getAttribute("fill"), "#4f46e5");
  assert.equal(column[3]?.getAttribute("fill"), "#22c55e");
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

test("a slicer hides the rows it leaves out", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const grid = mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }], [{ value: "甲" }], [{ value: "乙" }], [{ value: "甲" }]],
      slicers: [{ id: "s1", name: "品类切片", source: "Table1", field: "品类", values: ["甲"] }],
    }],
  });
  const shown = [...host.querySelectorAll("td")].map((cell) => cell.textContent);
  assert.deepEqual(shown, ["品类", "甲", "甲"]);
  // Both values stay listed, and only 甲 starts pressed.
  const items = [...host.querySelectorAll(".sheet-slicer-item")].map((button) => button.textContent);
  assert.deepEqual(items, ["甲", "乙"]);
  assert.equal(host.querySelector(".sheet-slicer-item.is-on")?.textContent, "甲");
  // Pressing 乙 brings its row back.
  (host.querySelectorAll(".sheet-slicer-item")[1] as HTMLButtonElement).click();
  const again = [...host.querySelectorAll("td")].map((cell) => cell.textContent);
  assert.deepEqual(again, ["品类", "甲", "乙", "甲"]);
  // Clearing the slicer shows every row too.
  grid.slicerBy("品类切片");
  assert.equal(host.querySelectorAll("td").length, 4);
});

test("draws a win/loss sparkline the same height either side of the middle", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "10" }], [{ value: "-2" }], [{ value: "0" }]],
      sparklines: [{ id: "s1", kind: "winLoss", data: "A1:A3", location: "B1" }],
    }],
  });
  const bars = [...host.querySelectorAll(".sheet-sparkline rect")];
  // Zero draws nothing, and the loss is no taller than the win even though 10 dwarfs 2.
  assert.equal(bars.length, 2);
  assert.equal(bars[0]?.getAttribute("height"), bars[1]?.getAttribute("height"));
  assert.equal(Number(bars[0]?.getAttribute("y")) < Number(bars[1]?.getAttribute("y")), true);
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

test("paints a color scale and a data bar on the cell", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "0" }, { value: "0" }], [{ value: "10" }, { value: "10" }]],
      conditionalFormats: [
        { id: "cf1", r1: 0, c1: 0, r2: 1, c2: 0, rule: { type: "colorScale", colors: ["#ffffff", "#ff0000"] } },
        { id: "cf2", r1: 0, c1: 1, r2: 1, c2: 1, rule: { type: "dataBar", color: "#638ec6" } },
      ],
    }],
  });
  const cells = host.querySelectorAll<HTMLElement>("td");
  // The low end of the scale stays white; the high end turns red.
  assert.equal(cells[0]?.style.background, "rgb(255, 255, 255)");
  assert.equal(cells[2]?.style.background, "rgb(255, 0, 0)");
  // The bar grows with the value, so 10 fills the cell and 0 fills none of it.
  const bar = (cell: HTMLElement | undefined) => cell?.querySelector<HTMLElement>(".sheet-data-bar")?.style.width;
  assert.equal(bar(cells[1]), "0%");
  assert.equal(bar(cells[3]), "100%");
});

test("highlights duplicates, the top values, and text", () => {
  const sheet = {
    name: "销售",
    cells: [[{ value: "2" }, { value: "甲乙" }, { value: "1" }], [{ value: "9" }, { value: "乙" }, { value: "5" }], [{ value: "2" }, { value: "丙" }, { value: "3" }]],
    conditionalFormats: [
      { id: "cf1", r1: 0, c1: 0, r2: 2, c2: 0, rule: { type: "duplicate" as const, fill: "#fdd" } },
      { id: "cf2", r1: 0, c1: 0, r2: 2, c2: 0, rule: { type: "top10" as const, rank: 1, fill: "#dfd" } },
      { id: "cf3", r1: 0, c1: 1, r2: 2, c2: 1, rule: { type: "containsText" as const, op: "contains" as const, text: "甲", fill: "#ddf" } },
      { id: "cf4", r1: 0, c1: 2, r2: 2, c2: 2, rule: { type: "aboveAverage" as const, fill: "#ffd" } },
    ],
  };
  // 2 appears twice, so both cells fill; 9 is the single top value and overrides the duplicate color.
  assert.equal(cfLook(sheet, 0, 0, sheet.cells[0]?.[0])?.fill, "#fdd");
  assert.equal(cfLook(sheet, 1, 0, sheet.cells[1]?.[0])?.fill, "#dfd");
  assert.equal(cfLook(sheet, 2, 0, sheet.cells[2]?.[0])?.fill, "#fdd");
  // Only the cell holding 甲 matches the text rule. 5 is the only value above the mean of 1, 5 and 3.
  assert.equal(cfLook(sheet, 0, 1, sheet.cells[0]?.[1])?.fill, "#ddf");
  assert.equal(cfLook(sheet, 1, 1, sheet.cells[1]?.[1])?.fill, undefined);
  assert.equal(cfLook(sheet, 1, 2, sheet.cells[1]?.[2])?.fill, "#ffd");
  assert.equal(cfLook(sheet, 2, 2, sheet.cells[2]?.[2])?.fill, undefined);
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
  assert.equal(cells[2]?.classList.contains("is-table-total"), false);
  assert.equal(cells[1]?.dataset.array, "1");
  assert.equal(cells[0]?.dataset.printArea, "1");
  assert.equal(cells[2]?.dataset.printArea, undefined);
  const frame = host.querySelector(".sheet-frame") as HTMLElement;
  assert.equal(frame.style.fontFamily, "Calibri");
  assert.equal(frame.dataset.scale, "80");
});

test("a new table takes its column names from the header row", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook = {
    calcMode: "manual" as const,
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "" }], [{ value: "甲" }, { value: "10" }], [{ value: "合计" }, { value: "10" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 2, c2: 1, headerRow: true, totalsRow: true, columns: ["品类", "数量"] }],
    }],
  };
  const grid = mountWorkbook(host, workbook);
  const cells = host.querySelectorAll("td");
  // The last row of a table with totals is marked, and it is not the header.
  assert.equal(cells[4]?.classList.contains("is-table-total"), true);
  assert.equal(cells[4]?.classList.contains("is-table-header"), false);
  // A blank header falls back to its column letter, so the reference still has a name.
  grid.addTable();
  assert.deepEqual(workbook.sheets[0]?.tables?.[1]?.columns, ["品类", "B"]);
});

test("data rows of a table alternate their shading", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  mountWorkbook(host, {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }], [{ value: "甲" }], [{ value: "乙" }], [{ value: "丙" }], [{ value: "汇总" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 4, c2: 0, headerRow: true, totalsRow: true, columns: ["品类"] }],
    }],
  });
  const cells = [...host.querySelectorAll("td")];
  // The header and the totals row stay plain. The data rows alternate, starting with the first unshaded.
  assert.equal(cells[0]?.classList.contains("is-table-stripe"), false);
  assert.equal(cells[1]?.classList.contains("is-table-stripe"), false);
  assert.equal(cells[2]?.classList.contains("is-table-stripe"), true);
  assert.equal(cells[3]?.classList.contains("is-table-stripe"), false);
  assert.equal(cells[4]?.classList.contains("is-table-stripe"), false);
});

test("a totals row sums the numeric columns", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook: Workbook = {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "数量" }], [{ value: "甲" }, { value: "10" }], [{ value: "乙" }, { value: "5" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 2, c2: 1, headerRow: true, columns: ["品类", "数量"] }],
    }],
  };
  const grid = mountWorkbook(host, workbook);
  const FocusEvent = (dom.window as unknown as Record<string, new (type: string) => Event>)["Event"];
  if (!FocusEvent) throw new Error("missing Event");
  host.querySelector("td")!.dispatchEvent(new FocusEvent("focus"));
  // The totals row lands below the data, labels the first column, and sums the numeric one.
  assert.equal(grid.toggleTotals(), true);
  const table = workbook.sheets[0]!.tables![0]!;
  assert.equal(table.totalsRow, true);
  assert.equal(table.r2, 3);
  assert.equal(workbook.sheets[0]!.cells[3]?.[0]?.value, "Total");
  assert.equal(workbook.sheets[0]!.cells[3]?.[1]?.formula, "SUBTOTAL(109,B2:B3)");
  // Switching it off keeps the row and drops the totals marker.
  assert.equal(grid.toggleTotals(), false);
  assert.equal(table.totalsRow, false);
  assert.equal(table.r2, 3);
});

test("a totals column can count, average, or stop", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook: Workbook = {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "数量" }], [{ value: "甲" }, { value: "10" }], [{ value: "乙" }, { value: "5" }], [{ value: "合计" }, { value: "" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 3, c2: 1, headerRow: true, totalsRow: true, columns: ["品类", "数量"] }],
    }],
  };
  const grid = mountWorkbook(host, workbook);
  const FocusEvent = (dom.window as unknown as Record<string, new (type: string) => Event>)["Event"];
  if (!FocusEvent) throw new Error("missing Event");
  // The function follows the column under the selection, and the range stops above the totals row.
  const cells = [...host.querySelectorAll("td")];
  cells[3]!.dispatchEvent(new FocusEvent("focus"));
  assert.equal(grid.totalsFunction("average"), true);
  const sheet = workbook.sheets[0]!;
  assert.equal(sheet.tables![0]!.totals?.[1], "average");
  assert.equal(sheet.cells[3]?.[1]?.formula, "SUBTOTAL(101,B2:B3)");
  // The formula is kept on the column, so saving can write it back.
  assert.equal(sheet.tables![0]!.totalsFormulas?.[1], "SUBTOTAL(101,B2:B3)");
  // None clears the cell, and a table without a totals row has nothing to change.
  assert.equal(grid.totalsFunction("none"), true);
  assert.equal(sheet.cells[3]?.[1]?.formula, undefined);
  assert.equal(sheet.cells[3]?.[1]?.value, "");
  sheet.tables![0]!.totalsRow = false;
  assert.equal(grid.totalsFunction("count"), false);
});

test("a table header shows a filter without taking the sheet's filter", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook = {
    calcMode: "manual" as const,
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "数量" }], [{ value: "甲" }, { value: "10" }]],
      filter: { r1: 5, c1: 0, r2: 9, c2: 1 },
    }],
  };
  const grid = mountWorkbook(host, workbook);
  grid.addTable();
  // The sheet's own filter stays where it was.
  assert.equal(workbook.sheets[0]!.filter?.r1, 5);
  // The table's header carries the filter marker, and the row below it does not.
  const cells = [...host.querySelectorAll("td")];
  assert.equal(cells.filter((cell) => cell.classList.contains("is-filter-header")).length, 2);
  assert.equal(cells[2]?.classList.contains("is-filter-header"), false);
});

test("a table column keeps its width and can hide", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook: Workbook = {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "数量" }], [{ value: "甲" }, { value: "10" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 1, c2: 1, headerRow: true, columns: ["品类", "数量"], widths: [18, 0], hidden: [false, true] }],
    }],
  };
  mountWorkbook(host, workbook);
  const heads = [...host.querySelector("tr")!.querySelectorAll("th")].map((cell) => cell.textContent);
  // The hidden column drops out of the grid, and the one with a width uses it.
  assert.deepEqual(heads, ["", "A"]);
  assert.equal((host.querySelectorAll("th")[1] as HTMLElement).style.width, "144px");
});

test("a table column formats its data cells", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook: Workbook = {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "数量" }], [{ value: "10" }], [{ value: "5" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 2, c2: 0, headerRow: true, columns: ["数量"], formats: ["0.00"] }],
    }],
  };
  mountWorkbook(host, workbook);
  const cells = [...host.querySelectorAll("td")].map((cell) => cell.textContent);
  // The data cells pick up the column's format. The header stays as typed.
  assert.deepEqual(cells, ["数量", "10.00", "5.00"]);
});

test("renaming a header renames the column", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook = {
    calcMode: "manual" as const,
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "数量" }], [{ value: "甲" }, { value: "10" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 1, c2: 1, headerRow: true, columns: ["品类", "数量"] }],
    }],
  };
  mountWorkbook(host, workbook);
  const InputEvent = (dom.window as unknown as Record<string, new (type: string, init?: { bubbles?: boolean }) => Event>)["Event"];
  if (!InputEvent) throw new Error("missing Event");
  const headers = [...host.querySelectorAll("td")].filter((cell) => cell.classList.contains("is-table-header"));
  // The column name follows the header the user typed.
  headers[1]!.textContent = "金额";
  headers[1]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.deepEqual(workbook.sheets[0]!.tables![0]!.columns, ["品类", "金额"]);
  // A blank header falls back to its column letter, and a repeat gets a suffix so the names stay distinct.
  headers[1]!.textContent = "品类";
  headers[1]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.deepEqual(workbook.sheets[0]!.tables![0]!.columns, ["品类", "品类_"]);
  headers[1]!.textContent = "";
  headers[1]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  assert.deepEqual(workbook.sheets[0]!.tables![0]!.columns, ["品类", "B"]);
});

test("a formula typed into a table fills the whole column", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook: Workbook = {
    calcMode: "manual",
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }, { value: "数量" }], [{ value: "甲" }, { value: "10" }], [{ value: "乙" }, { value: "5" }], [{ value: "合计" }, { value: "" }]],
      tables: [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 3, c2: 1, headerRow: true, totalsRow: true, columns: ["品类", "数量"] }],
    }],
  };
  mountWorkbook(host, workbook);
  const InputEvent = (dom.window as unknown as Record<string, new (type: string, init?: { bubbles?: boolean }) => Event>)["Event"];
  if (!InputEvent) throw new Error("missing Event");
  const cells = [...host.querySelectorAll("td")];
  // One formula in a data cell becomes the column's formula and fills the other data row.
  cells[3]!.textContent = "=[数量]*2";
  cells[3]!.dispatchEvent(new InputEvent("input", { bubbles: true }));
  const sheet = workbook.sheets[0]!;
  assert.equal(sheet.tables![0]!.formulas?.[1], "[数量]*2");
  assert.equal(sheet.cells[2]?.[1]?.formula, "[数量]*2");
  // The totals row keeps what it had, and the header stays a header.
  assert.equal(sheet.cells[3]?.[1]?.formula, undefined);
  assert.equal(sheet.cells[0]?.[1]?.formula, undefined);
});

test("inserting and deleting a row keeps the table over the same cells", () => {
  const dom = new JSDOM("<!doctype html><body></body>");
  globalThis.document = dom.window.document;
  const host = document.createElement("div");
  const workbook = {
    calcMode: "manual" as const,
    sheets: [{
      name: "销售",
      cells: [[{ value: "品类" }], [{ value: "甲" }], [{ value: "乙" }]],
      tables: [{ id: "table1", name: "Table1", r1: 1, c1: 0, r2: 2, c2: 1, headerRow: true, columns: ["品类", "数量"] }],
      merges: [{ r1: 1, c1: 0, r2: 1, c2: 1 }],
    }],
  };
  const grid = mountWorkbook(host, workbook);
  const table = () => workbook.sheets[0]!.tables![0]!;
  // A row inserted above the table pushes it down, and the merge moves with it.
  grid.insertRow();
  assert.deepEqual([table().r1, table().r2], [2, 3]);
  assert.equal(workbook.sheets[0]!.merges![0]!.r1, 2);
  // A row inserted inside the table grows it instead of leaving the last row behind.
  const FocusEvent = (dom.window as unknown as Record<string, new (type: string) => Event>)["Event"];
  if (!FocusEvent) throw new Error("missing Event");
  const inside = [...host.querySelectorAll("td")].find((cell) => cell.textContent === "甲")!;
  inside.dispatchEvent(new FocusEvent("focus"));
  grid.insertRow();
  // 甲 is the table's first row, so the table grows downward and its header stays put.
  assert.deepEqual([table().r1, table().r2], [2, 4]);
  // Deleting that row shrinks it back.
  grid.deleteRow();
  assert.deepEqual([table().r1, table().r2], [2, 3]);
  // Deleting the second column drops its name and keeps the first, so the names stay lined up.
  const second = [...host.querySelectorAll("td")].find((cell) => cell.dataset.col === "1")!;
  second.dispatchEvent(new FocusEvent("focus"));
  grid.deleteColumn();
  assert.deepEqual([table().c1, table().c2], [0, 0]);
  assert.deepEqual(table().columns, ["品类"]);
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
