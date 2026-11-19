import type { SheetCell, Workbook } from "@sliiu/sheet-core";

export interface CsvOptions {
  delimiter?: string;
  name?: string;
}

/** Read CSV / TSV text into a one-sheet workbook. */
export function parseCsv(input: string | Uint8Array | ArrayBuffer, options: CsvOptions = {}): Workbook {
  const text = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  const delimiter = options.delimiter ?? detectDelimiter(text);
  const rows = parseRows(text, delimiter);
  const cells: SheetCell[][] = rows.map((row) => row.map((value) => ({ value })));
  return { sheets: [{ name: options.name ?? "Sheet1", cells }], edited: false };
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/, 5).join("\n");
  const commas = (sample.match(/,/g) ?? []).length;
  const tabs = (sample.match(/\t/g) ?? []).length;
  const semis = (sample.match(/;/g) ?? []).length;
  if (tabs > commas && tabs >= semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;
  const body = text.replace(/^﻿/, "");
  while (i < body.length) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1]?.every((item) => item === "")) rows.pop();
  return rows;
}

/** Write a workbook's first sheet as CSV text. */
export function writeCsv(workbook: Workbook, delimiter = ","): string {
  const sheet = workbook.sheets[0];
  if (!sheet) return "";
  const width = sheet.cells.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  return sheet.cells
    .map((row) => {
      const line = [];
      for (let c = 0; c < width; c += 1) line.push(escapeCsv(row?.[c]?.value ?? "", delimiter));
      return line.join(delimiter);
    })
    .join("\n");
}

function escapeCsv(value: string, delimiter: string): string {
  if (/["\n\r]/.test(value) || value.includes(delimiter)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
