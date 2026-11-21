import type { SheetCell, SheetPageSetup, Workbook, Worksheet } from "@sliiu/sheet-core";
import { hasLook, readCellStyles, type CellLook } from "./styles";
import { loadArchive, type OfficeArchive } from "./zip";
import { attr, child, children, parseXml, type XmlNode } from "./xml";

export type XlsxOpenErrorCode = "LEGACY_XLS" | "ENCRYPTED_XLSX" | "WRONG_PASSWORD";

export class XlsxOpenError extends Error {
  readonly code: XlsxOpenErrorCode;

  constructor(code: XlsxOpenErrorCode) {
    super(code);
    this.name = "XlsxOpenError";
    this.code = code;
  }
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export interface ParseXlsxOptions {
  /** Password for Agile-encrypted workbooks. */
  password?: string;
}

/** Reads a .xlsx into sheets. Formula cells keep `formula` and show the cached value until recalculate. */
export async function parseXlsx(input: ArrayBuffer | Uint8Array | Blob, options: ParseXlsxOptions = {}): Promise<Workbook> {
  let bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : new Uint8Array(input);
  if (isOle(bytes)) {
    const text = new TextDecoder("utf-16le").decode(bytes);
    if (!text.includes("EncryptedPackage")) throw new XlsxOpenError("LEGACY_XLS");
    if (!options.password) throw new XlsxOpenError("ENCRYPTED_XLSX");
    try {
      const { decryptAgile } = await import("./crypto");
      bytes = new Uint8Array(await decryptAgile(bytes, options.password));
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "WRONG_PASSWORD") {
        throw new XlsxOpenError("WRONG_PASSWORD");
      }
      throw new XlsxOpenError("ENCRYPTED_XLSX");
    }
  }
  const archive = loadArchive(bytes);
  const shared = sharedStrings(archive);
  const styles = readCellStyles(archive.getText("xl/styles.xml"));
  return { sheets: sheetsFrom(archive, shared, styles), source: archive.files };
}

function isOle(bytes: Uint8Array): boolean {
  return bytes.length >= OLE_MAGIC.length && OLE_MAGIC.every((byte, index) => bytes[index] === byte);
}

function sheetsFrom(archive: OfficeArchive, shared: string[], styles: CellLook[]): Worksheet[] {
  const workbook = child(parseXml(archive.getText("xl/workbook.xml") ?? ""), "workbook");
  const named = children(child(workbook, "sheets"), "sheet").map((sheet) => attr(sheet, "name") ?? "");
  const paths = [...archive.files.keys()]
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
    .sort((a, b) => sheetNumber(a) - sheetNumber(b));
  return paths.map((path, index) => sheetFrom(archive, path, named[index] || `Sheet${index + 1}`, shared, styles));
}

function sheetFrom(archive: OfficeArchive, path: string, name: string, shared: string[], styles: CellLook[]): Worksheet {
  const root = child(parseXml(archive.getText(path) ?? ""), "worksheet") ?? { name: "worksheet", attrs: {}, children: [], text: "" };
  const cells: SheetCell[][] = [];
  for (const row of children(child(root, "sheetData"), "row")) {
    for (const cell of children(row, "c")) {
      const ref = attr(cell, "r") ?? "";
      const where = cellRef(ref);
      if (!where) continue;
      const formulaNode = child(cell, "f");
      const formulaText = formulaNode?.text?.trim() ?? "";
      const cached = cellValue(cell, attr(cell, "t") ?? "", shared);
      const look = styles[Number(attr(cell, "s"))];
      if (!formulaText && !cached && !hasLook(look)) continue;
      const item: SheetCell = {
        // Formula cells keep the expression for the formula bar; the grid shows the cache until recalculate.
        value: formulaText ? cached || `=${formulaText}` : cached,
        ...look,
      };
      if (formulaText) item.formula = formulaText.replace(/^\=/, "");
      const line = cells[where.row] ?? [];
      line[where.column] = item;
      cells[where.row] = line;
    }
  }
  const sheet: Worksheet = { name, cells, ...sheetShape(root) };
  return sheet;
}

function sheetShape(root: XmlNode): Omit<Worksheet, "name" | "cells"> {
  const shape: Omit<Worksheet, "name" | "cells"> = {};
  const merges = children(child(root, "mergeCells"), "mergeCell")
    .map((item) => rangeOf(attr(item, "ref") ?? ""))
    .filter((item): item is NonNullable<typeof item> => !!item);
  if (merges.length) shape.merges = merges;
  const widths = new Map<number, number>();
  const hiddenCols: number[] = [];
  for (const col of children(child(root, "cols"), "col")) {
    const from = Number(attr(col, "min")) - 1;
    const to = Number(attr(col, "max")) - 1;
    if (from < 0 || to < from || to - from > 256) continue;
    const width = Number(attr(col, "width"));
    const hidden = attr(col, "hidden") === "1" || attr(col, "hidden") === "true";
    for (let column = from; column <= to; column += 1) {
      if (width > 0) widths.set(column, width);
      if (hidden) hiddenCols.push(column);
    }
  }
  if (widths.size) {
    const list: number[] = [];
    for (const [column, width] of widths) list[column] = width;
    shape.colWidths = list;
  }
  if (hiddenCols.length) shape.hiddenCols = hiddenCols;
  const heights: number[] = [];
  const hiddenRows: number[] = [];
  for (const row of children(child(root, "sheetData"), "row")) {
    const index = Number(attr(row, "r")) - 1;
    if (index < 0) continue;
    const height = Number(attr(row, "ht"));
    if (height > 0) heights[index] = height;
    if (attr(row, "hidden") === "1" || attr(row, "hidden") === "true") hiddenRows.push(index);
  }
  if (heights.some((height) => height != null)) shape.rowHeights = heights;
  if (hiddenRows.length) shape.hiddenRows = hiddenRows;
  const pane = children(child(root, "sheetViews"), "sheetView").flatMap((view) => children(child(view, "pane"), "pane").concat(child(view, "pane") ?? []))[0];
  const frozenRow = Number(attr(pane, "ySplit"));
  const frozenCol = Number(attr(pane, "xSplit"));
  if (frozenRow > 0 || frozenCol > 0) shape.freeze = { row: frozenRow > 0 ? frozenRow : 0, col: frozenCol > 0 ? frozenCol : 0 };
  const filter = rangeOf(attr(child(root, "autoFilter"), "ref") ?? "");
  if (filter) shape.filter = { r1: filter.r1, c1: filter.c1, r2: filter.r2, c2: filter.c2 };
  const page = pageSetup(root);
  if (page) shape.pageSetup = page;
  return shape;
}

function pageSetup(root: XmlNode): SheetPageSetup | undefined {
  const setup = child(root, "pageSetup");
  const margins = child(root, "pageMargins");
  const options = child(root, "printOptions");
  if (!setup && !margins && !options) return undefined;
  const page: SheetPageSetup = {};
  const orientation = attr(setup, "orientation");
  if (orientation === "portrait" || orientation === "landscape") page.orientation = orientation;
  const paper = attr(setup, "paperSize");
  if (paper === "1") page.paperSize = "Letter";
  else if (paper === "5") page.paperSize = "Legal";
  else if (paper === "9") page.paperSize = "A4";
  const width = Number(attr(setup, "fitToWidth"));
  const height = Number(attr(setup, "fitToHeight"));
  const scale = Number(attr(setup, "scale"));
  if (Number.isFinite(width) && attr(setup, "fitToWidth")) page.fitToWidth = width;
  if (Number.isFinite(height) && attr(setup, "fitToHeight")) page.fitToHeight = height;
  if (scale > 0) page.scale = scale;
  if (margins) {
    page.margins = {
      left: Number(attr(margins, "left")) || 0,
      right: Number(attr(margins, "right")) || 0,
      top: Number(attr(margins, "top")) || 0,
      bottom: Number(attr(margins, "bottom")) || 0,
    };
  }
  if (options) {
    page.gridlines = attr(options, "gridLines") === "1";
    page.headings = attr(options, "headings") === "1";
  }
  return page;
}

function rangeOf(ref: string): { r1: number; c1: number; r2: number; c2: number } | undefined {
  const parts = ref.split(":");
  const start = cellRef(parts[0] ?? "");
  const end = cellRef(parts[1] ?? parts[0] ?? "");
  if (!start || !end) return undefined;
  return { r1: start.row, c1: start.column, r2: end.row, c2: end.column };
}

function cellValue(cell: XmlNode, type: string, shared: string[]): string {
  if (type === "inlineStr") return textOf(child(cell, "is"));
  const raw = child(cell, "v")?.text ?? "";
  if (type === "s") return shared[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

function sharedStrings(archive: OfficeArchive): string[] {
  const root = child(parseXml(archive.getText("xl/sharedStrings.xml") ?? ""), "sst");
  return children(root, "si").map(textOf);
}

function textOf(node: XmlNode | undefined): string {
  if (!node) return "";
  const direct = node.children.filter((item) => item.name === "t").map((item) => item.text).join("");
  if (direct) return direct;
  return node.children.filter((item) => item.name === "r").map((run) => child(run, "t")?.text ?? "").join("");
}

function cellRef(ref: string): { row: number; column: number } | undefined {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return undefined;
  let column = 0;
  for (const letter of match[1] ?? "") column = column * 26 + letter.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, column: column - 1 };
}

function sheetNumber(path: string): number {
  return Number(/(\d+)\.xml$/i.exec(path)?.[1] ?? 0);
}

