"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blankWorkbook = blankWorkbook;
const fflate_1 = require("fflate");
const cells_1 = require("./cells");
const styles_1 = require("./styles");
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
function blankWorkbook(name = "Sheet1", cells = []) {
    const sheet = { name, cells };
    const styles = (0, styles_1.styleBook)(STYLES, [sheet]);
    const edited = (0, cells_1.applySheetEdits)(SHEET, sheet, (0, cells_1.readSharedStrings)(undefined), styles);
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const source = new Map([
        ["[Content_Types].xml", (0, fflate_1.strToU8)(CONTENT_TYPES)],
        ["_rels/.rels", (0, fflate_1.strToU8)(RELS)],
        ["xl/workbook.xml", (0, fflate_1.strToU8)(workbookXml)],
        ["xl/_rels/workbook.xml.rels", (0, fflate_1.strToU8)(WORKBOOK_RELS)],
        ["xl/worksheets/sheet1.xml", (0, fflate_1.strToU8)(edited.xml)],
        ["xl/sharedStrings.xml", (0, fflate_1.strToU8)((0, cells_1.writeSharedStrings)(edited.shared))],
        ["xl/styles.xml", (0, fflate_1.strToU8)(styles.xml)],
    ]);
    return { bytes: (0, fflate_1.zipSync)(Object.fromEntries(source)), workbook: { sheets: [sheet], source } };
}
function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
