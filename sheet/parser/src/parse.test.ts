import assert from "node:assert/strict";
import { test } from "node:test";
import { zipSync, strToU8 } from "fflate";
import { parseXlsx, XlsxOpenError } from "./index";

function book(files: Record<string, string>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [path, text] of Object.entries(files)) encoded[path] = strToU8(text);
  return zipSync(encoded);
}

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="销售" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet>
  <fonts count="2"><font/><font><b/></font></fonts>
  <cellXfs count="2"><xf fontId="0"/><xf fontId="1"/></cellXfs>
</styleSheet>`;

function rowsOf(rows: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet><sheetData>${rows}</sheetData></worksheet>`;
}

test("reads shared strings, numbers, and bold", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/styles.xml": STYLES,
    "xl/sharedStrings.xml": `<sst><si><t>合计</t></si><si><r><t>第</t></r><r><t>一</t></r></si></sst>`,
    "xl/worksheets/sheet1.xml": rowsOf(
      `<row r="1"><c r="A1" t="s" s="1"><v>0</v></c><c r="B1"><v>12.5</v></c></row>` +
      `<row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3" t="b"><v>1</v></c></row>`,
    ),
  });
  const workbook = await parseXlsx(bytes);
  assert.equal(workbook.sheets[0]?.name, "销售");
  const cells = workbook.sheets[0]?.cells ?? [];
  assert.deepEqual(cells[0]?.[0], { value: "合计", bold: true });
  assert.deepEqual(cells[0]?.[1], { value: "12.5" });
  assert.equal(cells[1], undefined);
  assert.deepEqual(cells[2]?.[0], { value: "第一" });
  assert.deepEqual(cells[2]?.[2], { value: "TRUE" });
});

test("keeps the original parts for writing back", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": rowsOf(`<row r="1"><c r="A1"><v>1</v></c></row>`),
    "xl/calcChain.xml": `<calcChain/>`,
  });
  const workbook = await parseXlsx(bytes);
  assert.equal(workbook.source?.get("xl/calcChain.xml")?.byteLength, strToU8(`<calcChain/>`).byteLength);
});

test("rejects a binary .xls", async () => {
  const bytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(parseXlsx(bytes), (err: unknown) => err instanceof XlsxOpenError && err.code === "LEGACY_XLS");
});

test("reads styles, merges, sizes, freeze, filter, and page setup", async () => {
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet>
  <numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>
  <fonts count="2"><font/><font><b/><i/><sz val="14"/><color rgb="FFFF0000"/><name val="Arial"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FF000000"/></left><right style="dashed"/></border></borders>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="164" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1" indent="2"/></xf>
  </cellXfs>
</styleSheet>`;
  const body = `<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" state="frozen" topLeftCell="B2"/></sheetView></sheetViews>` +
    `<cols><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="3" hidden="1"/></cols>` +
    `<sheetData><row r="1" ht="24" customHeight="1"><c r="A1" s="1" t="s"><v>0</v></c></row><row r="2" hidden="1"><c r="A2"><v>1</v></c></row></sheetData>` +
    `<autoFilter ref="A1:B2"><filterColumn colId="0"><filters><filter val="甲"/></filters></filterColumn></autoFilter><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>` +
    `<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75"/>` +
    `<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" scale="80"/>` +
    `<printOptions gridLines="1" headings="0"/>`;
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/styles.xml": styles,
    "xl/sharedStrings.xml": `<sst><si><t>标题</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet>${body}</worksheet>`,
  });
  const opened = (await parseXlsx(bytes)).sheets[0];
  assert.deepEqual(opened?.cells[0]?.[0], {
    value: "标题",
    bold: true,
    italic: true,
    fontSize: 14,
    color: "#ff0000",
    font: "Arial",
    fill: "#00ff00",
    numFmt: "0.00",
    align: "center",
    valign: "middle",
    wrap: true,
    indent: 2,
    border: { left: { style: "thin", color: "#000000" }, right: { style: "dashed" } },
  });
  assert.deepEqual(opened?.merges, [{ r1: 0, c1: 0, r2: 0, c2: 1 }]);
  assert.equal(opened?.colWidths?.[1], 18);
  assert.deepEqual(opened?.hiddenCols, [2]);
  assert.equal(opened?.rowHeights?.[0], 24);
  assert.deepEqual(opened?.hiddenRows, [1]);
  assert.deepEqual(opened?.freeze, { row: 1, col: 1 });
  assert.deepEqual(opened?.filter, { r1: 0, c1: 0, r2: 1, c2: 1, columns: [{ col: 0, values: ["甲"] }] });
  assert.equal(opened?.pageSetup?.orientation, "landscape");
  assert.equal(opened?.pageSetup?.paperSize, "A4");
  assert.equal(opened?.pageSetup?.fitToWidth, 1);
  assert.equal(opened?.pageSetup?.scale, 80);
  assert.equal(opened?.pageSetup?.margins?.top, 0.75);
  assert.equal(opened?.pageSetup?.gridlines, true);
  assert.equal(opened?.pageSetup?.headings, false);
});

test("reads a formula cell with its cache", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": rowsOf(
      `<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><f>A1+B1</f><v>3</v></c></row>`,
    ),
  });
  const workbook = await parseXlsx(bytes);
  const cell = workbook.sheets[0]?.cells[0]?.[2];
  assert.equal(cell?.formula, "A1+B1");
  assert.equal(cell?.value, "3");
});

test("reads names, conditional formats, validation, tables, charts, and sparklines", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK.replace(
      "</workbook>",
      `<definedNames><definedName name="税率">Sheet1!$B$1</definedName></definedNames></workbook>`,
    ),
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet>` +
      `<sheetData><row r="1"><c r="A1"><v>1</v></c><c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="A2"><v>2</v></c><c r="B2"><v>20</v></c></row></sheetData>` +
      `<hyperlinks><hyperlink ref="B1" location="Sheet2!A1" display="明细"/></hyperlinks>` +
      `<conditionalFormatting sqref="A1:A2"><cfRule type="cellIs" operator="greaterThan"><formula>10</formula></cfRule></conditionalFormatting>` +
      `<dataValidations count="2"><dataValidation type="list" sqref="B1:B2" allowBlank="1"><formula1>"甲,乙"</formula1></dataValidation>` +
      `<dataValidation type="whole" operator="between" sqref="A1:A2"><formula1>1</formula1><formula2>9</formula2></dataValidation></dataValidations>` +
      `<tableParts count="1"><tablePart r:id="rIdTable1"/></tableParts>` +
      `<drawing r:id="rIdDrawing1"/>` +
      `<extLst><ext uri="{05C60535-1F16-4fd2-B107-1C6BDA2B7F3E}"><sparklineGroups><sparklineGroup type="column"><sparklines><sparkline><f>A1:A2</f><sqref>C1</sqref></sparkline></sparklines></sparklineGroup></sparklineGroups></ext></extLst>` +
      `</worksheet>`,
    "xl/worksheets/_rels/sheet1.xml.rels": `<Relationships>` +
      `<Relationship Id="rIdTable1" Type="table" Target="../tables/table1.xml"/>` +
      `<Relationship Id="rIdDrawing1" Type="drawing" Target="../drawings/drawing1.xml"/>` +
      `</Relationships>`,
    "xl/tables/table1.xml": `<table id="1" name="Table1" displayName="Table1" ref="A1:B2" headerRowCount="1" totalsRowCount="1"><tableColumns count="2"><tableColumn id="1" name="品类"/><tableColumn id="2" name="数量"/></tableColumns></table>`,
    "xl/drawings/drawing1.xml": `<wsDr><graphicFrame><cNvPr id="1" name="Chart 1"/></graphicFrame></wsDr>`,
    "xl/drawings/_rels/drawing1.xml.rels": `<Relationships><Relationship Id="rIdChart1" Type="chart" Target="../charts/chart1.xml"/></Relationships>`,
    "xl/charts/chart1.xml": `<chartSpace><chart><plotArea><barChart><ser><val><numRef><f>Sheet1!$B$1:$B$2</f></numRef></val></ser><ser><val><numRef><f>Sheet1!$C$1:$C$2</f></numRef></val></ser></barChart></plotArea></chart></chartSpace>`,
    "xl/sharedStrings.xml": `<sst><si><t>甲</t></si></sst>`,
  });
  const workbook = await parseXlsx(bytes);
  const opened = workbook.sheets[0];
  assert.deepEqual(workbook.names, [{ name: "税率", refersTo: "Sheet1!$B$1" }]);
  assert.equal(opened?.cells[0]?.[1]?.hyperlink, "Sheet2!A1");
  assert.equal(opened?.conditionalFormats?.[0]?.rule.type, "cellValue");
  assert.deepEqual(opened?.conditionalFormats?.[0]?.rule, { type: "cellValue", op: "gt", formula1: "10" });
  assert.equal(opened?.validations?.[0]?.type, "list");
  assert.equal(opened?.validations?.[0]?.formula1, '"甲,乙"');
  assert.equal(opened?.validations?.[1]?.op, "between");
  assert.equal(opened?.validations?.[1]?.formula2, "9");
  assert.equal(opened?.tables?.[0]?.name, "Table1");
  assert.deepEqual(opened?.tables?.[0]?.columns, ["品类", "数量"]);
  assert.equal(opened?.tables?.[0]?.totalsRow, true);
  assert.deepEqual(opened?.charts?.[0], { id: "chart1", kind: "column", range: "$B$1:$B$2", series: ["$B$1:$B$2", "$C$1:$C$2"] });
  assert.deepEqual(opened?.sparklines?.[0], { id: "spark1", kind: "column", data: "A1:A2", location: "C1" });
});

test("reads the fill and font color a conditional format points at", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/styles.xml": `<styleSheet><fonts count="1"><font/></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellXfs count="1"><xf/></cellXfs>` +
      `<dxfs count="1"><dxf><font><color rgb="FFFF0000"/></font><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill></dxf></dxfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet>` +
      `<sheetData><row r="1"><c r="A1"><v>12</v></c></row></sheetData>` +
      `<conditionalFormatting sqref="A1:A1"><cfRule type="cellIs" dxfId="0" operator="greaterThan" priority="1"><formula>10</formula></cfRule></conditionalFormatting>` +
      `</worksheet>`,
  });
  const workbook = await parseXlsx(bytes);
  assert.deepEqual(workbook.sheets[0]?.conditionalFormats?.[0]?.rule, { type: "cellValue", op: "gt", formula1: "10", fill: "#ffff00", color: "#ff0000" });
});

test("reads duplicate, top, average, and text conditional formats", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet>` +
      `<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>` +
      `<conditionalFormatting sqref="A1:A3">` +
      `<cfRule type="duplicateValues" priority="1"/>` +
      `<cfRule type="top10" priority="2" rank="2" bottom="1"/>` +
      `<cfRule type="aboveAverage" priority="3" aboveAverage="0" equalAverage="1"/>` +
      `<cfRule type="containsText" priority="4" operator="containsText" text="甲"/>` +
      `</conditionalFormatting></worksheet>`,
  });
  const rules = (await parseXlsx(bytes)).sheets[0]?.conditionalFormats?.map((item) => item.rule);
  assert.deepEqual(rules, [
    { type: "duplicate" },
    { type: "top10", rank: 2, bottom: true },
    { type: "aboveAverage", above: false, equal: true },
    { type: "containsText", op: "contains", text: "甲" },
  ]);
});

test("reads theme colors, comments, and the pivot cache", async () => {
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet>` +
    `<fonts count="2"><font/><font><color theme="4"/></font></fonts>` +
    `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`;
  const bytes = book({
    "xl/workbook.xml": WORKBOOK.replace("</workbook>", `<pivotCaches><pivotCache cacheId="1" r:id="rIdCache1"/></pivotCaches></workbook>`),
    "xl/workbook.xml.rels": "",
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rIdCache1" Type="pivotCache" Target="pivotCache/pivotCacheDefinition1.xml"/></Relationships>`,
    "xl/theme/theme1.xml": '<a:theme name="Office"><a:themeElements>' +
      '<a:clrScheme><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
      '<a:accent1><a:srgbClr val="4472C4"/></a:accent1></a:clrScheme>' +
      '<a:fontScheme><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>' +
      '</a:themeElements></a:theme>',
    "xl/styles.xml": styles,
    "xl/worksheets/sheet1.xml": rowsOf('<row r="1"><c r="A1" s="1" t="s"><v>0</v></c><c r="B1"><v>10</v></c></row>' + '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>20</v></c></row>'),
    "xl/worksheets/_rels/sheet1.xml.rels": `<Relationships>` +
      `<Relationship Id="rIdComment1" Type="comments" Target="../comments1.xml"/>` +
      `<Relationship Id="rIdPivot1" Type="pivot" Target="../pivotTables/pivotTable1.xml"/>` +
      `</Relationships>`,
    "xl/comments1.xml": `<comments><commentList><comment ref="A1" authorId="0"><text><r><t>核对</t></r></text></comment></commentList></comments>`,
    "xl/pivotTables/pivotTable1.xml": `<pivotTableDefinition name="销量透视" cacheId="1"><pivotFields count="2"><pivotField/><pivotField/></pivotFields>` +
      `<rowFields count="1"><field x="0"/></rowFields><dataFields count="1"><dataField fld="1" subtotal="max"/></dataFields></pivotTableDefinition>`,
    "xl/pivotCache/pivotCacheDefinition1.xml": `<pivotCacheDefinition><cacheSource><worksheetSource ref="A1:B2"/></cacheSource>` +
      `<cacheFields count="2"><cacheField name="品类"/><cacheField name="数量"/></cacheFields></pivotCacheDefinition>`,
    "xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels": `<Relationships><Relationship Id="rIdRecords" Type="records" Target="pivotCacheRecords1.xml"/></Relationships>`,
    "xl/pivotCache/pivotCacheRecords1.xml": `<pivotCacheRecords count="1"><r><s v="甲"/><n v="10"/></r></pivotCacheRecords>`,
    "xl/sharedStrings.xml": `<sst><si><t>甲</t></si><si><t>乙</t></si></sst>`,
  });
  const workbook = await parseXlsx(bytes);
  const opened = workbook.sheets[0];
  assert.equal(workbook.theme?.fonts?.major, "Calibri Light");
  assert.equal(opened?.cells[0]?.[0]?.color, "#4472c4");
  assert.equal(opened?.cells[0]?.[0]?.comment, "核对");
  assert.equal(opened?.pivots?.[0]?.name, "销量透视");
  assert.equal(opened?.pivots?.[0]?.source, "A1:B2");
  assert.deepEqual(opened?.pivots?.[0]?.rows, ["品类"]);
  assert.deepEqual(opened?.pivots?.[0]?.values, ["数量"]);
  assert.deepEqual(opened?.pivots?.[0]?.cache, [["甲", "10"]]);
  assert.equal(opened?.pivots?.[0]?.agg, "max");
});

test("reads array formulas, named styles, outline, and the print area", async () => {
  const styles = '<?xml version="1.0"?><styleSheet>' +
    '<fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders>' +
    '<cellStyleXfs count="2"><xf fontId="0"/><xf fontId="0"/></cellStyleXfs>' +
    '<cellXfs count="2"><xf fontId="0" xfId="0"/><xf fontId="0" xfId="1"/></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="标题" xfId="1"/></cellStyles></styleSheet>';
  const bytes = book({
    "xl/workbook.xml": WORKBOOK.replace('</workbook>', '<definedNames>' +
      '<definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!$A$1:$B$2</definedName>' +
      '<definedName name="_xlnm.Print_Titles" localSheetId="0">Sheet1!$1:$1</definedName>' +
      '</definedNames></workbook>'),
    "xl/styles.xml": styles,
    "xl/worksheets/sheet1.xml": '<worksheet><sheetPr><outlinePr summaryBelow="0"/></sheetPr>' +
      '<cols><col min="1" max="1" outlineLevel="1"/></cols>' +
      '<sheetData><row r="1" outlineLevel="1"><c r="A1" s="1"><f t="array" ref="A1:A2">SUM(B1:B2)</f><v>30</v></c></row>' +
      '<row r="2"><c r="A2"><v>30</v></c></row></sheetData></worksheet>',
  });
  const workbook = await parseXlsx(bytes);
  const opened = workbook.sheets[0];
  assert.equal(opened?.cells[0]?.[0]?.formula, "SUM(B1:B2)");
  assert.equal(opened?.cells[0]?.[0]?.array, true);
  assert.equal(opened?.cells[0]?.[0]?.spillRef, "A1:A2");
  assert.equal(opened?.cells[1]?.[0]?.spill, "A1");
  assert.equal(opened?.cells[0]?.[0]?.styleName, "标题");
  assert.deepEqual(opened?.outline?.rows, [0]);
  assert.deepEqual(opened?.outline?.cols, [0]);
  assert.equal(opened?.outline?.summaryBelow, false);
  assert.equal(opened?.pageSetup?.printArea, "Sheet1!$A$1:$B$2");
  assert.equal(opened?.pageSetup?.printTitles, "Sheet1!$1:$1");
  assert.equal(workbook.names?.find((item) => item.name === "_xlnm.Print_Area")?.localSheet, 0);
});

test("reads page breaks, slicers, and what-if data tables", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData>' +
      '<row r="1"><c r="A1"><v>1</v></c></row>' +
      '<row r="2"><c r="B2"><f t="dataTable" ref="B2:C3" dt2D="1" dtr="1" r1="A1" r2="A2">B1</f><v>2</v></c></row>' +
      '</sheetData>' +
      '<rowBreaks count="1" manualBreakCount="1"><brk id="5" max="16383" man="1"/></rowBreaks>' +
      '<colBreaks count="1" manualBreakCount="1"><brk id="3" max="1048575" man="1"/></colBreaks>' +
      '</worksheet>',
    "xl/worksheets/_rels/sheet1.xml.rels": '<Relationships><Relationship Id="rIdSlicer1" Type="slicer" Target="../slicers/slicer1.xml"/></Relationships>',
    "xl/slicers/slicer1.xml": '<slicers><slicer name="品类切片" cache="SlicerCache1" caption="品类"/></slicers>',
    "xl/slicers/_rels/slicer1.xml.rels": '<Relationships><Relationship Id="rIdCache1" Type="slicerCache" Target="../slicerCaches/slicerCache1.xml"/></Relationships>',
    "xl/slicerCaches/slicerCache1.xml": '<slicerCacheDefinition name="SlicerCache1" sourceName="Table1"><data name="品类"><i v="甲"/><i v="乙" nd="1"/></data></slicerCacheDefinition>',
  });
  const opened = (await parseXlsx(bytes)).sheets[0];
  assert.deepEqual(opened?.pageBreaks, { rows: [5], cols: [3] });
  assert.deepEqual(opened?.slicers, [{ id: "品类切片", name: "品类切片", source: "Table1", field: "品类", values: ["甲"] }]);
  assert.deepEqual(opened?.dataTables, [{ ref: "B2:C3", rowInput: "A1", colInput: "A2" }]);
  assert.equal(opened?.cells[1]?.[1]?.array, true);
});

test("reads shapes, a text box, the header, and sheet protection", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>' +
      '<sheetProtection sheet="1"/>' +
      '<headerFooter><oddHeader>机密</oddHeader><oddFooter>第 1 页</oddFooter></headerFooter>' +
      '<drawing r:id="rIdDrawing1"/></worksheet>',
    "xl/worksheets/_rels/sheet1.xml.rels": '<Relationships><Relationship Id="rIdDrawing1" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>',
    "xl/drawings/drawing1.xml": '<xdr:wsDr>' +
      '<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from><xdr:ext cx="952500" cy="190500"/>' +
      '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="2" name="文本框 1"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr>' +
      '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr><xdr:txBody><a:p><a:r><a:t>备注</a:t></a:r></a:p></xdr:txBody></xdr:sp></xdr:oneCellAnchor>' +
      '<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="3" name="椭圆 1"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></xdr:spPr></xdr:sp></xdr:twoCellAnchor>' +
      '</xdr:wsDr>',
  });
  const opened = (await parseXlsx(bytes)).sheets[0];
  assert.equal(opened?.protected, true);
  assert.equal(opened?.pageSetup?.header, "机密");
  assert.equal(opened?.pageSetup?.footer, "第 1 页");
  assert.deepEqual(opened?.shapes?.map((shape) => [shape.kind, shape.text ?? ""]), [["ellipse", ""], ["textBox", "备注"]]);
  assert.equal(opened?.shapes?.[1]?.x, 1);
  assert.equal(opened?.shapes?.[1]?.y, 2);
  assert.equal(opened?.shapes?.[1]?.w, 100);
  assert.equal(opened?.shapes?.[1]?.h, 20);
  assert.equal(opened?.shapes?.[0]?.w, 128);
  assert.equal(opened?.shapes?.[0]?.h, 40);
});

test("reads form controls, an xml map, and allowed edit ranges", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>' +
      '<protectedRanges><protectedRange name="可改" sqref="A1:B2"/></protectedRanges></worksheet>',
    "xl/worksheets/_rels/sheet1.xml.rels": '<Relationships>' +
      '<Relationship Id="rIdCtrl1" Type="ctrlProp" Target="../ctrlProps/ctrlProp1.xml"/>' +
      '<Relationship Id="rIdMap1" Type="xmlMap" Target="../xmlMaps/xmlMap1.xml"/>' +
      '</Relationships>',
    "xl/ctrlProps/ctrlProp1.xml": '<formControlPr><control id="fc1" objectType="button" name="提交" fmlaLink="A1"/></formControlPr>',
    "xl/xmlMaps/xmlMap1.xml": '<MapInfo><Map ID="map1" Name="订单" RootElement="order"/></MapInfo>',
  });
  const opened = (await parseXlsx(bytes)).sheets[0];
  assert.deepEqual(opened?.allowEditRanges, [{ name: "可改", range: "A1:B2" }]);
  assert.deepEqual(opened?.formControls, [{ id: "fc1", kind: "button", label: "提交", linked: "A1" }]);
  assert.deepEqual(opened?.xmlMaps, [{ id: "map1", name: "订单", root: "order" }]);
});

test("reads a consolidation definition", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": rowsOf('<row r="1"><c r="A1"><v>16</v></c></row>'),
    "xl/worksheets/_rels/sheet1.xml.rels": '<Relationships><Relationship Id="rIdConsolidation1" Type="consolidation" Target="../consolidation/consolidation1.xml"/></Relationships>',
    "xl/consolidation/consolidation1.xml": '<consolidation func="sum" dest="汇总!A1" leftCol="1" links="1"><source ref="一月!A1:B2"/><source ref="二月!A1:B2"/></consolidation>',
  });
  const opened = (await parseXlsx(bytes)).sheets[0];
  assert.deepEqual(opened?.consolidation, {
    func: "sum",
    sources: ["一月!A1:B2", "二月!A1:B2"],
    dest: "汇总!A1",
    leftCol: true,
    links: true,
  });
});
