import type { SheetCell, Workbook } from "@sliiu/sheet-core";

/**
 * Puts edited cells back into one worksheet.
 * A formula cell is left untouched until its shown value changes. New text goes to the shared-string table.
 */
export function applySheetEdits(
  sheetXml: string,
  cells: SheetCell[][],
  shared: SharedStrings,
  boldStyle?: string,
): { xml: string; shared: SharedStrings } {
  const table = cloneShared(shared);
  const data = sheetDataRange(sheetXml);
  if (!data) return { xml: sheetXml, shared: table };
  const rows = new Map<number, string>();
  for (const rowXml of data.body.match(/<row\b[\s\S]*?<\/row>/gi) ?? []) {
    const index = Number(/\br="(\d+)"/i.exec(rowXml)?.[1]);
    if (Number.isInteger(index)) rows.set(index, rowXml);
  }
  const count = Math.max(cells.length, ...rows.keys());
  const written: string[] = [];
  for (let row = 1; row <= count; row += 1) {
    const existing = rows.get(row);
    const next = cells[row - 1];
    if (!next && existing) {
      written.push(existing);
      continue;
    }
    written.push(rowXml(row, existing, next ?? [], table, boldStyle));
  }
  return { xml: sheetXml.slice(0, data.start) + written.join("") + sheetXml.slice(data.end), shared: table };
}

export interface SharedStrings {
  items: string[];
  indexOf(value: string): number;
}

export function readSharedStrings(xml: string | undefined): SharedStrings {
  const items: string[] = [];
  if (xml) {
    for (const item of xml.match(/<si\b[\s\S]*?<\/si>/gi) ?? []) items.push(sharedText(item));
  }
  return sharedFrom(items);
}

export function writeSharedStrings(shared: SharedStrings): string {
  const items = shared.items.map((item) => `<si><t xml:space="preserve">${escapeXml(item)}</t></si>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.items.length}" uniqueCount="${shared.items.length}">${items}</sst>`;
}

/** Workbook sheet names in file order, from workbook.xml. */
export function sheetPaths(workbookXml: string, partNames: string[]): string[] {
  const names = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/gi)].map((match) => match[1] ?? "");
  const byNumber = partNames
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((a, b) => sheetNumber(a) - sheetNumber(b));
  return names.length ? byNumber.slice(0, names.length) : byNumber;
}

export function applyWorkbookEdits(
  parts: Map<string, Uint8Array>,
  workbook: Workbook,
  decode: (bytes: Uint8Array) => string,
  encode: (text: string) => Uint8Array,
): void {
  const workbookXml = textOf(parts, "xl/workbook.xml", decode);
  if (!workbookXml) return;
  const paths = sheetPaths(workbookXml, [...parts.keys()]);
  let shared = readSharedStrings(textOf(parts, "xl/sharedStrings.xml", decode));
  let changed = false;
  const boldStyle = boldCellStyle(textOf(parts, "xl/styles.xml", decode));
  paths.forEach((path, index) => {
    const sheet = workbook.sheets[index];
    const xml = textOf(parts, path, decode);
    if (!sheet || !xml) return;
    const next = applySheetEdits(xml, sheet.cells, shared, boldStyle);
    shared = next.shared;
    if (next.xml !== xml) {
      parts.set(path, encode(next.xml));
      changed = true;
    }
  });
  if (changed) parts.set("xl/sharedStrings.xml", encode(writeSharedStrings(shared)));
}

/** The cell style whose font is bold, if the workbook has one. */
function boldCellStyle(stylesXml: string | undefined): string | undefined {
  if (!stylesXml) return undefined;
  const fonts = [...block(stylesXml, "fonts").matchAll(/<font\b[^>]*\/>|<font\b[\s\S]*?<\/font>/gi)].map((match) => match[0]);
  const boldFont = fonts.findIndex((font) => /<b\b/i.test(font));
  if (boldFont < 0) return undefined;
  const styles = [...block(stylesXml, "cellXfs").matchAll(/<xf\b[^>]*>/gi)];
  const index = styles.findIndex((match) => Number(/\bfontId="(\d+)"/i.exec(match[0])?.[1]) === boldFont);
  return index < 0 ? undefined : String(index);
}

function block(xml: string, name: string): string {
  const open = new RegExp(`<${name}\\b[^>]*>`, "i").exec(xml);
  const close = open ? xml.indexOf(`</${name}>`, open.index) : -1;
  if (!open || close < 0) return "";
  return xml.slice(open.index + open[0].length, close);
}

function textOf(parts: Map<string, Uint8Array>, path: string, decode: (bytes: Uint8Array) => string): string | undefined {
  const bytes = parts.get(path);
  return bytes ? decode(bytes) : undefined;
}

function sheetDataRange(xml: string): { start: number; body: string; end: number } | undefined {
  const open = /<sheetData\b[^>]*>/i.exec(xml);
  const close = open ? xml.indexOf("</sheetData>", open.index) : -1;
  if (!open || close < 0) return undefined;
  const start = open.index + open[0].length;
  return { start, body: xml.slice(start, close), end: close };
}

function rowXml(row: number, existing: string | undefined, cells: SheetCell[], shared: SharedStrings, boldStyle: string | undefined): string {
  const kept = new Map<number, string>();
  for (const cellXml of existing?.match(/<c\b[\s\S]*?<\/c>/gi) ?? []) {
    const column = columnIndex(/\br="([A-Z]+)\d+"/i.exec(cellXml)?.[1] ?? "");
    if (column >= 0) kept.set(column, cellXml);
  }
  const count = Math.max(cells.length, ...kept.keys(), -1);
  const written: string[] = [];
  for (let column = 0; column <= count; column += 1) {
    const cell = cells[column];
    const prior = kept.get(column);
    if (!cell) {
      if (prior) written.push(prior);
      continue;
    }
    written.push(cellXml(columnName(column) + row, cell, prior, shared, boldStyle));
  }
  return `<row r="${row}">${written.join("")}</row>`;
}

function cellXml(ref: string, cell: SheetCell, prior: string | undefined, shared: SharedStrings, boldStyle: string | undefined): string {
  if (prior && isFormula(prior) && shownValue(prior) === cell.value) return prior;
  if (cell.value === "" && !prior) return "";
  const style = cell.bold ? boldStyle : prior ? /\bs="(\d+)"/i.exec(prior)?.[1] : undefined;
  const styleAttr = style ? ` s="${style}"` : "";
  if (cell.value === "") return `<c r="${ref}"${styleAttr}/>`;
  if (isNumber(cell.value)) return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
  if (cell.value === "TRUE" || cell.value === "FALSE") {
    return `<c r="${ref}"${styleAttr} t="b"><v>${cell.value === "TRUE" ? "1" : "0"}</v></c>`;
  }
  return `<c r="${ref}"${styleAttr} t="s"><v>${shared.indexOf(cell.value)}</v></c>`;
}

function isFormula(cellXml: string): boolean {
  return /<f\b/i.test(cellXml);
}

function shownValue(cellXml: string): string {
  const type = /\bt="([^"]*)"/i.exec(cellXml)?.[1] ?? "";
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(cellXml)?.[1] ?? "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

function isNumber(value: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(value);
}

function sharedText(item: string): string {
  const runs = [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => unescapeXml(match[1] ?? ""));
  return runs.join("");
}

function sharedFrom(items: string[]): SharedStrings {
  const lookup = new Map(items.map((item, index) => [item, index]));
  return {
    items,
    indexOf(value: string): number {
      const found = lookup.get(value);
      if (found !== undefined) return found;
      items.push(value);
      lookup.set(value, items.length - 1);
      return items.length - 1;
    },
  };
}

function cloneShared(shared: SharedStrings): SharedStrings {
  return sharedFrom([...shared.items]);
}

function columnIndex(letters: string): number {
  if (!/^[A-Z]+$/.test(letters)) return -1;
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function columnName(index: number): string {
  let name = "";
  let next = index + 1;
  while (next > 0) {
    next -= 1;
    name = String.fromCharCode(65 + (next % 26)) + name;
    next = Math.floor(next / 26);
  }
  return name;
}

function sheetNumber(path: string): number {
  return Number(/(\d+)\.xml$/i.exec(path)?.[1] ?? 0);
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeXml(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
