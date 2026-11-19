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
