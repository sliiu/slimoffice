import { strToU8, zipSync } from "fflate";
import type { SheetCell, Workbook, Worksheet } from "@sliiu/sheet-core";
import { applySheetEdits, readSharedStrings, writeSharedStrings } from "./cells";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellXfs count="2"><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>`;

const SHEET = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData></sheetData></worksheet>`;

/** A one-sheet workbook, empty or filled. It can be opened again. */
export function blankWorkbook(name = "Sheet1", cells: SheetCell[][] = []): { bytes: Uint8Array; workbook: Workbook } {
  const sheet: Worksheet = { name, cells };
  const edited = applySheetEdits(SHEET, cells, readSharedStrings(undefined));
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const source = new Map<string, Uint8Array>([
    ["[Content_Types].xml", strToU8(CONTENT_TYPES)],
    ["_rels/.rels", strToU8(RELS)],
    ["xl/workbook.xml", strToU8(workbookXml)],
    ["xl/_rels/workbook.xml.rels", strToU8(WORKBOOK_RELS)],
    ["xl/worksheets/sheet1.xml", strToU8(edited.xml)],
    ["xl/sharedStrings.xml", strToU8(writeSharedStrings(edited.shared))],
    ["xl/styles.xml", strToU8(STYLES)],
  ]);
  return { bytes: zipSync(Object.fromEntries(source)), workbook: { sheets: [sheet], source } };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
