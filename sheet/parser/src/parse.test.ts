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

function sheet(rows: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet><sheetData>${rows}</sheetData></worksheet>`;
}

test("reads shared strings, numbers, and bold", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/styles.xml": STYLES,
    "xl/sharedStrings.xml": `<sst><si><t>合计</t></si><si><r><t>第</t></r><r><t>一</t></r></si></sst>`,
    "xl/worksheets/sheet1.xml": sheet(
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
    "xl/worksheets/sheet1.xml": sheet(`<row r="1"><c r="A1"><v>1</v></c></row>`),
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
    `<autoFilter ref="A1:B2"/><mergeCells count="1"><mergeCell ref="A1:B1"/></mergeCells>` +
    `<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75"/>` +
    `<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" scale="80"/>` +
    `<printOptions gridLines="1" headings="0"/>`;
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/styles.xml": styles,
    "xl/sharedStrings.xml": `<sst><si><t>标题</t></si></sst>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet>${body}</worksheet>`,
  });
  const sheet = (await parseXlsx(bytes)).sheets[0];
  assert.deepEqual(sheet?.cells[0]?.[0], {
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
  assert.deepEqual(sheet?.merges, [{ r1: 0, c1: 0, r2: 0, c2: 1 }]);
  assert.equal(sheet?.colWidths?.[1], 18);
  assert.deepEqual(sheet?.hiddenCols, [2]);
  assert.equal(sheet?.rowHeights?.[0], 24);
  assert.deepEqual(sheet?.hiddenRows, [1]);
  assert.deepEqual(sheet?.freeze, { row: 1, col: 1 });
  assert.deepEqual(sheet?.filter, { r1: 0, c1: 0, r2: 1, c2: 1 });
  assert.equal(sheet?.pageSetup?.orientation, "landscape");
  assert.equal(sheet?.pageSetup?.paperSize, "A4");
  assert.equal(sheet?.pageSetup?.fitToWidth, 1);
  assert.equal(sheet?.pageSetup?.scale, 80);
  assert.equal(sheet?.pageSetup?.margins?.top, 0.75);
  assert.equal(sheet?.pageSetup?.gridlines, true);
  assert.equal(sheet?.pageSetup?.headings, false);
});

test("reads a formula cell with its cache", async () => {
  const bytes = book({
    "xl/workbook.xml": WORKBOOK,
    "xl/worksheets/sheet1.xml": sheet(
      `<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><f>A1+B1</f><v>3</v></c></row>`,
    ),
  });
  const workbook = await parseXlsx(bytes);
  const cell = workbook.sheets[0]?.cells[0]?.[2];
  assert.equal(cell?.formula, "A1+B1");
  assert.equal(cell?.value, "3");
});
