import assert from "node:assert/strict";
import { test } from "node:test";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { blankWorkbook, writeXlsx } from "./index";

test("puts every original part back unchanged", () => {
  const source = new Map<string, Uint8Array>([
    ["xl/workbook.xml", strToU8("<workbook/>")],
    ["xl/worksheets/sheet1.xml", strToU8("<worksheet/>")],
  ]);
  const out = unzipSync(writeXlsx({ sheets: [], source }));
  assert.equal(Object.keys(out).length, 2);
  assert.deepEqual(out["xl/workbook.xml"], strToU8("<workbook/>"));
});

test("refuses a workbook that was not opened from a file", () => {
  assert.throws(() => writeXlsx({ sheets: [] }), /no original parts/);
});

test("a bold edit uses the workbook's bold font", () => {
  const made = blankWorkbook("销售", [[{ value: "12" }]]);
  const cell = made.workbook.sheets[0]?.cells[0]?.[0];
  if (cell) cell.bold = true;
  made.workbook.edited = true;
  const sheet = new TextDecoder().decode(unzipSync(writeXlsx(made.workbook))["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /<c r="A1" s="1"><v>12<\/v><\/c>/);
});

test("round trip keeps the part bytes", () => {
  const packed = zipSync({ "xl/workbook.xml": strToU8("<workbook/>") });
  const source = new Map(Object.entries(unzipSync(packed)));
  const again = unzipSync(writeXlsx({ sheets: [], source }));
  assert.deepEqual(again["xl/workbook.xml"], source.get("xl/workbook.xml"));
});

test("writes autoFilter and conditional formatting", () => {
  const made = blankWorkbook("销售", [[{ value: "12" }, { value: "8" }]]);
  const sheet = made.workbook.sheets[0]!;
  sheet.filter = { r1: 0, c1: 0, r2: 0, c2: 1 };
  sheet.conditionalFormats = [
    {
      id: "cf1",
      r1: 0,
      c1: 0,
      r2: 0,
      c2: 0,
      rule: { type: "cellValue", op: "gt", formula1: "10", fill: "#fef3c7" },
    },
  ];
  made.workbook.edited = true;
  const xml = new TextDecoder().decode(unzipSync(writeXlsx(made.workbook))["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /<autoFilter ref="A1:B1"\/>/);
  assert.match(xml, /<conditionalFormatting sqref="A1:A1">/);
  assert.match(xml, /operator="greaterThan"/);
});

test("writes table drawing and validation parts", () => {
  const made = blankWorkbook("销售", [[{ value: "a" }, { value: "1" }], [{ value: "b" }, { value: "2" }]]);
  const sheet = made.workbook.sheets[0]!;
  sheet.tables = [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 1, c2: 1, headerRow: true }];
  sheet.charts = [{ id: "chart1", kind: "column", title: "销量", range: "B1:B2" }];
  sheet.validations = [{ id: "dv1", r1: 0, c1: 0, r2: 1, c2: 0, type: "list", formula1: "a,b" }];
  made.workbook.theme = { name: "Office", colors: ["#4472C4"], fonts: { major: "Calibri", minor: "Calibri" } };
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const sheetXml = new TextDecoder().decode(out["xl/worksheets/sheet1.xml"]);
  assert.match(sheetXml, /<drawing r:id="rIdDrawing1"\/>/);
  assert.match(sheetXml, /<dataValidations count="1">/);
  assert.ok(out["xl/tables/table1_1.xml"]);
  assert.ok(out["xl/drawings/drawing1.xml"]);
  assert.ok(out["xl/theme/theme1.xml"]);
});
