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
  sheet.filter = { r1: 0, c1: 0, r2: 0, c2: 1, columns: [{ col: 0, values: ["甲"] }] };
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
  assert.match(xml, /<autoFilter ref="A1:B1"><filterColumn colId="0"><filters><filter val="甲"\/><\/filters><\/filterColumn><\/autoFilter>/);
  assert.match(xml, /<conditionalFormatting sqref="A1:A1">/);
  assert.match(xml, /operator="greaterThan"/);
  sheet.conditionalFormats.push({ id: "cf2", r1: 0, c1: 1, r2: 0, c2: 1, rule: { type: "top10", rank: 3, bottom: true, fill: "#ff0" } });
  const again = new TextDecoder().decode(unzipSync(writeXlsx(made.workbook))["xl/worksheets/sheet1.xml"]);
  assert.match(again, /<cfRule type="top10" dxfId="1" priority="2" rank="3" bottom="1"\/>/);
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
    cell.spillRef = "A1:A2";
  }
  made.workbook.names = [{ name: "税率", refersTo: "Sheet1!$B$1" }];
  made.workbook.sheets[0]!.pageSetup = { printArea: "Sheet1!$A$1:$B$2" };
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const workbook = new TextDecoder().decode(out["xl/workbook.xml"] ?? new Uint8Array());
  assert.match(workbook, /<definedName name="税率">Sheet1!\$B\$1<\/definedName>/);
  assert.match(workbook, /<definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!\$A\$1:\$B\$2<\/definedName>/);
  const sheet = new TextDecoder().decode(out["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
  assert.match(sheet, /<f t="array" ref="A1:A2">SUM\(B1:B2\)<\/f>/);
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
  sheet.tables = [{ id: "table1", name: "Table1", r1: 0, c1: 0, r2: 1, c2: 1, headerRow: false, totalsRow: true, colStripes: true, firstColumn: true, lastColumn: true, filterColumns: [{ col: 0, values: ["甲"] }], sort: [{ col: 1, descending: true }], columns: ["品类", "数量"], formulas: ["", "SUM([数量])"], totals: ["sum", "average"], totalsFormulas: ["", "SUBTOTAL(101,[数量])"], widths: [18, 0], hidden: [true, false], formats: ["", "0.00"] }];
  sheet.charts = [{ id: "chart1", kind: "column", title: "销量", range: "B1:B2" }];
  sheet.validations = [{ id: "dv1", r1: 0, c1: 0, r2: 1, c2: 0, type: "list", op: "eq", formula1: "a,b" }];
  made.workbook.theme = { name: "Office", colors: ["#4472C4"], fonts: { major: "Calibri", minor: "Calibri" } };
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const sheetXml = new TextDecoder().decode(out["xl/worksheets/sheet1.xml"]);
  assert.match(sheetXml, /<drawing r:id="rIdDrawing1"\/>/);
  assert.match(sheetXml, /<dataValidations count="1">/);
  assert.match(sheetXml, /<dataValidation type="list" allowBlank="1" operator="equal" sqref="A1:A2"><formula1>a,b<\/formula1><\/dataValidation>/);
  const tableXml = new TextDecoder().decode(out["xl/tables/table1_1.xml"]);
  assert.match(tableXml, /headerRowCount="0" totalsRowCount="1".*<tableColumn id="1" name="品类" width="18" hidden="1"><\/tableColumn><tableColumn id="2" name="数量" dataDxfId="\d+" totalsRowFunction="average"><calculatedColumnFormula>SUM\(\[数量\]\)<\/calculatedColumnFormula><totalsRowFormula>SUBTOTAL\(101,\[数量\]\)<\/totalsRowFormula><\/tableColumn>/);
  // Column stripes and the emphasized columns are off unless the table asks for them.
  assert.match(tableXml, /showColumnStripes="1"/);
  assert.match(tableXml, /showFirstColumn="1" showLastColumn="1"/);
  // A column keeps the values it still shows inside the table's own autoFilter.
  assert.match(tableXml, /<autoFilter ref="A1:B2"><filterColumn colId="0"><filters><filter val="甲"\/><\/filters><\/filterColumn><\/autoFilter>/);
  // The sort covers the data rows only. This table has no header and ends on a totals row, so that is the first row.
  assert.match(tableXml, /<sortState ref="A1:B1"><sortCondition descending="1" ref="B1:B1"\/><\/sortState>/);
  // The number format lands in the styles, and the column points at that entry.
  assert.match(new TextDecoder().decode(out["xl/styles.xml"]), /<dxf><numFmt numFmtId="\d+" formatCode="0.00"\/><\/dxf>/);
  assert.ok(out["xl/drawings/drawing1.xml"]);
  assert.ok(out["xl/theme/theme1.xml"]);
});

test("keeps what-if data tables and drops slicers, which are not in ECMA-376", () => {
  const made = blankWorkbook("销售", [[{ value: "1" }], [{ value: "2" }]]);
  const sheet = made.workbook.sheets[0]!;
  sheet.slicers = [{ id: "品类切片", name: "品类切片", source: "Table1", field: "品类", values: ["甲"] }];
  sheet.dataTables = [{ ref: "A2:A2", rowInput: "B1", colInput: "B2" }];
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  assert.equal(out["xl/slicers/slicer1.xml"], undefined);
  assert.equal(out["xl/slicerCaches/slicerCache1_1.xml"], undefined);
  const rels = new TextDecoder().decode(out["xl/worksheets/_rels/sheet1.xml.rels"] ?? new Uint8Array());
  assert.doesNotMatch(rels, /slicer/);
  const sheetXml = new TextDecoder().decode(out["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
  assert.match(sheetXml, /<f t="dataTable" ref="A2:A2" dt2D="1" dtr="1" r1="B1" r2="B2"><\/f>/);
  assert.doesNotMatch(sheetXml, /schemas\.microsoft\.com/);
});

test("writes the pivot cache, sheet protection, and the header", () => {
  const made = blankWorkbook("销售", [[{ value: "甲" }, { value: "10" }]]);
  const sheet = made.workbook.sheets[0]!;
  sheet.protected = true;
  sheet.pageSetup = { header: "机密", footer: "第 1 页" };
  sheet.pivots = [{
    id: "pivot1",
    name: "销量透视",
    source: "A1:B2",
    rows: ["品类"],
    values: ["数量"],
    fields: ["品类", "数量"],
    cache: [["甲", "10"], ["乙", "5"]],
    agg: "max",
  }];
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const sheetXml = new TextDecoder().decode(out["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
  assert.match(sheetXml, /<sheetProtection sheet="1"\/>/);
  assert.match(sheetXml, /<oddHeader>机密<\/oddHeader>/);
  assert.match(sheetXml, /<oddFooter>第 1 页<\/oddFooter>/);
  const table = new TextDecoder().decode(out["xl/pivotTables/pivotTable1.xml"] ?? new Uint8Array());
  assert.match(table, /name="销量透视"/);
  assert.match(table, /cacheId="1"/);
  assert.match(table, /<rowFields count="1"><field x="0"\/><\/rowFields>/);
  assert.match(table, /<dataField fld="1" subtotal="max"\/>/);
  const cache = new TextDecoder().decode(out["xl/pivotCache/pivotCacheDefinition1.xml"] ?? new Uint8Array());
  assert.match(cache, /<worksheetSource ref="A1:B2"\/>/);
  const records = new TextDecoder().decode(out["xl/pivotCache/pivotCacheRecords1.xml"] ?? new Uint8Array());
  assert.match(records, /<s v="甲"\/><n v="10"\/>/);
  const workbook = new TextDecoder().decode(out["xl/workbook.xml"] ?? new Uint8Array());
  assert.match(workbook, /<pivotCache cacheId="1" r:id="rIdPivotCache1"\/>/);
  const workbookRels = new TextDecoder().decode(out["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  assert.match(workbookRels, /Target="pivotCache\/pivotCacheDefinition1.xml"/);
});

test("writes a new sheet, outline levels, and an allowed edit range", () => {
  const made = blankWorkbook("销售", [[{ value: "甲" }]]);
  made.workbook.sheets.push({ name: "库存", cells: [[{ value: "3" }]] });
  made.workbook.sheets[0]!.outline = { rows: [0], cols: [0], summaryBelow: false };
  made.workbook.sheets[0]!.allowEditRanges = [{ name: "可改", range: "A1:A1" }];
  made.workbook.sheets[0]!.formControls = [{ id: "fc1", kind: "button", label: "提交" }];
  made.workbook.sheets[0]!.xmlMaps = [{ id: "map1", name: "订单", root: "order" }];
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const workbook = new TextDecoder().decode(out["xl/workbook.xml"] ?? new Uint8Array());
  assert.match(workbook, /<sheet name="库存" sheetId="2" r:id="rId2"\/>/);
  const sheet = new TextDecoder().decode(out["xl/worksheets/sheet1.xml"] ?? new Uint8Array());
  assert.match(sheet, /<row r="1" outlineLevel="1"/);
  assert.match(sheet, /<col min="1" max="1" outlineLevel="1"\/>/);
  assert.match(sheet, /<outlinePr summaryBelow="0"\/>/);
  assert.match(sheet, /<protectedRange name="可改" sqref="A1:A1"/);
  const added = new TextDecoder().decode(out["xl/worksheets/sheet2.xml"] ?? new Uint8Array());
  assert.match(added, /<c r="A1"><v>3<\/v><\/c>/);
  // 表单控件属性是 x14 扩展，不写。XML 映射留在 spreadsheetml 里。
  assert.equal(out["xl/ctrlProps/ctrlProp1.xml"], undefined);
  const maps = new TextDecoder().decode(out["xl/xmlMaps/xmlMap1.xml"] ?? new Uint8Array());
  assert.match(maps, /Name="订单" RootElement="order"/);
});

test("writes a consolidation definition", () => {
  const made = blankWorkbook("汇总", [[{ value: "16" }]]);
  made.workbook.sheets[0]!.consolidation = {
    func: "sum",
    sources: ["一月!A1:B2", "二月!A1:B2"],
    dest: "汇总!A1",
    leftCol: true,
    links: true,
  };
  made.workbook.edited = true;
  const out = unzipSync(writeXlsx(made.workbook));
  const xml = new TextDecoder().decode(out["xl/consolidation/consolidation1.xml"] ?? new Uint8Array());
  assert.match(xml, /<consolidation func="sum" dest="汇总!A1" leftCol="1" links="1">/);
  assert.match(xml, /<source ref="一月!A1:B2"\/><source ref="二月!A1:B2"\/>/);
  const rels = new TextDecoder().decode(out["xl/worksheets/_rels/sheet1.xml.rels"] ?? new Uint8Array());
  assert.match(rels, /Target="..\/consolidation\/consolidation1.xml"/);
});
