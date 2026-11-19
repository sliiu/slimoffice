import type { SheetCell, Workbook, Worksheet } from "@sliiu/sheet-core";

export type FormulaPrimitive = number | string | boolean;
export type FormulaValue = FormulaPrimitive | FormulaError | FormulaPrimitive[];

export class FormulaError {
  constructor(readonly code: string) {}
  toString(): string {
    return this.code;
  }
}

const E = {
  DIV0: () => new FormulaError("#DIV/0!"),
  VALUE: () => new FormulaError("#VALUE!"),
  REF: () => new FormulaError("#REF!"),
  NA: () => new FormulaError("#N/A"),
  NAME: () => new FormulaError("#NAME?"),
  NUM: () => new FormulaError("#NUM!"),
};

export interface EvalContext {
  workbook: Workbook;
  sheetIndex: number;
  row: number;
  col: number;
}

/** Recalculate every formula cell. Display results go into `value`; `formula` stays. */
export function recalculate(workbook: Workbook): void {
  for (let s = 0; s < workbook.sheets.length; s += 1) {
    const sheet = workbook.sheets[s]!;
    for (let r = 0; r < sheet.cells.length; r += 1) {
      const line = sheet.cells[r];
      if (!line) continue;
      for (let c = 0; c < line.length; c += 1) {
        const cell = line[c];
        if (!cell?.formula) continue;
        const result = evaluate(`=${cell.formula}`, { workbook, sheetIndex: s, row: r, col: c });
        cell.value = formatResult(result);
      }
    }
  }
}

export function evaluate(input: string, ctx: EvalContext): FormulaValue {
  const text = input.startsWith("=") ? input.slice(1) : input;
  if (!text.trim()) return "";
  try {
    const tokens = tokenize(text);
    const parser = new Parser(tokens, ctx);
    const value = parser.parseExpression();
    if (parser.notDone()) return E.VALUE();
    return value;
  } catch (err) {
    if (err instanceof FormulaError) return err;
    return E.VALUE();
  }
}

export function formatResult(value: FormulaValue): string {
  if (value instanceof FormulaError) return value.code;
  if (Array.isArray(value)) return value.map((item) => formatResult(item)).join(",");
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return E.NUM().code;
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 1e10) / 1e10);
  }
  return value;
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "id"; value: string }
  | { kind: "ref"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lp" }
  | { kind: "rp" }
  | { kind: "comma" }
  | { kind: "colon" }
  | { kind: "bang" };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\"") {
      let j = i + 1;
      let value = "";
      while (j < text.length) {
        const c = text[j]!;
        if (c === "\"" && text[j + 1] === "\"") {
          value += "\"";
          j += 2;
          continue;
        }
        if (c === "\"") break;
        value += c;
        j += 1;
      }
      out.push({ kind: "str", value });
      i = j + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[0-9.]/.test(text[j]!)) j += 1;
      const raw = text.slice(i, j);
      const num = Number(raw);
      if (!Number.isFinite(num)) throw E.VALUE();
      out.push({ kind: "num", value: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_$一-鿿]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_$一-鿿.]/.test(text[j]!)) j += 1;
      const raw = text.slice(i, j);
      if (/^\$?[A-Za-z]+\$?\d+$/.test(raw)) out.push({ kind: "ref", value: raw.toUpperCase() });
      else out.push({ kind: "id", value: raw.toUpperCase() });
      i = j;
      continue;
    }
    if (ch === "(") {
      out.push({ kind: "lp" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      out.push({ kind: "rp" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      out.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (ch === ":") {
      out.push({ kind: "colon" });
      i += 1;
      continue;
    }
    if (ch === "!") {
      out.push({ kind: "bang" });
      i += 1;
      continue;
    }
    if (ch === "<" || ch === ">" || ch === "=") {
      let op = ch;
      if ((ch === "<" || ch === ">") && text[i + 1] === "=") {
        op += "=";
        i += 1;
      } else if (ch === "<" && text[i + 1] === ">") {
        op = "<>";
        i += 1;
      }
      out.push({ kind: "op", value: op });
      i += 1;
      continue;
    }
    if ("+-*/^&%".includes(ch)) {
      out.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    throw E.VALUE();
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(
    private readonly tokens: Token[],
    private readonly ctx: EvalContext,
  ) {}

  notDone(): boolean {
    return this.i < this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }

  private take(): Token {
    const token = this.tokens[this.i];
    if (!token) throw E.VALUE();
    this.i += 1;
    return token;
  }

  parseExpression(): FormulaValue {
    return this.parseCompare();
  }

  private parseCompare(): FormulaValue {
    let left = this.parseConcat();
    while (this.peek()?.kind === "op" && ["=", "<>", "<", ">", "<=", ">="].includes((this.peek() as { value: string }).value)) {
      const op = (this.take() as { value: string }).value;
      const right = this.parseConcat();
      left = compare(left, right, op);
    }
    return left;
  }

  private parseConcat(): FormulaValue {
    let left = this.parseAdd();
    while (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "&") {
      this.take();
      const right = this.parseAdd();
      if (left instanceof FormulaError) return left;
      if (right instanceof FormulaError) return right;
      left = `${asText(left)}${asText(right)}`;
    }
    return left;
  }

  private parseAdd(): FormulaValue {
    let left = this.parseMul();
    while (this.peek()?.kind === "op" && ["+", "-"].includes((this.peek() as { value: string }).value)) {
      const op = (this.take() as { value: string }).value;
      const right = this.parseMul();
      left = binaryNum(left, right, op === "+" ? (a, b) => a + b : (a, b) => a - b);
    }
    return left;
  }

  private parseMul(): FormulaValue {
    let left = this.parsePow();
    while (this.peek()?.kind === "op" && ["*", "/"].includes((this.peek() as { value: string }).value)) {
      const op = (this.take() as { value: string }).value;
      const right = this.parsePow();
      left = binaryNum(left, right, op === "*" ? (a, b) => a * b : (a, b) => (b === 0 ? E.DIV0() : a / b));
    }
    return left;
  }

  private parsePow(): FormulaValue {
    let left = this.parseUnary();
    while (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "^") {
      this.take();
      const right = this.parseUnary();
      left = binaryNum(left, right, (a, b) => a ** b);
    }
    return left;
  }

  private parseUnary(): FormulaValue {
    if (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "+") {
      this.take();
      return this.parseUnary();
    }
    if (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "-") {
      this.take();
      const value = this.parseUnary();
      return binaryNum(0, value, (a, b) => a - b);
    }
    let value = this.parsePrimary();
    if (this.peek()?.kind === "op" && (this.peek() as { value: string }).value === "%") {
      this.take();
      value = binaryNum(value, 100, (a, b) => a / b);
    }
    return value;
  }

  private parsePrimary(): FormulaValue {
    const token = this.peek();
    if (!token) throw E.VALUE();
    if (token.kind === "num") {
      this.take();
      return token.value;
    }
    if (token.kind === "str") {
      this.take();
      return token.value;
    }
    if (token.kind === "lp") {
      this.take();
      const value = this.parseExpression();
      if (this.peek()?.kind !== "rp") throw E.VALUE();
      this.take();
      return value;
    }
    if (token.kind === "ref" || token.kind === "id") {
      return this.parseRefOrCall();
    }
    throw E.VALUE();
  }

  private parseRefOrCall(): FormulaValue {
    const first = this.take();
    if (first.kind !== "ref" && first.kind !== "id") throw E.VALUE();

    // SheetName!A1 or SheetName!A1:B2
    if (this.peek()?.kind === "bang") {
      this.take();
      const sheetName = first.value;
      const next = this.take();
      if (next.kind !== "ref" && next.kind !== "id") throw E.REF();
      return this.parseRangeTail(sheetName, next.value);
    }

    if (first.kind === "id" && this.peek()?.kind === "lp") {
      this.take();
      const args: FormulaValue[] = [];
      if (this.peek()?.kind !== "rp") {
        args.push(this.parseExpression());
        while (this.peek()?.kind === "comma") {
          this.take();
          args.push(this.parseExpression());
        }
      }
      if (this.peek()?.kind !== "rp") throw E.VALUE();
      this.take();
      return callFunction(first.value, args, this.ctx);
    }

    if (first.kind === "id" && (first.value === "TRUE" || first.value === "FALSE")) {
      return first.value === "TRUE";
    }

    return this.parseRangeTail(undefined, first.value);
  }

  private parseRangeTail(sheetName: string | undefined, startRef: string): FormulaValue {
    let endRef = startRef;
    if (this.peek()?.kind === "colon") {
      this.take();
      const next = this.take();
      if (next.kind !== "ref" && next.kind !== "id") throw E.REF();
      endRef = next.value;
    }
    const start = parseA1(startRef);
    const end = parseA1(endRef);
    if (!start || !end) {
      // bare identifier used as name
      if (!sheetName && startRef === endRef) {
        const named = this.ctx.workbook.names?.find((item) => item.name.toUpperCase() === startRef);
        if (named) return evaluate(named.refersTo.startsWith("=") ? named.refersTo : `=${named.refersTo}`, this.ctx);
      }
      throw E.NAME();
    }
    const sheetIndex = sheetName ? findSheet(this.ctx.workbook, sheetName) : this.ctx.sheetIndex;
    if (sheetIndex < 0) return E.REF();
    const values = readRange(this.ctx.workbook, sheetIndex, start, end);
    if (start.row === end.row && start.col === end.col) return values[0] ?? "";
    return withWidth(values, Math.abs(end.col - start.col) + 1);
  }
}

function parseA1(ref: string): { row: number; col: number } | undefined {
  const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
  if (!match) return undefined;
  let col = 0;
  for (const letter of match[1] ?? "") col = col * 26 + letter.charCodeAt(0) - 64;
  return { row: Number(match[2]) - 1, col: col - 1 };
}

function findSheet(workbook: Workbook, name: string): number {
  const needle = name.replace(/^'|'$/g, "").toUpperCase();
  return workbook.sheets.findIndex((sheet) => sheet.name.toUpperCase() === needle);
}

function readRange(
  workbook: Workbook,
  sheetIndex: number,
  start: { row: number; col: number },
  end: { row: number; col: number },
): FormulaPrimitive[] {
  const sheet = workbook.sheets[sheetIndex];
  if (!sheet) return [];
  const r1 = Math.min(start.row, end.row);
  const r2 = Math.max(start.row, end.row);
  const c1 = Math.min(start.col, end.col);
  const c2 = Math.max(start.col, end.col);
  const out: FormulaPrimitive[] = [];
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      out.push(cellPrimitive(sheet, r, c, workbook, sheetIndex));
    }
  }
  return out;
}

function cellPrimitive(sheet: Worksheet, row: number, col: number, workbook: Workbook, sheetIndex: number): FormulaPrimitive {
  const cell = sheet.cells[row]?.[col];
  if (!cell) return "";
  if (cell.formula) {
    // Use already-computed display when present and looks like a result; otherwise evaluate.
    if (cell.value && !cell.value.startsWith("#") && cell.value !== `=${cell.formula}` && cell.value.toUpperCase() !== cell.formula.toUpperCase()) {
      return coerceCellText(cell.value);
    }
    const nested = evaluate(`=${cell.formula}`, { workbook, sheetIndex, row, col });
    if (nested instanceof FormulaError) return nested.code;
    if (Array.isArray(nested)) return nested[0] ?? "";
    return nested;
  }
  return coerceCellText(cell.value);
}

function coerceCellText(text: string): FormulaPrimitive {
  if (text === "") return "";
  if (text === "TRUE") return true;
  if (text === "FALSE") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return text;
}

function flatten(args: FormulaValue[]): FormulaPrimitive[] {
  const out: FormulaPrimitive[] = [];
  for (const arg of args) {
    if (arg instanceof FormulaError) continue;
    if (Array.isArray(arg)) out.push(...arg);
    else out.push(arg);
  }
  return out;
}

function numbers(args: FormulaValue[]): number[] {
  return flatten(args)
    .map((item) => (typeof item === "number" ? item : typeof item === "boolean" ? Number(item) : Number(item)))
    .filter((item) => Number.isFinite(item));
}

function asNumber(value: FormulaValue): number | FormulaError {
  if (value instanceof FormulaError) return value;
  if (Array.isArray(value)) return asNumber(value[0] ?? "");
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : E.VALUE();
}

function asText(value: FormulaValue): string {
  if (value instanceof FormulaError) return value.code;
  if (Array.isArray(value)) return asText(value[0] ?? "");
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function asBool(value: FormulaValue): boolean | FormulaError {
  if (value instanceof FormulaError) return value;
  if (Array.isArray(value)) return asBool(value[0] ?? false);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (value === "TRUE") return true;
  if (value === "FALSE") return false;
  return E.VALUE();
}

function binaryNum(left: FormulaValue, right: FormulaValue, op: (a: number, b: number) => number | FormulaError): FormulaValue {
  const a = asNumber(left);
  if (a instanceof FormulaError) return a;
  const b = asNumber(right);
  if (b instanceof FormulaError) return b;
  return op(a, b);
}

function compare(left: FormulaValue, right: FormulaValue, op: string): FormulaValue {
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  const l = Array.isArray(left) ? left[0] ?? "" : left;
  const r = Array.isArray(right) ? right[0] ?? "" : right;
  const ln = typeof l === "number" || (typeof l === "string" && /^-?\d+(?:\.\d+)?$/.test(l)) ? Number(l) : null;
  const rn = typeof r === "number" || (typeof r === "string" && /^-?\d+(?:\.\d+)?$/.test(r)) ? Number(r) : null;
  let cmp: number;
  if (ln !== null && rn !== null && Number.isFinite(ln) && Number.isFinite(rn)) cmp = ln - rn;
  else cmp = String(l).localeCompare(String(r));
  if (op === "=") return cmp === 0;
  if (op === "<>") return cmp !== 0;
  if (op === "<") return cmp < 0;
  if (op === ">") return cmp > 0;
  if (op === "<=") return cmp <= 0;
  if (op === ">=") return cmp >= 0;
  return E.VALUE();
}

function callFunction(name: string, args: FormulaValue[], ctx: EvalContext): FormulaValue {
  switch (name) {
    case "SUM":
      return numbers(args).reduce((a, b) => a + b, 0);
    case "AVERAGE": {
      const nums = numbers(args);
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0();
    }
    case "COUNT":
      return numbers(args).length;
    case "COUNTA":
      return flatten(args).filter((item) => item !== "").length;
    case "MIN": {
      const nums = numbers(args);
      return nums.length ? Math.min(...nums) : 0;
    }
    case "MAX": {
      const nums = numbers(args);
      return nums.length ? Math.max(...nums) : 0;
    }
    case "IF": {
      const cond = asBool(args[0] ?? false);
      if (cond instanceof FormulaError) return cond;
      return cond ? (args[1] ?? true) : (args[2] ?? false);
    }
    case "AND": {
      for (const arg of flatten(args)) {
        const b = asBool(arg);
        if (b instanceof FormulaError) return b;
        if (!b) return false;
      }
      return true;
    }
    case "OR": {
      for (const arg of flatten(args)) {
        const b = asBool(arg);
        if (b instanceof FormulaError) return b;
        if (b) return true;
      }
      return false;
    }
    case "NOT": {
      const b = asBool(args[0] ?? false);
      return b instanceof FormulaError ? b : !b;
    }
    case "ABS":
    case "SQRT":
    case "INT": {
      const n = asNumber(args[0] ?? 0);
      if (n instanceof FormulaError) return n;
      if (name === "ABS") return Math.abs(n);
      if (name === "SQRT") return n < 0 ? E.NUM() : Math.sqrt(n);
      return Math.trunc(n);
    }
    case "ROUND": {
      const n = asNumber(args[0] ?? 0);
      const d = asNumber(args[1] ?? 0);
      if (n instanceof FormulaError) return n;
      if (d instanceof FormulaError) return d;
      const f = 10 ** d;
      return Math.round(n * f) / f;
    }
    case "MOD": {
      const n = asNumber(args[0] ?? 0);
      const d = asNumber(args[1] ?? 0);
      if (n instanceof FormulaError) return n;
      if (d instanceof FormulaError) return d;
      if (d === 0) return E.DIV0();
      return n - d * Math.floor(n / d);
    }
    case "POWER":
      return binaryNum(args[0] ?? 0, args[1] ?? 0, (a, b) => a ** b);
    case "LEN":
      return asText(args[0] ?? "").length;
    case "LEFT":
    case "RIGHT": {
      const text = asText(args[0] ?? "");
      const n = asNumber(args[1] ?? 1);
      if (n instanceof FormulaError) return n;
      return name === "LEFT" ? text.slice(0, Math.max(0, n)) : text.slice(Math.max(0, text.length - n));
    }
    case "MID": {
      const text = asText(args[0] ?? "");
      const start = asNumber(args[1] ?? 1);
      const len = asNumber(args[2] ?? 0);
      if (start instanceof FormulaError) return start;
      if (len instanceof FormulaError) return len;
      return text.slice(Math.max(0, start - 1), Math.max(0, start - 1) + Math.max(0, len));
    }
    case "TRIM":
      return asText(args[0] ?? "").trim().replace(/\s+/g, " ");
    case "UPPER":
      return asText(args[0] ?? "").toUpperCase();
    case "LOWER":
      return asText(args[0] ?? "").toLowerCase();
    case "CONCAT":
    case "CONCATENATE":
      return flatten(args).map((item) => asText(item)).join("");
    case "VALUE": {
      const n = Number(asText(args[0] ?? ""));
      return Number.isFinite(n) ? n : E.VALUE();
    }
    case "TRUE":
      return true;
    case "FALSE":
      return false;
    case "NA":
      return E.NA();
    case "ISBLANK": {
      const v = args[0];
      return v === "" || v === undefined || (Array.isArray(v) && v.length === 0);
    }
    case "ISNUMBER": {
      const v = Array.isArray(args[0]) ? args[0][0] : args[0];
      return typeof v === "number";
    }
    case "ISTEXT": {
      const v = Array.isArray(args[0]) ? args[0][0] : args[0];
      return typeof v === "string";
    }
    case "IFERROR": {
      const primary = args[0];
      if (primary instanceof FormulaError) return args[1] ?? "";
      return primary ?? "";
    }
    case "ROW":
      return (args[0] === undefined ? ctx.row : parseA1(asText(args[0]))?.row ?? ctx.row) + 1;
    case "COLUMN":
      return (args[0] === undefined ? ctx.col : parseA1(asText(args[0]))?.col ?? ctx.col) + 1;
    case "ROWS":
      return Array.isArray(args[0]) ? Math.max(1, Math.sqrt(args[0].length) | 0) || args[0].length : 1;
    case "COLUMNS":
      return Array.isArray(args[0]) ? args[0].length : 1;
    case "TODAY": {
      const d = new Date();
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569;
    }
    case "NOW":
      return Date.now() / 86400000 + 25569;
    case "YEAR":
    case "MONTH":
    case "DAY": {
      const serial = asNumber(args[0] ?? 0);
      if (serial instanceof FormulaError) return serial;
      const date = new Date(Math.round((serial - 25569) * 86400000));
      if (name === "YEAR") return date.getUTCFullYear();
      if (name === "MONTH") return date.getUTCMonth() + 1;
      return date.getUTCDate();
    }
    case "DATE": {
      const y = asNumber(args[0] ?? 1900);
      const m = asNumber(args[1] ?? 1);
      const d = asNumber(args[2] ?? 1);
      if (y instanceof FormulaError) return y;
      if (m instanceof FormulaError) return m;
      if (d instanceof FormulaError) return d;
      return Date.UTC(y, m - 1, d) / 86400000 + 25569;
    }
    case "VLOOKUP": {
      const needle = Array.isArray(args[0]) ? args[0][0] : args[0];
      const table = args[1];
      const col = asNumber(args[2] ?? 1);
      if (!(table instanceof Array) || col instanceof FormulaError) return E.VALUE();
      const cols = rangeWidth(table);
      const index = Math.max(1, Math.floor(col));
      if (index > cols) return E.REF();
      for (let offset = 0; offset < table.length; offset += cols) {
        const cell = table[offset];
        if (cell === needle || String(cell) === String(needle)) return table[offset + index - 1] ?? E.NA();
      }
      return E.NA();
    }
    case "XLOOKUP": {
      const needle = Array.isArray(args[0]) ? args[0][0] : args[0];
      const lookup = args[1];
      const result = args[2];
      if (!(lookup instanceof Array) || !(result instanceof Array)) return E.NA();
      const idx = lookup.findIndex((item) => item === needle || String(item) === String(needle));
      if (idx < 0) return args[3] !== undefined ? (Array.isArray(args[3]) ? args[3][0] ?? "" : args[3]) : E.NA();
      return result[idx] ?? E.NA();
    }
    case "INDEX": {
      const table = args[0];
      const row = asNumber(args[1] ?? 1);
      const col = asNumber(args[2] ?? 1);
      if (!(table instanceof Array)) return table ?? E.REF();
      if (row instanceof FormulaError) return row;
      if (col instanceof FormulaError) return col;
      if (args[2] === undefined) return table[Math.max(0, Math.floor(row) - 1)] ?? E.REF();
      const width = rangeWidth(table);
      return table[(Math.max(0, Math.floor(row) - 1)) * width + (Math.max(0, Math.floor(col) - 1))] ?? E.REF();
    }
    case "MATCH": {
      const needle = Array.isArray(args[0]) ? args[0][0] : args[0];
      const table = args[1];
      if (!(table instanceof Array)) return E.NA();
      const idx = table.findIndex((item) => item === needle || String(item) === String(needle));
      return idx < 0 ? E.NA() : idx + 1;
    }
    case "TEXT": {
      const value = asNumber(args[0] ?? 0);
      const pattern = asText(args[1] ?? "0");
      if (value instanceof FormulaError) return value;
      if (/0\.00%|0%/.test(pattern)) return `${(value * 100).toFixed(pattern.includes(".") ? 2 : 0)}%`;
      if (/#,##0/.test(pattern)) {
        const digits = /\.0+/.exec(pattern)?.[0]?.length ? /\.0+/.exec(pattern)![0]!.length - 1 : 0;
        return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
      }
      if (/0\.0+/.test(pattern)) {
        const digits = /\.0+/.exec(pattern)?.[0]?.length ? /\.0+/.exec(pattern)![0]!.length - 1 : 2;
        return value.toFixed(digits);
      }
      return String(value);
    }
    case "SEQUENCE": {
      const rows = asNumber(args[0] ?? 1);
      const cols = asNumber(args[1] ?? 1);
      const start = asNumber(args[2] ?? 1);
      const step = asNumber(args[3] ?? 1);
      if (rows instanceof FormulaError) return rows;
      if (cols instanceof FormulaError) return cols;
      if (start instanceof FormulaError) return start;
      if (step instanceof FormulaError) return step;
      const out: FormulaPrimitive[] = [];
      let value = start;
      for (let r = 0; r < Math.max(1, Math.floor(rows)); r += 1) {
        for (let c = 0; c < Math.max(1, Math.floor(cols)); c += 1) {
          out.push(value);
          value += step;
        }
      }
      return withWidth(out, Math.max(1, Math.floor(cols)));
    }
    case "UNIQUE": {
      const table = args[0];
      if (!(table instanceof Array)) return table ?? E.VALUE();
      const seen = new Set<string>();
      const out: FormulaPrimitive[] = [];
      for (const item of table) {
        const key = String(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
      return withWidth(out, rangeWidth(table));
    }
    case "SORT": {
      const table = args[0];
      if (!(table instanceof Array)) return table ?? E.VALUE();
      return withWidth([...table].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })), rangeWidth(table));
    }
    case "FILTER": {
      const table = args[0];
      const include = args[1];
      if (!(table instanceof Array) || !(include instanceof Array)) return E.VALUE();
      const width = rangeWidth(table);
      const out: FormulaPrimitive[] = [];
      for (let offset = 0, row = 0; offset < table.length; offset += width, row += 1) {
        if (!asBool(include[row] ?? false)) continue;
        out.push(...table.slice(offset, offset + width));
      }
      return out.length ? withWidth(out, width) : E.VALUE();
    }
    default:
      return E.NAME();
  }
}

function withWidth(values: FormulaPrimitive[], width: number): FormulaPrimitive[] {
  Object.defineProperty(values, "width", { value: Math.max(1, width), enumerable: false });
  return values;
}

function rangeWidth(table: FormulaPrimitive[]): number {
  const width = (table as { width?: number }).width;
  return typeof width === "number" && width > 0 ? width : 1;
}

export function setFormula(cell: SheetCell, formula: string): void {
  const body = formula.startsWith("=") ? formula.slice(1) : formula;
  cell.formula = body;
}
