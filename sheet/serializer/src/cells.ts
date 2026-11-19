import type { SheetCell, Workbook, Worksheet } from "@sliiu/sheet-core";
import { drawingFragments } from "./drawing";
import { autoFilterXml, conditionalFormattingXml, pageSetupXml, styleBook, type StyleBook } from "./styles";

/**
 * Puts edited cells back into one worksheet.
 * A formula cell is left untouched until its shown value changes. New text goes to the shared-string table.
 */
export function applySheetEdits(
  sheetXml: string,
  sheet: Worksheet,
  shared: SharedStrings,
  styles: StyleBook,
): { xml: string; shared: SharedStrings } {
  const table = cloneShared(shared);
  const data = sheetDataRange(sheetXml);
  if (!data) return { xml: sheetXml, shared: table };
  const rows = new Map<number, string>();
  for (const rowXml of data.body.match(/<row\b[\s\S]*?<\/row>/gi) ?? []) {
    const index = Number(/\br="(\d+)"/i.exec(rowXml)?.[1]);
    if (Number.isInteger(index)) rows.set(index, rowXml);
  }
  const cells = sheet.cells;
  const count = Math.max(cells.length, ...rows.keys());
  const written: string[] = [];
  for (let row = 1; row <= count; row += 1) {
    const existing = rows.get(row);
    const next = cells[row - 1];
    if (!next && existing) {
      written.push(existing);
      continue;
    }
    written.push(rowXml(row, existing, next ?? [], table, styles));
  }
  let xml = sheetXml.slice(0, data.start) + written.join("") + sheetXml.slice(data.end);
  xml = upsertAfterSheetData(xml, "autoFilter", autoFilterXml(sheet));
  xml = upsertBeforeClose(xml, conditionalFormattingXml(sheet));
  xml = upsertBeforeClose(xml, pageSetupXml(sheet));
  return { xml, shared: table };
}

function ensureWorksheetNs(xml: string): string {
  if (/xmlns:r=/.test(xml)) return xml;
  return xml.replace(
    /<worksheet\b([^>]*)>/i,
    '<worksheet$1 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
  );
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
  const styles = styleBook(textOf(parts, "xl/styles.xml", decode), workbook.sheets);
  const contentExtras: string[] = [];
  paths.forEach((path, index) => {
    const sheet = workbook.sheets[index];
    const xml = textOf(parts, path, decode);
    if (!sheet || !xml) return;
    const next = applySheetEdits(xml, sheet, shared, styles);
    shared = next.shared;
    const drawing = drawingFragments(sheet, index);
    let sheetXml = ensureWorksheetNs(next.xml);
    if (drawing.sheetExtras) sheetXml = upsertBeforeClose(sheetXml, drawing.sheetExtras);
    if (sheetXml !== xml) {
      parts.set(path, encode(sheetXml));
      changed = true;
    }
    for (const [partPath, partXml] of drawing.parts) {
      parts.set(partPath, encode(partXml));
      changed = true;
    }
    contentExtras.push(...drawing.contentTypes);
    if (drawing.rels.length) {
      const relPath = path.replace(/worksheets\/(sheet\d+)\.xml$/i, "worksheets/_rels/$1.xml.rels");
      const existing = textOf(parts, relPath, decode) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
      const merged = existing.replace(
        "</Relationships>",
        `${drawing.rels.join("")}</Relationships>`,
      );
      parts.set(relPath, encode(merged));
    }
  });
  if (workbook.theme) {
    parts.set(
      "xl/theme/theme1.xml",
      encode(themeXml(workbook.theme)),
    );
    contentExtras.push('<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>');
    changed = true;
  }
  if (changed) {
    parts.set("xl/sharedStrings.xml", encode(writeSharedStrings(shared)));
    parts.set("xl/styles.xml", encode(styles.xml));
    const types = textOf(parts, "[Content_Types].xml", decode);
    if (types && contentExtras.length) {
      const unique = contentExtras.filter((item, index) => contentExtras.indexOf(item) === index && !types.includes(item));
      if (unique.length) parts.set("[Content_Types].xml", encode(types.replace("</Types>", `${unique.join("")}</Types>`)));
    }
  }
}

function themeXml(theme: NonNullable<Workbook["theme"]>): string {
  const colors = theme.colors ?? ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
  const major = theme.fonts?.major ?? "Calibri Light";
  const minor = theme.fonts?.minor ?? "Calibri";
  const scheme = colors.map((color, index) => `<a:srgbClr val="${color.replace("#", "").toUpperCase()}"/><!-- accent${index + 1} -->`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${escapeTheme(theme.name ?? "Office Theme")}"><a:themeElements><a:clrScheme name="Office">${scheme}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="${escapeTheme(major)}"/></a:majorFont><a:minorFont><a:latin typeface="${escapeTheme(minor)}"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}

function escapeTheme(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

function rowXml(row: number, existing: string | undefined, cells: SheetCell[], shared: SharedStrings, styles: StyleBook): string {
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
    written.push(cellXml(columnName(column) + row, cell, prior, shared, styles));
  }
  return `<row r="${row}">${written.join("")}</row>`;
}

function cellXml(ref: string, cell: SheetCell, prior: string | undefined, shared: SharedStrings, styles: StyleBook): string {
  if (prior && isFormula(prior) && !cell.formula && (shownValue(prior) === cell.value || formulaText(prior) === cell.value || `=${formulaText(prior)}` === cell.value)) {
    return prior;
  }
  if (cell.value === "" && !cell.formula && !prior) return "";
  const style = styles.indexFor(cell) ?? (prior ? /\bs="(\d+)"/i.exec(prior)?.[1] : undefined);
  const styleAttr = style ? ` s="${style}"` : "";
  if (cell.formula) {
    const body = escapeXml(cell.formula.replace(/^\=/, ""));
    const cached = cell.value && cell.value !== `=${cell.formula}` && cell.value.toUpperCase() !== cell.formula.toUpperCase() ? cell.value : "";
    if (cached === "TRUE" || cached === "FALSE") {
      return `<c r="${ref}"${styleAttr} t="b"><f>${body}</f><v>${cached === "TRUE" ? "1" : "0"}</v></c>`;
    }
    if (cached && isNumber(cached)) return `<c r="${ref}"${styleAttr}><f>${body}</f><v>${cached}</v></c>`;
    if (cached) return `<c r="${ref}"${styleAttr} t="str"><f>${body}</f><v>${escapeXml(cached)}</v></c>`;
    return `<c r="${ref}"${styleAttr}><f>${body}</f></c>`;
  }
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

function formulaText(cellXml: string): string {
  return /<f\b[^>]*>([\s\S]*?)<\/f>/i.exec(cellXml)?.[1] ?? "";
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

function upsertAfterSheetData(xml: string, tag: string, fragment: string): string {
  const cleaned = xml.replace(new RegExp(`<${tag}\\b[^>]*/>|<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), "");
  if (!fragment) return cleaned;
  const close = cleaned.indexOf("</sheetData>");
  if (close < 0) return cleaned + fragment;
  const at = close + "</sheetData>".length;
  return cleaned.slice(0, at) + fragment + cleaned.slice(at);
}

function upsertBeforeClose(xml: string, fragment: string): string {
  if (!fragment) return xml;
  const close = xml.lastIndexOf("</worksheet>");
  if (close < 0) return xml + fragment;
  return xml.slice(0, close) + fragment + xml.slice(close);
}
