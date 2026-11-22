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

test("writes merges, column widths, row height, and freeze", () => {
  const made = blankWorkbook("销售", [[{ value: "标题" }], [{ value: "1" }]]);
  const sheet = made.workbook.sheets[0]!;
  sheet.merges = [{ r1: 0, c1: 0, r2: 0, c2: 1 }];
  sheet.colWidths = [];
  sheet.colWidths[1] = 18;
  sheet.hiddenCols = [2];
  sheet.rowHeights = [24];
  sheet.hiddenRows = [1];
  sheet.freeze = { row: 1, col: 1 };
  made.workbook.edited = true;
  const xml = new TextDecoder().decode(unzipSync(writeXlsx(made.workbook))["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /<mergeCell ref="A1:B1"\/>/);
  assert.match(xml, /<col min="2" max="2" width="18" customWidth="1"\/>/);
  assert.match(xml, /<col min="3" max="3" hidden="1"\/>/);
  assert.match(xml, /<row r="1" ht="24" customHeight="1">/);
  assert.match(xml, /<row r="2" hidden="1">/);
  assert.match(xml, /<pane xSplit="1" ySplit="1" state="frozen" topLeftCell="B2"\/>/);
});

test("writes a cell hyperlink back", () => {
  const made = blankWorkbook("销售", [[{ value: "明细" }]]);
  const cell = made.workbook.sheets[0]?.cells[0]?.[0];
  if (cell) cell.hyperlink = "Sheet2!A1";
  made.workbook.edited = true;
  const xml = new TextDecoder().decode(unzipSync(writeXlsx(made.workbook))["xl/worksheets/sheet1.xml"]);
  assert.match(xml, /<hyperlink ref="A1" location="Sheet2!A1"\/>/);
});

test("writes defined names, the print area, and an array formula", () => {
  const made = blankWorkbook("销售", [[{ value: "30" }]]);
  const cell = made.workbook.sheets[0]?.cells[0]?.[0];
  if (cell) {
    cell.formula = "SUM(B1:B2)";
    cell.array = true;
  }
  made.workbook.names = [{ name: "税率", refersTo: "Sheet1!$B$1" }];
  made.workbook.sheets[0]!.pageSetup = { printArea: "Sheet1!$A$1:$B$2" };
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const workbook = new TextDecoder().decode(out["xl/workbook.xml"] ?? new Uint8Array());
  assert.match(workbook, /<definedName name="税率">Sheet1!\$B\$1<\/definedName>/);
  assert.match(workbook, /<definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!\$A\$1:\$B\$2<\/definedName>/);
  const sheet = new TextDecoder().decode(out["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
  assert.match(sheet, /<f t="array">SUM\(B1:B2\)<\/f>/);
});

test("writes a cell comment back", () => {
  const made = blankWorkbook("销售", [[{ value: "甲" }]]);
  const cell = made.workbook.sheets[0]?.cells[0]?.[0];
  if (cell) cell.comment = "核对";
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const comments = new TextDecoder().decode(out["xl/comments1.xml"] ?? new Uint8Array());
  assert.match(comments, /<comment ref="A1" authorId="0"><text><r><t>核对<\/t><\/r><\/text><\/comment>/);
  const rels = new TextDecoder().decode(out["xl/worksheets/_rels/sheet1.xml.rels"] ?? new Uint8Array());
  assert.match(rels, /Target="..\/comments1.xml"/);
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
