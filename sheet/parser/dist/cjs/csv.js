"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCsv = parseCsv;
exports.writeCsv = writeCsv;
/** Read CSV / TSV text into a one-sheet workbook. */
function parseCsv(input, options = {}) {
    const text = typeof input === "string" ? input : new TextDecoder("utf-8").decode(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
    const delimiter = options.delimiter ?? detectDelimiter(text);
    const rows = parseRows(text, delimiter);
    const cells = rows.map((row) => row.map((value) => ({ value })));
    return { sheets: [{ name: options.name ?? "Sheet1", cells }], edited: false };
}
function detectDelimiter(text) {
    const sample = text.split(/\r?\n/, 5).join("\n");
    const commas = (sample.match(/,/g) ?? []).length;
    const tabs = (sample.match(/\t/g) ?? []).length;
    const semis = (sample.match(/;/g) ?? []).length;
    if (tabs > commas && tabs >= semis)
        return "\t";
    if (semis > commas)
        return ";";
    return ",";
}
function parseRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let i = 0;
    let quoted = false;
    const body = text.replace(/^﻿/, "");
    while (i < body.length) {
        const ch = body[i];
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
    while (rows.length && rows[rows.length - 1]?.every((item) => item === ""))
        rows.pop();
    return rows;
}
/** Write a workbook's first sheet as CSV text. */
function writeCsv(workbook, delimiter = ",") {
    const sheet = workbook.sheets[0];
    if (!sheet)
        return "";
    const width = sheet.cells.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
    return sheet.cells
        .map((row) => {
        const line = [];
        for (let c = 0; c < width; c += 1)
            line.push(escapeCsv(row?.[c]?.value ?? "", delimiter));
        return line.join(delimiter);
    })
        .join("\n");
}
function escapeCsv(value, delimiter) {
    if (/["\n\r]/.test(value) || value.includes(delimiter))
        return `"${value.replace(/"/g, '""')}"`;
    return value;
}
