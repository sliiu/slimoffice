import type { ConsolidateFunc, SheetCell, SheetConsolidation, Workbook, Worksheet } from "@sliiu/sheet-core";
import { formatNumber } from "./format";

export type FormulaPrimitive = number | string | boolean;

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
  | { kind: "bang" }
  | { kind: "lb" }
  | { kind: "rb" }
  | { kind: "semi" };

/** A LAMBDA waiting for its arguments. It only becomes a value once it is called. */
export interface Lambda {
  params: string[];
  body: Token[];
}

/** A name with no definition yet. LET and LAMBDA fill these in before the result is used. */
interface PendingName {
  name: string;
}

export type FormulaValue = FormulaPrimitive | FormulaError | FormulaPrimitive[] | Lambda | PendingName;

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
    if (isPending(value)) return E.NAME();
    return Array.isArray(value) && value.length === 1 ? value[0] ?? "" : value;
  } catch (err) {
    if (err instanceof FormulaError) return err;
    return E.VALUE();
  }
}

export interface ConsolidateSpec {
  func?: ConsolidateFunc;
  sources: string[];
  dest: string;
  topRow?: boolean;
  leftCol?: boolean;
  links?: boolean;
}

/** Combine the source ranges into the destination sheet. Stores the definition so it reads back. */
export function consolidateRanges(workbook: Workbook, spec: ConsolidateSpec): SheetConsolidation {
  const dest = parseSource(spec.dest);
  const sheet = dest ? workbook.sheets[findSheet(workbook, dest.sheet)] : undefined;
  const func = spec.func ?? "sum";
  const consolidation: SheetConsolidation = {
    func,
    sources: spec.sources,
    dest: spec.dest,
    ...(spec.topRow ? { topRow: true } : {}),
    ...(spec.leftCol ? { leftCol: true } : {}),
    ...(spec.links ? { links: true } : {}),
  };
  if (!dest || !sheet) return consolidation;
  const grids = spec.sources.map((source) => readSource(workbook, source));
  const top = spec.topRow ? 1 : 0;
  const left = spec.leftCol ? 1 : 0;
  const rows = grids.reduce((widest, grid) => Math.max(widest, grid.rows - top), 0);
  const cols = grids.reduce((widest, grid) => Math.max(widest, grid.cols - left), 0);
  const labels = spec.topRow || spec.leftCol ? labelKeys(grids, top, left) : undefined;
  const rowLabels = labels?.rowLabels ?? [];
  const colLabels = labels?.colLabels ?? [];
  const keys = labels?.keys ?? [...Array(rows)].map((_, row) => [...Array(cols)].map((__, col) => grids.map(() => ({ row, col }))));
  const rowOffset = colLabels.length ? 1 : 0;
  const colOffset = rowLabels.length ? 1 : 0;
  rowLabels.forEach((label, row) => {
    const cell = ensureCell(sheet, dest.row + rowOffset + row, dest.col);
    delete cell.formula;
    cell.value = label;
  });
  colLabels.forEach((label, col) => {
    const cell = ensureCell(sheet, dest.row, dest.col + colOffset + col);
    delete cell.formula;
    cell.value = label;
  });
  keys.forEach((line, row) => {
    line.forEach((spots, col) => {
      const picks = spots.flatMap((key, source) => valueAt(grids[source]!, key.row + top, key.col + left));
      const cell = ensureCell(sheet, dest.row + rowOffset + row, dest.col + colOffset + col);
      const result = reduceNumbers(picks, func);
      if (spec.links && picks.length) {
        cell.formula = linkFormula(grids, spots, top, left, func);
        cell.value = typeof result === "number" ? formatResult(result) : "";
      } else {
        delete cell.formula;
        cell.value = typeof result === "number" ? formatResult(result) : "";
      }
    });
  });
  consolidation.rows = rowOffset + keys.length;
  consolidation.cols = colOffset + (keys[0]?.length ?? 0);
  sheet.consolidation = consolidation;
  return consolidation;
}

interface SourceGrid {
  sheet: string;
  row: number;
  col: number;
  rows: number;
  cols: number;
  values: (number | undefined)[][];
  text: string[][];
}

function readSource(workbook: Workbook, source: string): SourceGrid {
  const parsed = parseSource(source);
  const empty: SourceGrid = { sheet: "", row: 0, col: 0, rows: 0, cols: 0, values: [], text: [] };
  if (!parsed) return empty;
  const sheet = workbook.sheets[findSheet(workbook, parsed.sheet)];
  if (!sheet) return { ...empty, sheet: parsed.sheet };
  const values: (number | undefined)[][] = [];
  const text: string[][] = [];
  for (let row = 0; row < parsed.rows; row += 1) {
    const line: (number | undefined)[] = [];
    const labels: string[] = [];
    for (let col = 0; col < parsed.cols; col += 1) {
      const raw = sheet.cells[parsed.row + row]?.[parsed.col + col]?.value ?? "";
      line.push(/^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : undefined);
      labels.push(raw);
    }
    values.push(line);
    text.push(labels);
  }
  return { sheet: sheet.name, row: parsed.row, col: parsed.col, rows: parsed.rows, cols: parsed.cols, values, text };
}

function parseSource(source: string): { sheet: string; row: number; col: number; rows: number; cols: number } | undefined {
  const match = /^([^!]+)!(.+)$/.exec(source.trim());
  if (!match) return undefined;
  const sheet = (match[1] ?? "").replace(/^'|'$/g, "").replace(/''/g, "'").toUpperCase();
  const parts = (match[2] ?? "").split(":");
  const start = parseA1(parts[0] ?? "");
  const end = parseA1(parts[1] ?? parts[0] ?? "");
  if (!start || !end) return undefined;
  const row = Math.min(start.row, end.row);
  const col = Math.min(start.col, end.col);
  return { sheet, row, col, rows: Math.abs(end.row - start.row) + 1, cols: Math.abs(end.col - start.col) + 1 };
}

function labelKeys(
  grids: SourceGrid[],
  top: number,
  left: number,
): { rowLabels: string[]; colLabels: string[]; keys: { row: number; col: number }[][][] } {
  const rowLabels: string[] = [];
  const colLabels: string[] = [];
  for (const grid of grids) {
    for (let row = top; row < grid.rows; row += 1) {
      const label = left ? grid.text[row]?.[0] ?? "" : String(row - top + 1);
      if (label && !rowLabels.includes(label)) rowLabels.push(label);
    }
    for (let col = left; col < grid.cols; col += 1) {
      const label = top ? grid.text[0]?.[col] ?? "" : String(col - left + 1);
      if (label && !colLabels.includes(label)) colLabels.push(label);
    }
  }
  const keys = rowLabels.map((rowLabel) =>
    colLabels.map((colLabel) =>
      grids.map((grid) => {
        const rowAt = left ? grid.text.findIndex((line, index) => index >= top && line[0] === rowLabel) : top + rowLabels.indexOf(rowLabel);
        const colAt = top ? (grid.text[0] ?? []).findIndex((label, index) => index >= left && label === colLabel) : left + colLabels.indexOf(colLabel);
        return { row: rowAt - top, col: colAt - left };
      }),
    ),
  );
  return { rowLabels: left ? rowLabels : [], colLabels: top ? colLabels : [], keys };
}

function valueAt(grid: SourceGrid, row: number, col: number): number[] {
  const value = grid.values[row]?.[col];
  return value == null ? [] : [value];
}

function reduceNumbers(values: number[], func: ConsolidateFunc): number | undefined {
  if (!values.length && func !== "count" && func !== "countNums") return undefined;
  const total = values.reduce((sum, value) => sum + value, 0);
  const count = func === "count" || func === "countNums" ? values.length : values.length;
  if (func === "count" || func === "countNums") return count;
  if (func === "average") return count ? total / count : undefined;
  if (func === "max") return Math.max(...values);
  if (func === "min") return Math.min(...values);
  if (func === "product") return values.reduce((product, value) => product * value, 1);
  if (func === "stdev" || func === "stdevp") {
    const divisor = func === "stdev" ? count - 1 : count;
    if (divisor <= 0) return undefined;
    const mean = total / count;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / divisor);
  }
  if (func === "var" || func === "varp") {
    const divisor = func === "var" ? count - 1 : count;
    if (divisor <= 0) return undefined;
    const mean = total / count;
    return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / divisor;
  }
  return total;
}

function linkFormula(grids: SourceGrid[], spots: { row: number; col: number }[], top: number, left: number, func: ConsolidateFunc): string {
  const refs = grids.flatMap((grid, index) => {
    const spot = spots[index];
    if (!spot) return [];
    const row = spot.row + top;
    const col = spot.col + left;
    if (grid.values[row]?.[col] == null) return [];
    return [`'${grid.sheet.replace(/'/g, "''")}'!${columnLetters(grid.col + col)}${grid.row + row + 1}`];
  });
  const name = func === "countNums" ? "COUNT" : func === "stdev" ? "STDEV" : func === "var" ? "VAR" : func.toUpperCase();
  return refs.length === 1 && func === "sum" ? refs[0]! : `${name}(${refs.join(",")})`;
}

function columnLetters(index: number): string {
  let name = "";
  let next = index + 1;
  while (next > 0) {
    next -= 1;
    name = String.fromCharCode(65 + (next % 26)) + name;
    next = Math.floor(next / 26);
  }
  return name;
}

function ensureCell(sheet: Worksheet, row: number, col: number): SheetCell {
  const line = sheet.cells[row] ?? [];
  sheet.cells[row] = line;
  const cell = line[col] ?? { value: "" };
  line[col] = cell;
  return cell;
}

export function formatResult(value: FormulaValue): string {
  if (isPending(value)) return E.NAME().code;
  if (isLambda(value)) return E.VALUE().code;
  if (Array.isArray(value) && value.length === 1) return formatResult(value[0] ?? "");
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

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < text.length) {
        const c = text[j]!;
        if (c === "'" && text[j + 1] === "'") {
          value += "'";
          j += 2;
          continue;
        }
        if (c === "'") break;
        value += c;
        j += 1;
      }
      if (text[j] !== "'") throw E.VALUE();
      out.push({ kind: "id", value: value.toUpperCase() });
      i = j + 1;
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
      const upper = raw.toUpperCase();
      // A cell reference is one to three column letters and a row number. Anything longer is a name.
      if (/^\$?[A-Z]{1,3}\$?\d+$/.test(upper)) out.push({ kind: "ref", value: upper });
      else out.push({ kind: "id", value: upper });
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
    if (ch === "{") {
      out.push({ kind: "lb" });
      i += 1;
      continue;
    }
    if (ch === "}") {
      out.push({ kind: "rb" });
      i += 1;
      continue;
    }
    if (ch === ";") {
      out.push({ kind: "semi" });
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
    if (token.kind === "lb") return this.parseArray();
    if (token.kind === "id" && this.tokens[this.i + 1]?.kind === "lp") return this.parseLambda();
    if (token.kind === "ref" || token.kind === "id") {
      return this.parseRefOrCall();
    }
    throw E.VALUE();
  }

  /** `{1,2;3,4}` is a constant array: commas run across a row, semicolons start the next. */
  private parseArray(): FormulaValue {
    this.take();
    const rows: FormulaPrimitive[][] = [];
    let row: FormulaPrimitive[] = [];
    const push = (value: FormulaValue) => {
      if (value instanceof FormulaError) throw value;
      row.push(scalarPrimitive(value));
    };
    if (this.peek()?.kind !== "rb") {
      push(this.parseExpression());
      while (this.peek()?.kind === "comma" || this.peek()?.kind === "semi") {
        const break_ = this.take().kind === "semi";
        if (break_) {
          rows.push(row);
          row = [];
        }
        push(this.parseExpression());
      }
    }
    rows.push(row);
    if (this.peek()?.kind !== "rb") throw E.VALUE();
    this.take();
    const width = rows.reduce((widest, line) => Math.max(widest, line.length), 1);
    const out: FormulaPrimitive[] = [];
    for (const line of rows) {
      for (let i = 0; i < width; i += 1) out.push(line[i] ?? "");
    }
    return withWidth(out, width);
  }

  /**
   * `LAMBDA(name, ..., body)(arg, ...)` defines its names for the body only.
   * A call without the trailing arguments returns the definition, which LET and MAKEARRAY apply.
   */
  private parseLambda(): FormulaValue {
    const name = (this.take() as { value: string }).value;
    if (name !== "LAMBDA" && name !== "LET") return this.parseCall(name);
    this.take();
    if (name === "LET") return this.parseLet();
    const params: string[] = [];
    while (this.peek()?.kind === "id" && this.tokens[this.i + 1]?.kind === "comma") {
      params.push((this.take() as { value: string }).value);
      this.take();
    }
    const bodyStart = this.i;
    let depth = 1;
    while (this.i < this.tokens.length && depth > 0) {
      const kind = this.tokens[this.i]?.kind;
      if (kind === "lp") depth += 1;
      else if (kind === "rp") depth -= 1;
      if (depth > 0) this.i += 1;
    }
    if (this.peek()?.kind !== "rp") throw E.VALUE();
    const body = this.tokens.slice(bodyStart, this.i);
    this.take();
    const lambda: Lambda = { params, body };
    if (this.peek()?.kind !== "lp") return lambda;
    this.take();
    const args = this.parseArgList();
    if (this.peek()?.kind !== "rp") throw E.VALUE();
    this.take();
    return applyLambda(lambda, args, this.ctx);
  }

  /**
   * LET pairs each name with the following value, then evaluates the final expression under those names.
   * The pairs are collected as tokens first, because a value can itself contain a name defined earlier.
   */
  private parseLet(): FormulaValue {
    const pairs: { name: string; tokens: Token[] }[] = [];
    while (this.peek()?.kind === "id" && this.tokens[this.i + 1]?.kind === "comma") {
      const id = (this.take() as { value: string }).value;
      this.take();
      const start = this.i;
      this.parseExpression();
      pairs.push({ name: id, tokens: this.tokens.slice(start, this.i) });
      if (this.peek()?.kind !== "comma") throw E.VALUE();
      this.take();
    }
    if (!pairs.length) throw E.VALUE();
    const start = this.i;
    this.parseExpression();
    const body = this.tokens.slice(start, this.i);
    if (this.peek()?.kind !== "rp") throw E.VALUE();
    this.take();
    const names = new Map<string, FormulaValue>();
    for (const pair of pairs) {
      names.set(pair.name, new Parser(rewrite(pair.tokens, names), this.ctx).parseExpression());
    }
    return new Parser(rewrite(body, names), this.ctx).parseExpression();
  }

  private parseCall(name: string): FormulaValue {
    this.take();
    const args = this.parseArgList();
    if (this.peek()?.kind !== "rp") throw E.VALUE();
    this.take();
    return callFunction(name, args, this.ctx);
  }

  private parseArgList(): FormulaValue[] {
    const args: FormulaValue[] = [];
    if (this.peek()?.kind !== "rp") {
      args.push(this.parseExpression());
      while (this.peek()?.kind === "comma") {
        this.take();
        args.push(this.parseExpression());
      }
    }
    return args;
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

    if (first.kind === "id" && this.peek()?.kind === "lp") return this.parseCall(first.value);

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
        return { name: startRef };
      }
      throw E.NAME();
    }
    const sheetIndex = sheetName ? findSheet(this.ctx.workbook, sheetName) : this.ctx.sheetIndex;
    if (sheetIndex < 0) return E.REF();
    const values = readRange(this.ctx.workbook, sheetIndex, start, end);
    if (start.row === end.row && start.col === end.col) return values;
    return values;
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

/** The position a value came from, when it is a range. Lets OFFSET and INDIRECT move it. */
interface RangeOrigin {
  sheetIndex: number;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
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
  const hidden: boolean[] = [];
  const subtotals: boolean[] = [];
  const hiddenRows = new Set(sheet.hiddenRows ?? []);
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      out.push(cellPrimitive(sheet, r, c, workbook, sheetIndex));
      hidden.push(hiddenRows.has(r));
      subtotals.push(/^SUBTOTAL\s*\(/i.test(sheet.cells[r]?.[c]?.formula ?? ""));
    }
  }
  return tagRange(out, c2 - c1 + 1, hidden, subtotals, { sheetIndex, r1, c1, r2, c2 });
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
    if (isLambda(nested) || isPending(nested)) return "";
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

/** A one-cell range carries its position, but everywhere else it behaves as its single value. */
function collapse(value: FormulaValue): FormulaValue {
  return Array.isArray(value) && value.length === 1 ? value[0] ?? "" : value;
}

function flatten(args: FormulaValue[]): FormulaPrimitive[] {
  const out: FormulaPrimitive[] = [];
  for (const arg of args) {
    const value = collapse(arg);
    if (isLambda(value) || isPending(value) || value instanceof FormulaError) continue;
    if (Array.isArray(value)) out.push(...value);
    else out.push(value);
  }
  return out;
}

function isPending(value: FormulaValue | undefined): value is PendingName {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof FormulaError) && "name" in value && !("params" in value);
}

function isLambda(value: FormulaValue | undefined): value is Lambda {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof FormulaError) && "params" in value && "body" in value;
}

/** An array constant only holds scalars, so a nested range contributes its first value. */
function scalarPrimitive(value: FormulaValue): FormulaPrimitive {
  if (Array.isArray(value)) return scalarPrimitive(value[0] ?? "");
  if (value instanceof FormulaError || isLambda(value) || isPending(value)) return "";
  return value;
}

/** Runs a LAMBDA body with each parameter bound to the matching argument. */
function applyLambda(lambda: Lambda, args: FormulaValue[], ctx: EvalContext): FormulaValue {
  if (args.length !== lambda.params.length) return E.VALUE();
  const bound = new Map<string, FormulaValue>(lambda.params.map((param, index) => [param, args[index] ?? ""]));
  return new Parser(rewrite(lambda.body, bound), ctx).parseExpression();
}

/** Replaces each bound name in the tokens, including names nested inside a LAMBDA body. */
function rewrite(tokens: Token[], names: Map<string, FormulaValue>): Token[] {
  return tokens.flatMap((token) => (token.kind === "id" && names.has(token.value) ? valueTokens(names.get(token.value)!) : [token]));
}

/** Turns a computed value back into the tokens a LAMBDA body can carry. A range becomes an array constant. */
function valueTokens(value: FormulaValue): Token[] {
  if (typeof value === "number") return [{ kind: "num", value }];
  if (typeof value === "boolean") return [{ kind: "id", value: value ? "TRUE" : "FALSE" }];
  if (typeof value === "string") return [{ kind: "str", value }];
  if (value instanceof FormulaError) return [{ kind: "str", value: value.code }];
  if (isLambda(value) || isPending(value)) return [];
  const width = rangeWidth(value);
  const rows = Math.max(1, Math.ceil(value.length / width));
  const tokens: Token[] = [{ kind: "lb" }];
  for (let row = 0; row < rows; row += 1) {
    if (row > 0) tokens.push({ kind: "semi" });
    for (let col = 0; col < width; col += 1) {
      if (col > 0) tokens.push({ kind: "comma" });
      const cell = value[row * width + col];
      tokens.push(typeof cell === "number" ? { kind: "num", value: cell } : { kind: "str", value: cell === undefined ? "" : String(cell) });
    }
  }
  tokens.push({ kind: "rb" });
  return tokens;
}

function numbers(args: FormulaValue[]): number[] {
  return flatten(args)
    .map((item) => (typeof item === "number" ? item : typeof item === "boolean" ? Number(item) : Number(item)))
    .filter((item) => Number.isFinite(item));
}

function asNumber(value: FormulaValue): number | FormulaError {
  if (isPending(value)) return E.NAME();
  if (isLambda(value)) return E.VALUE();
  if (Array.isArray(value) && value.length === 1) return asNumber(value[0] ?? "");
  if (value instanceof FormulaError) return value;
  if (Array.isArray(value)) return asNumber(value[0] ?? "");
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : E.VALUE();
}

function asText(value: FormulaValue): string {
  if (isLambda(value)) return "";
  if (Array.isArray(value) && value.length === 1) return asText(value[0] ?? "");
  if (value instanceof FormulaError) return value.code;
  if (Array.isArray(value)) return asText(value[0] ?? "");
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function asBool(value: FormulaValue): boolean | FormulaError {
  if (isPending(value)) return E.NAME();
  if (isLambda(value)) return E.VALUE();
  if (Array.isArray(value) && value.length === 1) return asBool(value[0] ?? false);
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
  if (isPending(left) || isPending(right)) return E.NAME();
  if (isLambda(left) || isLambda(right)) return E.VALUE();
  if (left instanceof FormulaError) return left;
  if (right instanceof FormulaError) return right;
  const flat = (value: FormulaValue) => (Array.isArray(value) && value.length === 1 ? value[0] ?? "" : value);
  const l = flat(left);
  const r = flat(right);
  if (Array.isArray(l) || Array.isArray(r)) return E.VALUE();
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
    case "AVERAGE":
      return average(args);
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
    case "XOR": {
      let trues = 0;
      let seen = false;
      for (const arg of flatten(args)) {
        if (arg === "") continue;
        const flag = asBool(arg);
        if (flag instanceof FormulaError) return flag;
        seen = true;
        if (flag) trues += 1;
      }
      return seen ? trues % 2 === 1 : E.VALUE();
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
    case "TRUNC": {
      const n = asNumber(args[0] ?? 0);
      const d = asNumber(args[1] ?? 0);
      if (n instanceof FormulaError) return n;
      if (d instanceof FormulaError) return d;
      const factor = 10 ** Math.trunc(d);
      return Math.trunc(n * factor) / factor;
    }
    case "MROUND": {
      const n = asNumber(args[0] ?? 0);
      const multiple = asNumber(args[1] ?? 0);
      if (n instanceof FormulaError) return n;
      if (multiple instanceof FormulaError) return multiple;
      if (n === 0 || multiple === 0) return 0;
      if (n > 0 !== multiple > 0) return E.NUM();
      return Math.round(n / multiple) * multiple;
    }
    case "QUOTIENT": {
      const n = asNumber(args[0] ?? 0);
      const d = asNumber(args[1] ?? 0);
      if (n instanceof FormulaError) return n;
      if (d instanceof FormulaError) return d;
      if (d === 0) return E.DIV0();
      return Math.trunc(n / d);
    }
    case "GCD":
    case "LCM":
      return gcdLcm(name, args);
    case "SUMSQ":
      return numbers(args).reduce((sum, item) => sum + item * item, 0);
    case "EVEN":
    case "ODD": {
      const n = asNumber(args[0] ?? 0);
      if (n instanceof FormulaError) return n;
      return evenOdd(n, name === "ODD");
    }
    case "RAND":
      return Math.random();
    case "RANDBETWEEN": {
      const low = asNumber(args[0] ?? 0);
      const high = asNumber(args[1] ?? 0);
      if (low instanceof FormulaError) return low;
      if (high instanceof FormulaError) return high;
      const first = Math.ceil(Math.min(low, high));
      const last = Math.floor(Math.max(low, high));
      if (first > last) return E.NUM();
      return first + Math.floor(Math.random() * (last - first + 1));
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
    case "ISERROR":
      return args[0] instanceof FormulaError;
    case "ISERR":
      return args[0] instanceof FormulaError && args[0].code !== "#N/A";
    case "ISNA":
      return args[0] instanceof FormulaError && args[0].code === "#N/A";
    case "ISEVEN":
    case "ISODD": {
      const n = asNumber(args[0] ?? 0);
      if (n instanceof FormulaError) return n;
      return Math.trunc(Math.abs(n)) % 2 === (name === "ISEVEN" ? 0 : 1);
    }
    case "N": {
      const v = collapse(args[0] ?? 0);
      if (v instanceof FormulaError) return v;
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      return 0;
    }
    case "T": {
      const v = collapse(args[0] ?? "");
      if (v instanceof FormulaError) return v;
      return typeof v === "string" ? v : "";
    }
    case "TYPE": {
      const v = collapse(args[0] ?? "");
      if (Array.isArray(v)) return 64;
      if (typeof v === "number") return 1;
      if (typeof v === "string") return 2;
      if (typeof v === "boolean") return 4;
      return 16;
    }
    case "IFERROR": {
      const primary = args[0];
      if (primary instanceof FormulaError) return args[1] ?? "";
      return primary ?? "";
    }
    case "ROW":
      return rowOf(args[0], ctx) + 1;
    case "COLUMN":
      return columnOf(args[0], ctx) + 1;
    case "ROWS":
      return rowsOf(args[0]);
    case "COLUMNS":
      return columnsOf(args[0]);
    case "ADDRESS": {
      const row = asNumber(args[0] ?? 1);
      const col = asNumber(args[1] ?? 1);
      if (row instanceof FormulaError) return row;
      if (col instanceof FormulaError) return col;
      if (row < 1 || col < 1) return E.VALUE();
      const abs = asNumber(args[2] ?? 1);
      if (abs instanceof FormulaError) return abs;
      const lockRow = abs === 1 || abs === 2;
      const lockCol = abs === 1 || abs === 3;
      const sheet = args[4] === undefined ? "" : `'${asText(args[4]).replace(/'/g, "''")}'!`;
      return `${sheet}${lockCol ? "$" : ""}${columnName(Math.floor(col) - 1)}${lockRow ? "$" : ""}${Math.floor(row)}`;
    }
    case "CHOOSE": {
      const index = asNumber(args[0] ?? 0);
      if (index instanceof FormulaError) return index;
      const pick = args[Math.floor(index)];
      return pick === undefined ? E.VALUE() : pick;
    }
    case "TRANSPOSE": {
      const table = args[0];
      if (!(table instanceof Array)) return table ?? E.VALUE();
      const width = rangeWidth(table);
      const height = Math.ceil(table.length / width);
      const out: FormulaPrimitive[] = [];
      for (let c = 0; c < width; c += 1) {
        for (let r = 0; r < height; r += 1) out.push(table[r * width + c] ?? "");
      }
      return withWidth(out, height);
    }
    case "OFFSET":
      return offsetRange(ctx, args);
    case "INDIRECT":
      return indirectRange(ctx, args);
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
      const needle = scalar(args[0]);
      const table = args[1];
      const col = asNumber(args[2] ?? 1);
      const approximate = args[3] === undefined ? true : asBool(args[3]);
      if (needle instanceof FormulaError) return needle;
      if (!(table instanceof Array) || col instanceof FormulaError) return E.VALUE();
      if (approximate instanceof FormulaError) return approximate;
      const cols = rangeWidth(table);
      const index = Math.max(1, Math.floor(col));
      if (index > cols) return E.REF();
      const column: FormulaPrimitive[] = [];
      for (let offset = 0; offset < table.length; offset += cols) column.push(table[offset] ?? "");
      const at = approximate ? approxIndex(column, needle, -1) : column.findIndex((cell) => lookupEqual(cell, needle));
      return at < 0 ? E.NA() : table[at * cols + index - 1] ?? E.NA();
    }
    case "XLOOKUP": {
      const needle = scalar(args[0]);
      const lookup = args[1];
      const result = args[2];
      const mode = asNumber(args[4] ?? 0);
      if (needle instanceof FormulaError) return needle;
      if (!(lookup instanceof Array) || !(result instanceof Array)) return E.NA();
      if (mode instanceof FormulaError) return mode;
      const at = mode < 0 || mode === 1 ? approxIndex(lookup, needle, mode < 0 ? -1 : 1) : lookup.findIndex((item) => lookupEqual(item, needle));
      if (at < 0) return args[3] !== undefined ? scalar(args[3]) : E.NA();
      return result[at] ?? E.NA();
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
    case "MATCH":
    case "XMATCH": {
      const needle = scalar(args[0]);
      const table = args[1];
      const mode = asNumber(args[2] ?? 0);
      if (needle instanceof FormulaError) return needle;
      if (!(table instanceof Array)) return E.NA();
      if (mode instanceof FormulaError) return mode;
      const at = mode === 0 ? table.findIndex((item) => lookupEqual(item, needle)) : approxIndex(table, needle, mode > 0 ? -1 : 1);
      if (at < 0) return args[3] !== undefined ? scalar(args[3]) : E.NA();
      return at + 1;
    }
    case "LOOKUP": {
      const needle = scalar(args[0]);
      const lookup = args[1];
      if (needle instanceof FormulaError) return needle;
      if (!(lookup instanceof Array)) return E.NA();
      const result = Array.isArray(args[2]) ? args[2] : lookup;
      const width = rangeWidth(lookup);
      const rows = Math.ceil(lookup.length / width);
      const across = rows === 1;
      const column: FormulaPrimitive[] = [];
      for (let i = 0; i < (across ? width : rows); i += 1) column.push(lookup[across ? i : i * width] ?? "");
      const at = approxIndex(column, needle, -1);
      if (at < 0) return E.NA();
      const resultWidth = rangeWidth(result);
      const resultRows = Math.ceil(result.length / resultWidth);
      if (across && resultRows === 1) return result[at] ?? E.NA();
      return result[at * resultWidth + resultWidth - 1] ?? E.NA();
    }
    case "TEXT": {
      const value = asNumber(args[0] ?? 0);
      if (value instanceof FormulaError) return value;
      return formatNumber(value, asText(args[1] ?? "0"));
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
    case "SUMIF":
    case "COUNTIF":
    case "AVERAGEIF":
      return conditional(name, args[0], args[1], args[2]);
    case "SUMIFS":
    case "AVERAGEIFS":
      return conditionals(name, args);
    case "COUNTIFS":
      return conditionals(name, args.length ? [args[0]!, ...args] : args);
    case "MAXIFS":
    case "MINIFS":
      return extremeIf(name, args);
    case "COUNTBLANK":
      return flatten(args).filter((item) => item === "").length;
    case "IFS": {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const cond = asBool(args[i] ?? false);
        if (cond instanceof FormulaError) return cond;
        if (cond) return args[i + 1] ?? "";
      }
      return E.NA();
    }
    case "IFNA": {
      const primary = args[0];
      if (primary instanceof FormulaError && primary.code === "#N/A") return args[1] ?? "";
      return primary ?? "";
    }
    case "SWITCH": {
      const probe = args[0];
      for (let i = 1; i + 1 < args.length; i += 2) {
        if (sameValue(probe, args[i])) return args[i + 1] ?? "";
      }
      return args.length % 2 === 0 ? (args[args.length - 1] ?? "") : E.NA();
    }
    case "FIND":
    case "SEARCH": {
      const needle = asText(args[0] ?? "");
      const haystack = asText(args[1] ?? "");
      const start = asNumber(args[2] ?? 1);
      if (start instanceof FormulaError) return start;
      const from = Math.max(0, Math.floor(start) - 1);
      const at = findText(haystack, needle, from, name === "SEARCH");
      return at < 0 ? E.VALUE() : at + 1;
    }
    case "SUBSTITUTE": {
      const text = asText(args[0] ?? "");
      const from = asText(args[1] ?? "");
      const to = asText(args[2] ?? "");
      const which = args[3] === undefined ? undefined : asNumber(args[3]);
      if (which instanceof FormulaError) return which;
      if (!from) return text;
      if (which === undefined) return text.split(from).join(to);
      let seen = 0;
      return text.replaceAll(from, (match) => {
        seen += 1;
        return seen === which ? to : match;
      });
    }
    case "REPLACE": {
      const text = asText(args[0] ?? "");
      const start = asNumber(args[1] ?? 1);
      const count = asNumber(args[2] ?? 0);
      if (start instanceof FormulaError) return start;
      if (count instanceof FormulaError) return count;
      const at = Math.max(0, Math.floor(start) - 1);
      return text.slice(0, at) + asText(args[3] ?? "") + text.slice(at + Math.max(0, Math.floor(count)));
    }
    case "REPT": {
      const text = asText(args[0] ?? "");
      const times = asNumber(args[1] ?? 0);
      if (times instanceof FormulaError) return times;
      if (times < 0) return E.VALUE();
      return text.repeat(Math.min(10000, Math.floor(times)));
    }
    case "EXACT":
      return asText(args[0] ?? "") === asText(args[1] ?? "");
    case "TEXTSPLIT": {
      const text = asText(args[0] ?? "");
      const colDelim = asText(args[1] ?? "");
      const rowDelim = args[2] === undefined ? "" : asText(args[2]);
      if (!colDelim && !rowDelim) return E.VALUE();
      const lines = rowDelim ? text.split(rowDelim) : [text];
      const rows = lines.map((line) => (colDelim ? line.split(colDelim) : [line]));
      const width = rows.reduce((widest, line) => Math.max(widest, line.length), 1);
      const pad = args[3] === undefined ? "" : asText(args[3]);
      const out: FormulaPrimitive[] = [];
      for (const line of rows) {
        for (let i = 0; i < width; i += 1) out.push(line[i] ?? pad);
      }
      return withWidth(out, width);
    }
    case "TEXTJOIN": {
      const sep = asText(args[0] ?? "");
      const skip = asBool(args[1] ?? false);
      if (skip instanceof FormulaError) return skip;
      const parts = flatten(args.slice(2)).map((item) => asText(item));
      return (skip ? parts.filter((item) => item !== "") : parts).join(sep);
    }
    case "ROUNDUP":
    case "ROUNDDOWN": {
      const n = asNumber(args[0] ?? 0);
      const d = asNumber(args[1] ?? 0);
      if (n instanceof FormulaError) return n;
      if (d instanceof FormulaError) return d;
      const factor = 10 ** Math.floor(d);
      const scaled = n * factor;
      const moved = name === "ROUNDUP" ? (scaled < 0 ? Math.floor(scaled) : Math.ceil(scaled)) : (scaled < 0 ? Math.ceil(scaled) : Math.floor(scaled));
      return moved / factor;
    }
    case "CEILING":
    case "FLOOR": {
      const n = asNumber(args[0] ?? 0);
      const step = asNumber(args[1] ?? 1);
      if (n instanceof FormulaError) return n;
      if (step instanceof FormulaError) return step;
      if (step === 0) return 0;
      const units = n / step;
      return (name === "CEILING" ? Math.ceil(units) : Math.floor(units)) * step;
    }
    case "SUMPRODUCT": {
      const lists = args.filter((arg): arg is FormulaPrimitive[] => Array.isArray(arg));
      if (!lists.length) return 0;
      const length = Math.min(...lists.map((list) => list.length));
      let total = 0;
      for (let i = 0; i < length; i += 1) {
        let product = 1;
        for (const list of lists) {
          const value = asNumber(list[i] ?? 0);
          if (value instanceof FormulaError) return value;
          product *= value;
        }
        total += product;
      }
      return total;
    }
    case "MEDIAN": {
      const nums = numbers(args).sort((a, b) => a - b);
      if (!nums.length) return E.NUM();
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 ? nums[mid]! : (nums[mid - 1]! + nums[mid]!) / 2;
    }
    case "LARGE":
    case "SMALL": {
      const nums = numbers([args[0] ?? 0]).sort((a, b) => (name === "LARGE" ? b - a : a - b));
      const k = asNumber(args[1] ?? 1);
      if (k instanceof FormulaError) return k;
      const value = nums[Math.floor(k) - 1];
      return value === undefined ? E.NUM() : value;
    }
    case "RANK": {
      const target = asNumber(args[0] ?? 0);
      if (target instanceof FormulaError) return target;
      const nums = numbers([args[1] ?? 0]);
      const order = asNumber(args[2] ?? 0);
      if (order instanceof FormulaError) return order;
      if (!nums.some((item) => item === target)) return E.NA();
      const ahead = nums.filter((item) => (order === 0 ? item > target : item < target)).length;
      return ahead + 1;
    }
    case "EDATE": {
      const serial = asNumber(args[0] ?? 0);
      const months = asNumber(args[1] ?? 0);
      if (serial instanceof FormulaError) return serial;
      if (months instanceof FormulaError) return months;
      const date = new Date(Math.round((serial - 25569) * 86400000));
      const monthIndex = date.getUTCMonth() + Math.trunc(months);
      const last = new Date(Date.UTC(date.getUTCFullYear(), monthIndex + 1, 0)).getUTCDate();
      return Date.UTC(date.getUTCFullYear(), monthIndex, Math.min(date.getUTCDate(), last)) / 86400000 + 25569;
    }
    case "EOMONTH": {
      const serial = asNumber(args[0] ?? 0);
      const months = asNumber(args[1] ?? 0);
      if (serial instanceof FormulaError) return serial;
      if (months instanceof FormulaError) return months;
      const date = new Date(Math.round((serial - 25569) * 86400000));
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Math.trunc(months) + 1, 0) / 86400000 + 25569;
    }
    case "DATEDIF": {
      const start = asNumber(args[0] ?? 0);
      const end = asNumber(args[1] ?? 0);
      if (start instanceof FormulaError) return start;
      if (end instanceof FormulaError) return end;
      if (end < start) return E.NUM();
      const unit = asText(args[2] ?? "D").toUpperCase();
      if (unit === "D") return Math.round(end - start);
      const from = new Date(Math.round((start - 25569) * 86400000));
      const to = new Date(Math.round((end - 25569) * 86400000));
      let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
      if (to.getUTCDate() < from.getUTCDate()) months -= 1;
      if (unit === "M") return months;
      if (unit === "Y") return Math.floor(months / 12);
      if (unit === "YM") return ((months % 12) + 12) % 12;
      if (unit === "MD") return datedifDays(from, to, "MD");
      if (unit === "YD") return datedifDays(from, to, "YD");
      return E.NUM();
    }
    case "WEEKNUM": {
      const serial = asNumber(args[0] ?? 0);
      const system = asNumber(args[1] ?? 1);
      if (serial instanceof FormulaError) return serial;
      if (system instanceof FormulaError) return system;
      return weekNumber(serial, system);
    }
    case "ISOWEEKNUM": {
      const serial = asNumber(args[0] ?? 0);
      if (serial instanceof FormulaError) return serial;
      return isoWeekNumber(serial);
    }
    case "WEEKDAY": {
      const serial = asNumber(args[0] ?? 0);
      if (serial instanceof FormulaError) return serial;
      const date = new Date(Math.round((serial - 25569) * 86400000));
      return date.getUTCDay() + 1;
    }
    case "TEXTBEFORE":
    case "TEXTAFTER": {
      const text = asText(args[0] ?? "");
      const marker = asText(args[1] ?? "");
      const at = text.indexOf(marker);
      if (at < 0) return E.NA();
      return name === "TEXTBEFORE" ? text.slice(0, at) : text.slice(at + marker.length);
    }
    case "NETWORKDAYS": {
      const start = asNumber(args[0] ?? 0);
      const end = asNumber(args[1] ?? 0);
      if (start instanceof FormulaError) return start;
      if (end instanceof FormulaError) return end;
      const step = end >= start ? 1 : -1;
      let count = 0;
      for (let day = Math.round(start); step > 0 ? day <= end : day >= end; day += step) {
        const weekday = new Date(Math.round((day - 25569) * 86400000)).getUTCDay();
        if (weekday !== 0 && weekday !== 6) count += step;
      }
      return count;
    }
    case "SUBTOTAL": {
      const code = asNumber(args[0] ?? 9);
      if (code instanceof FormulaError) return code;
      const fn = SUBTOTALS[Math.floor(code) % 100];
      return fn ? fn(visibleArgs(args.slice(1), Math.floor(code) >= 100)) : E.VALUE();
    }
    case "HLOOKUP": {
      const needle = scalar(args[0]);
      const table = args[1];
      const row = asNumber(args[2] ?? 1);
      const approximate = args[3] === undefined ? true : asBool(args[3]);
      if (needle instanceof FormulaError) return needle;
      if (!(table instanceof Array) || row instanceof FormulaError) return E.VALUE();
      if (approximate instanceof FormulaError) return approximate;
      const width = rangeWidth(table);
      const index = Math.max(1, Math.floor(row));
      if (index > Math.ceil(table.length / width)) return E.REF();
      const header = table.slice(0, width);
      const at = approximate ? approxIndex(header, needle, -1) : header.findIndex((cell) => lookupEqual(cell, needle));
      return at < 0 ? E.NA() : table[(index - 1) * width + at] ?? E.NA();
    }
    case "PMT":
    case "PV":
    case "FV":
    case "NPER":
    case "RATE":
    case "IPMT":
    case "PPMT":
      return finance(name, args);
    case "NPV": {
      const rate = asNumber(args[0] ?? 0);
      if (rate instanceof FormulaError) return rate;
      if (rate <= -1) return E.NUM();
      return numbers(args.slice(1)).reduce((sum, value, index) => sum + value / (1 + rate) ** (index + 1), 0);
    }
    case "IRR": {
      const values = numbers(args.slice(0, 1));
      const guess = asNumber(args[1] ?? 0.1);
      if (guess instanceof FormulaError) return guess;
      return internalRate(values, guess);
    }
    case "STDEV":
    case "STDEV.S":
      return stdev(args, false);
    case "STDEVP":
    case "STDEV.P":
      return stdev(args, true);
    case "VAR":
    case "VAR.S":
      return variance(args, false);
    case "VARP":
    case "VAR.P":
      return variance(args, true);
    case "PRODUCT":
      return numbers(args).reduce((a, b) => a * b, 1);
    case "MODE":
    case "MODE.SNGL":
      return modeOf(numbers(args));
    case "PERCENTILE":
    case "PERCENTILE.INC": {
      const k = asNumber(args[1] ?? 0);
      if (k instanceof FormulaError) return k;
      return percentile(numbers(args.slice(0, 1)), k);
    }
    case "QUARTILE":
    case "QUARTILE.INC": {
      const q = asNumber(args[1] ?? 0);
      if (q instanceof FormulaError) return q;
      if (q < 0 || q > 4) return E.NUM();
      return percentile(numbers(args.slice(0, 1)), q / 4);
    }
    case "CORREL":
    case "PEARSON":
      return correl(numbers(args.slice(0, 1)), numbers(args.slice(1, 2)));
    case "LN":
    case "LOG":
    case "LOG10":
    case "EXP":
    case "SIN":
    case "COS":
    case "TAN":
    case "ASIN":
    case "ACOS":
    case "ATAN":
    case "ATAN2":
    case "SIGN":
    case "FACT":
    case "PI":
    case "RADIANS":
    case "DEGREES":
    case "COMBIN":
      return mathFn(name, args);
    case "PROPER":
      return asText(args[0] ?? "").toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
    case "CHAR": {
      const code = asNumber(args[0] ?? 0);
      if (code instanceof FormulaError) return code;
      if (code < 1 || code > 255) return E.VALUE();
      return String.fromCharCode(Math.floor(code));
    }
    case "CODE": {
      const text = asText(args[0] ?? "");
      return text ? text.charCodeAt(0) : E.VALUE();
    }
    case "TIME": {
      const h = asNumber(args[0] ?? 0);
      const m = asNumber(args[1] ?? 0);
      const s = asNumber(args[2] ?? 0);
      if (h instanceof FormulaError) return h;
      if (m instanceof FormulaError) return m;
      if (s instanceof FormulaError) return s;
      return (h * 3600 + m * 60 + s) / 86400;
    }
    case "HOUR":
    case "MINUTE":
    case "SECOND": {
      const serial = asNumber(args[0] ?? 0);
      if (serial instanceof FormulaError) return serial;
      const seconds = Math.round((((serial % 1) + 1) % 1) * 86400);
      if (name === "HOUR") return Math.floor(seconds / 3600);
      if (name === "MINUTE") return Math.floor(seconds / 60) % 60;
      return seconds % 60;
    }
    case "DATEVALUE": {
      const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(asText(args[0] ?? "").trim());
      if (!match) return E.VALUE();
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 + 25569;
    }
    case "WORKDAY": {
      const start = asNumber(args[0] ?? 0);
      const days = asNumber(args[1] ?? 0);
      if (start instanceof FormulaError) return start;
      if (days instanceof FormulaError) return days;
      return workday(start, days);
    }
    case "YEARFRAC": {
      const start = asNumber(args[0] ?? 0);
      const end = asNumber(args[1] ?? 0);
      const basis = asNumber(args[2] ?? 0);
      if (start instanceof FormulaError) return start;
      if (end instanceof FormulaError) return end;
      if (basis instanceof FormulaError) return basis;
      return yearFrac(start, end, basis);
    }
    case "BIN2DEC":
    case "DEC2BIN":
    case "HEX2DEC":
    case "DEC2HEX":
    case "OCT2DEC":
    case "DEC2OCT":
      return baseConvert(name, args);
    case "CONVERT": {
      const value = asNumber(args[0] ?? 0);
      if (value instanceof FormulaError) return value;
      return convertUnit(value, asText(args[1] ?? ""), asText(args[2] ?? ""));
    }
    case "SORTBY":
      return sortBy(args);
    case "HSTACK":
    case "VSTACK":
      return stack(name, args);
    case "DSUM":
    case "DCOUNT":
    case "DCOUNTA":
    case "DAVERAGE":
    case "DMAX":
    case "DMIN":
    case "DPRODUCT":
    case "DSTDEV":
    case "DVAR":
    case "DGET":
      return database(name, args);
    case "DAYS360": {
      const start = asNumber(args[0] ?? 0);
      const end = asNumber(args[1] ?? 0);
      if (start instanceof FormulaError) return start;
      if (end instanceof FormulaError) return end;
      return days360(start, end);
    }
    case "MMULT":
      return matrixProduct(args[0], args[1]);
    case "FORECAST":
    case "FORECAST.LINEAR":
      return forecast(args);
    case "XIRR":
      return xirr(args);
    case "MAKEARRAY":
      return makeArray(args, ctx);
    case "MAP":
      return mapArray(args, ctx);
    case "REDUCE":
    case "SCAN":
      return foldArray(name, args, ctx);
    case "BYROW":
    case "BYCOL":
      return byAxis(name, args, ctx);
    case "DAYS": {
      const end = asNumber(args[0] ?? 0);
      const start = asNumber(args[1] ?? 0);
      if (end instanceof FormulaError) return end;
      if (start instanceof FormulaError) return start;
      return Math.round(end - start);
    }
    case "WORKDAY.INTL": {
      const start = asNumber(args[0] ?? 0);
      const days = asNumber(args[1] ?? 0);
      const weekend = asNumber(args[2] ?? 1);
      if (start instanceof FormulaError) return start;
      if (days instanceof FormulaError) return days;
      if (weekend instanceof FormulaError) return weekend;
      const mask = weekendMask(weekend);
      return mask instanceof FormulaError ? mask : workdayIntl(start, days, mask);
    }
    case "NETWORKDAYS.INTL": {
      const start = asNumber(args[0] ?? 0);
      const end = asNumber(args[1] ?? 0);
      const weekend = asNumber(args[2] ?? 1);
      if (start instanceof FormulaError) return start;
      if (end instanceof FormulaError) return end;
      if (weekend instanceof FormulaError) return weekend;
      const mask = weekendMask(weekend);
      return mask instanceof FormulaError ? mask : networkDaysIntl(start, end, mask);
    }
    case "COUPDAYS":
    case "COUPNUM":
    case "COUPPCD":
    case "COUPNCD": {
      const settle = asNumber(args[0] ?? 0);
      const mature = asNumber(args[1] ?? 0);
      const frequency = asNumber(args[2] ?? 0);
      if (settle instanceof FormulaError) return settle;
      if (mature instanceof FormulaError) return mature;
      if (frequency instanceof FormulaError) return frequency;
      return coupon(name, settle, mature, frequency);
    }
    case "SLN":
    case "SYD":
    case "DB":
    case "DDB":
      return depreciation(name, args);
    case "EFFECT":
    case "NOMINAL": {
      const first = asNumber(args[0] ?? 0);
      const periods = asNumber(args[1] ?? 0);
      if (first instanceof FormulaError) return first;
      if (periods instanceof FormulaError) return periods;
      if (first <= 0 || periods < 1) return E.NUM();
      const n = Math.floor(periods);
      return name === "EFFECT" ? (1 + first / n) ** n - 1 : ((1 + first) ** (1 / n) - 1) * n;
    }
    case "SLOPE":
    case "INTERCEPT":
    case "RSQ":
    case "STEYX":
      return regression(name, args);
    case "NORM.DIST":
    case "NORM.S.DIST":
    case "NORM.INV":
    case "NORMSDIST":
    case "NORMSINV":
      return normalDist(name, args);
    case "TAKE":
    case "DROP":
    case "CHOOSECOLS":
    case "CHOOSEROWS":
    case "TOCOL":
    case "TOROW":
    case "WRAPROWS":
    case "WRAPCOLS":
    case "EXPAND":
      return reshape(name, args);
    case "GEOMEAN":
    case "HARMEAN":
    case "TRIMMEAN":
    case "SKEW":
    case "KURT":
    case "DEVSQ":
    case "AVEDEV":
    case "PERCENTILE.EXC":
    case "QUARTILE.EXC":
    case "PERCENTRANK":
    case "FREQUENCY":
    case "PERMUT":
      return statsFn(name, args);
    case "CUMPRINC":
    case "CUMIPMT":
    case "RRI":
    case "PDURATION":
    case "ACCRINT":
    case "PRICE":
    case "YIELD":
    case "DURATION":
    case "DISC":
    case "TBILLPRICE":
      return financeExtra(name, args);
    case "NUMBERVALUE":
    case "FIXED":
    case "DOLLAR":
    case "UNICODE":
    case "UNICHAR":
    case "CLEAN":
    case "ASC":
      return textExtra(name, args);
    default:
      return E.NAME();
  }
}

/**
 * Reshapes an array. TAKE and DROP keep or skip rows and columns from either end, CHOOSECOLS and CHOOSEROWS
 * pick by number, TOCOL and TOROW flatten, WRAPROWS and WRAPCOLS fold a list, and EXPAND pads to a size.
 */
function reshape(name: string, args: FormulaValue[]): FormulaValue {
  const source = args[0];
  if (!Array.isArray(source)) return E.VALUE();
  const width = rangeWidth(source);
  const height = Math.ceil(source.length / width);
  const count = (value: FormulaValue | undefined, fallback: number): number | FormulaError => {
    if (value === undefined) return fallback;
    const parsed = asNumber(value);
    return parsed instanceof FormulaError ? parsed : Math.trunc(parsed);
  };
  if (name === "TOCOL" || name === "TOROW") {
    const scanByRow = asNumber(args[1] ?? 0);
    if (scanByRow instanceof FormulaError) return scanByRow;
    const ignore = asNumber(args[2] ?? 0);
    if (ignore instanceof FormulaError) return ignore;
    const out: FormulaPrimitive[] = [];
    const read = (row: number, col: number) => {
      const cell = source[row * width + col] ?? "";
      if ((ignore === 1 || ignore === 3) && cell === "") return;
      out.push(cell);
    };
    const byColumn = scanByRow !== 0;
    if (byColumn) for (let col = 0; col < width; col += 1) for (let row = 0; row < height; row += 1) read(row, col);
    else for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) read(row, col);
    return withWidth(out, name === "TOROW" ? Math.max(1, out.length) : 1);
  }
  if (name === "WRAPROWS" || name === "WRAPCOLS") {
    const size = count(args[1], 0);
    if (size instanceof FormulaError) return size;
    if (size < 1) return E.NUM();
    const pad = args[2] === undefined ? "" : scalarPrimitive(args[2]);
    const across = name === "WRAPROWS";
    const lines = Math.ceil(source.length / size);
    const out: FormulaPrimitive[] = [];
    for (let line = 0; line < lines; line += 1) {
      for (let i = 0; i < size; i += 1) out.push(source[(across ? line * size : i * lines) + (across ? i : line)] ?? pad);
    }
    return withWidth(out, across ? size : lines);
  }
  if (name === "EXPAND") {
    const rows = count(args[1], height);
    const cols = count(args[2], width);
    if (rows instanceof FormulaError) return rows;
    if (cols instanceof FormulaError) return cols;
    if (rows < height || cols < width) return E.VALUE();
    const pad = args[3] === undefined ? "" : scalarPrimitive(args[3]);
    const out: FormulaPrimitive[] = [];
    for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) out.push(source[row * width + col] ?? pad);
    return withWidth(out, cols);
  }
  const rows = count(args[1], name.endsWith("ROWS") ? 1 : height);
  if (rows instanceof FormulaError) return rows;
  const pick = (total: number, requested: number): number[] | FormulaError => {
    if (requested === 0 || Math.abs(requested) > total) return E.VALUE();
    const out: number[] = [];
    const span = Math.abs(requested);
    for (let i = 0; i < span; i += 1) out.push(requested > 0 ? i : total - span + i);
    return out;
  };
  if (name === "TAKE" || name === "DROP") {
    const cols = count(args[2], name === "DROP" ? 0 : width);
    if (cols instanceof FormulaError) return cols;
    const dropped = (total: number, requested: number): number[] | FormulaError => {
      if (requested === 0) return [];
      return pick(total, requested);
    };
    const rowDrop = name === "DROP" ? dropped(height, rows) : pick(height, rows || height);
    if (rowDrop instanceof FormulaError) return rowDrop;
    const rowIndex = name === "TAKE" ? rowDrop : [...Array(height).keys()].filter((row) => !rowDrop.includes(row));
    const colDrop = name === "DROP" ? dropped(width, cols) : pick(width, cols || width);
    if (colDrop instanceof FormulaError) return colDrop;
    const colIndex = name === "TAKE" ? colDrop : [...Array(width).keys()].filter((col) => !colDrop.includes(col));
    const out: FormulaPrimitive[] = [];
    for (const row of rowIndex) for (const col of colIndex) out.push(source[row * width + col] ?? "");
    return withWidth(out, Math.max(1, colIndex.length));
  }
  const indexes: number[] = [];
  for (const arg of args.slice(1)) {
    const value = asNumber(arg ?? 0);
    if (value instanceof FormulaError) return value;
    const index = Math.trunc(value);
    const limit = name === "CHOOSEROWS" ? height : width;
    if (index === 0 || Math.abs(index) > limit) return E.VALUE();
    indexes.push(index > 0 ? index - 1 : limit + index);
  }
  if (!indexes.length) return E.VALUE();
  const out: FormulaPrimitive[] = [];
  if (name === "CHOOSEROWS") for (const row of indexes) for (let col = 0; col < width; col += 1) out.push(source[row * width + col] ?? "");
  else for (let row = 0; row < height; row += 1) for (const col of indexes) out.push(source[row * width + col] ?? "");
  return withWidth(out, name === "CHOOSEROWS" ? width : indexes.length);
}

/** The descriptive statistics that read one list: means, rank, spread, and the exclusive percentile. */
function statsFn(name: string, args: FormulaValue[]): FormulaValue {
  if (name === "PERMUT") {
    const n = asNumber(args[0] ?? 0);
    const k = asNumber(args[1] ?? 0);
    if (n instanceof FormulaError) return n;
    if (k instanceof FormulaError) return k;
    if (n < 0 || k < 0 || k > n || !Number.isInteger(n) || !Number.isInteger(k)) return E.NUM();
    let out = 1;
    for (let i = 0; i < k; i += 1) out *= n - i;
    return out;
  }
  if (name === "FREQUENCY") {
    const data = numbers(args.slice(0, 1));
    const bins = numbers(args.slice(1, 2)).sort((a, b) => a - b);
    const counts = bins.map(() => 0);
    let above = 0;
    for (const value of data) {
      const bin = bins.findIndex((edge) => value <= edge);
      if (bin < 0) above += 1;
      else counts[bin] = (counts[bin] ?? 0) + 1;
    }
    return withWidth([...counts, above], 1);
  }
  const ranged = name === "PERCENTRANK" || name === "TRIMMEAN" || name === "PERCENTILE.EXC" || name === "QUARTILE.EXC";
  const nums = numbers(ranged ? args.slice(0, 1) : args);
  if (!nums.length) return E.NUM();
  if (name === "GEOMEAN") {
    if (nums.some((item) => item <= 0)) return E.NUM();
    return Math.exp(nums.reduce((sum, item) => sum + Math.log(item), 0) / nums.length);
  }
  if (name === "HARMEAN") {
    if (nums.some((item) => item <= 0)) return E.NUM();
    return nums.length / nums.reduce((sum, item) => sum + 1 / item, 0);
  }
  const mean = nums.reduce((sum, item) => sum + item, 0) / nums.length;
  if (name === "AVEDEV") return nums.reduce((sum, item) => sum + Math.abs(item - mean), 0) / nums.length;
  if (name === "DEVSQ") return nums.reduce((sum, item) => sum + (item - mean) ** 2, 0);
  const square = nums.reduce((sum, item) => sum + (item - mean) ** 2, 0);
  if (name === "SKEW" || name === "KURT") {
    if (nums.length < (name === "KURT" ? 4 : 3) || square === 0) return E.DIV0();
    const deviation = Math.sqrt(square / (nums.length - 1));
    const moment = nums.reduce((sum, item) => sum + ((item - mean) / deviation) ** (name === "KURT" ? 4 : 3), 0);
    const n = nums.length;
    return name === "SKEW" ? (n / ((n - 1) * (n - 2))) * moment : ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * moment - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  }
  if (name === "PERCENTRANK") {
    const target = asNumber(args[1] ?? 0);
    if (target instanceof FormulaError) return target;
    const sorted = [...nums].sort((a, b) => a - b);
    if (target < sorted[0]! || target > sorted[sorted.length - 1]!) return E.NA();
    const above = sorted.filter((item) => item < target).length;
    const same = sorted.filter((item) => item === target).length;
    return (above + (same > 1 ? (same - 1) / 2 : 0)) / (sorted.length - 1);
  }
  if (name === "TRIMMEAN") {
    const fraction = asNumber(args[1] ?? 0);
    if (fraction instanceof FormulaError) return fraction;
    if (fraction < 0 || fraction >= 1) return E.NUM();
    const sorted = [...nums].sort((a, b) => a - b);
    const cut = Math.floor(sorted.length * fraction / 2);
    const kept = sorted.slice(cut, sorted.length - cut);
    return kept.reduce((sum, item) => sum + item, 0) / kept.length;
  }
  const k = asNumber(args[1] ?? 0);
  if (k instanceof FormulaError) return k;
  const probe = name === "QUARTILE.EXC" ? k / 4 : k;
  if (probe <= 0 || probe >= 1) return E.NUM();
  const sorted = [...nums].sort((a, b) => a - b);
  const position = probe * (sorted.length + 1) - 1;
  if (position < 0 || position > sorted.length - 1) return E.NUM();
  const lower = Math.floor(position);
  return sorted[lower]! + (sorted[Math.ceil(position)]! - sorted[lower]!) * (position - lower);
}

/** Loan totals, growth rates, and the straight bond and treasury bill prices. */
function financeExtra(name: string, args: FormulaValue[]): FormulaValue {
  const values: number[] = [];
  for (const arg of args) {
    const value = asNumber(arg ?? 0);
    if (value instanceof FormulaError) return value;
    values.push(value);
  }
  const at = (index: number): number => values[index] ?? 0;
  if (name === "CUMPRINC" || name === "CUMIPMT") {
    const [rate, periods, present, first, last] = [at(0), at(1), at(2), at(3), at(4)];
    if (rate <= 0 || periods < 1 || first < 1 || last < first || last > periods) return E.NUM();
    const payment = present * rate / (1 - (1 + rate) ** -periods);
    let total = 0;
    let balance = present;
    for (let period = 1; period <= last; period += 1) {
      const interest = balance * rate;
      const principal = payment - interest;
      if (period >= first) total += name === "CUMIPMT" ? interest : principal;
      balance -= principal;
    }
    return -Math.abs(total);
  }
  if (name === "RRI" || name === "PDURATION") {
    const [periods, present, future] = [at(0), at(1), at(2)];
    if (present <= 0 || future <= 0 || periods <= 0) return E.NUM();
    const growth = Math.log(future / present);
    return name === "RRI" ? Math.exp(growth / periods) - 1 : growth / Math.log(1 + periods);
  }
  if (name === "DISC" || name === "TBILLPRICE") {
    const [settlement, maturity, third, redemption] = [at(0), at(1), at(2), at(3)];
    const days = maturity - settlement;
    if (days <= 0) return E.NUM();
    if (name === "TBILLPRICE") return 100 * (1 - third * days / 360);
    if (redemption === 0) return E.DIV0();
    return (redemption - third) / redemption * (360 / days);
  }
  const rate = at(0);
  if (name === "ACCRINT") {
    const [first, settlement, par, frequency] = [at(1), at(2), at(3), at(4)];
    if (frequency <= 0 || settlement < first) return E.NUM();
    return par * rate / frequency * Math.round((settlement - first) / (365 / frequency));
  }
  const [coupon, settlement, maturity, frequency] = [at(1), at(2), at(3), at(4)];
  if (![1, 2, 4].includes(frequency) || maturity <= settlement) return E.NUM();
  const periods = Math.ceil((maturity - settlement) / (365 / frequency));
  const perRate = rate / frequency;
  if (name === "PRICE" || name === "DURATION") {
    const redemption = at(5);
    let price = 0;
    let weighted = 0;
    for (let period = 1; period <= periods; period += 1) {
      const cash = coupon / frequency + (period === periods ? redemption : 0);
      const discounted = cash / (1 + perRate) ** period;
      price += discounted;
      weighted += period / frequency * discounted;
    }
    return name === "PRICE" ? price : price === 0 ? E.DIV0() : weighted / price;
  }
  const present = at(5);
  if (present <= 0) return E.NUM();
  let low = 0;
  let high = 1;
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    let price = 0;
    for (let period = 1; period <= periods; period += 1) {
      price += (coupon / frequency + (period === periods ? 100 : 0)) / (1 + mid / frequency) ** period;
    }
    if (price > present) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** NUMBERVALUE reads a number with its own separators. The rest format or clean a text value. */
function textExtra(name: string, args: FormulaValue[]): FormulaValue {
  const text = asText(args[0] ?? "");
  if (name === "UNICODE") return text ? text.codePointAt(0)! : E.VALUE();
  if (name === "UNICHAR") {
    const code = asNumber(args[0] ?? 0);
    if (code instanceof FormulaError) return code;
    if (code < 1 || code > 0x10ffff) return E.VALUE();
    return String.fromCodePoint(Math.floor(code));
  }
  if (name === "CLEAN") return text.replace(/[\u0000-\u001f]/g, "");
  if (name === "ASC") return text.normalize("NFKC");
  if (name === "NUMBERVALUE") {
    const decimal = asText(args[1] ?? ".");
    const group = asText(args[2] ?? ",");
    const cleaned = text.split(group).join("").replace(decimal, ".");
    const value = Number(cleaned.replace(/%$/, ""));
    if (!Number.isFinite(value)) return E.VALUE();
    return cleaned.endsWith("%") ? value / 100 : value;
  }
  const value = asNumber(args[0] ?? 0);
  if (value instanceof FormulaError) return value;
  const digits = name === "DOLLAR" ? asNumber(args[1] ?? 2) : asNumber(args[1] ?? 2);
  if (digits instanceof FormulaError) return digits;
  const fixed = value.toFixed(Math.max(0, Math.floor(digits)));
  const [whole, fraction] = fixed.split(".");
  const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  return name === "DOLLAR" ? `$${body}` : body;
}

/** SORTBY orders the first range by the values in each following range, ascending unless the order is negative. */
function sortBy(args: FormulaValue[]): FormulaValue {
  const table = args[0];
  if (!Array.isArray(table)) return table ?? E.VALUE();
  const width = rangeWidth(table);
  const rows = Math.ceil(table.length / width);
  const keys: { values: FormulaPrimitive[]; descending: boolean }[] = [];
  for (let i = 1; i < args.length; i += 2) {
    const by = args[i];
    if (!Array.isArray(by)) return E.VALUE();
    const order = i + 1 < args.length ? asNumber(args[i + 1] ?? 1) : 1;
    if (order instanceof FormulaError) return order;
    keys.push({ values: by, descending: order < 0 });
  }
  if (!keys.length) return E.VALUE();
  const order = [...Array(rows).keys()].sort((a, b) => {
    for (const key of keys) {
      const diff = sortCompare(key.values[a] ?? "", key.values[b] ?? "");
      if (diff !== 0) return key.descending ? -diff : diff;
    }
    return 0;
  });
  const out: FormulaPrimitive[] = [];
  for (const row of order) out.push(...table.slice(row * width, row * width + width));
  return withWidth(out, width);
}

function sortCompare(left: FormulaPrimitive, right: FormulaPrimitive): number {
  const a = typeof left === "number" ? left : Number.NaN;
  const b = typeof right === "number" ? right : Number.NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

/** HSTACK places ranges side by side, VSTACK places them one under the other. Short rows and columns are padded. */
function stack(name: string, args: FormulaValue[]): FormulaValue {
  const blocks = args.map((arg) => (Array.isArray(arg) ? arg : [scalarPrimitive(arg ?? "")]));
  if (!blocks.length) return E.VALUE();
  if (name === "VSTACK") {
    const width = blocks.reduce((widest, block) => Math.max(widest, rangeWidth(block)), 1);
    const out: FormulaPrimitive[] = [];
    for (const block of blocks) {
      const blockWidth = rangeWidth(block);
      const rows = Math.ceil(block.length / blockWidth);
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < width; col += 1) out.push(block[row * blockWidth + col] ?? "");
      }
    }
    return withWidth(out, width);
  }
  const height = blocks.reduce((tallest, block) => Math.max(tallest, Math.ceil(block.length / rangeWidth(block))), 1);
  const out: FormulaPrimitive[] = [];
  for (let row = 0; row < height; row += 1) {
    for (const block of blocks) {
      const blockWidth = rangeWidth(block);
      for (let col = 0; col < blockWidth; col += 1) out.push(block[row * blockWidth + col] ?? "");
    }
  }
  return withWidth(out, blocks.reduce((sum, block) => sum + rangeWidth(block), 0));
}

/**
 * A database function reads the column named by the second argument from the table, keeping the rows
 * whose cells match every condition in the criteria range. The criteria range starts with field names.
 */
function database(name: string, args: FormulaValue[]): FormulaValue {
  const table = args[0];
  if (!Array.isArray(table)) return E.VALUE();
  const width = rangeWidth(table);
  const rows = Math.ceil(table.length / width);
  if (rows < 2) return E.VALUE();
  const header = table.slice(0, width).map((cell) => String(cell).toUpperCase());
  const field = args[1];
  const column = typeof field === "number" ? Math.floor(field) - 1 : header.indexOf(asText(field ?? "").toUpperCase());
  if (column < 0 || column >= width) return E.VALUE();
  const criteria = args[2];
  if (!Array.isArray(criteria)) return E.VALUE();
  const criteriaWidth = rangeWidth(criteria);
  const criteriaRows = Math.ceil(criteria.length / criteriaWidth);
  const criteriaCols = criteria.slice(0, criteriaWidth).map((cell) => header.indexOf(String(cell).toUpperCase()));
  const matched: number[] = [];
  for (let row = 1; row < rows; row += 1) {
    let ok = criteriaRows < 2;
    for (let line = 1; line < criteriaRows && !ok; line += 1) {
      ok = criteriaCols.every((col, index) => {
        if (col < 0) return true;
        return matches(table[row * width + col] ?? "", criteria[line * criteriaWidth + index] ?? "");
      });
    }
    if (ok) matched.push(row);
  }
  const values = matched.map((row) => table[row * width + column] ?? "");
  if (name === "DGET") {
    if (values.length !== 1) return E.NUM();
    return values[0] ?? "";
  }
  if (name === "DCOUNT") return values.filter((item) => typeof item === "number").length;
  if (name === "DCOUNTA") return values.filter((item) => item !== "").length;
  const nums = values.map((item) => asNumber(item)).filter((item): item is number => typeof item === "number");
  if (!nums.length) return 0;
  if (name === "DSUM") return nums.reduce((sum, item) => sum + item, 0);
  if (name === "DAVERAGE") return nums.reduce((sum, item) => sum + item, 0) / nums.length;
  if (name === "DMAX") return Math.max(...nums);
  if (name === "DMIN") return Math.min(...nums);
  if (name === "DPRODUCT") return nums.reduce((product, item) => product * item, 1);
  const mean = nums.reduce((sum, item) => sum + item, 0) / nums.length;
  const spread = nums.reduce((sum, item) => sum + (item - mean) ** 2, 0);
  if (nums.length < 2) return E.DIV0();
  return name === "DSTDEV" ? Math.sqrt(spread / (nums.length - 1)) : spread / (nums.length - 1);
}

/** DAYS360 counts each month as 30 days, using the US (NASD) convention. */
function days360(start: number, end: number): number {
  const from = new Date(Math.round((start - 25569) * 86400000));
  const to = new Date(Math.round((end - 25569) * 86400000));
  const day = (date: Date, cap: boolean) => {
    const value = date.getUTCDate();
    return cap && value === 31 ? 30 : value;
  };
  const startDay = day(from, true);
  const endDay = day(to, startDay >= 30);
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 360 + (to.getUTCMonth() - from.getUTCMonth()) * 30 + endDay - startDay;
}

/** MMULT multiplies two matrices. The first range's width must equal the second range's height. */
function matrixProduct(left: FormulaValue | undefined, right: FormulaValue | undefined): FormulaValue {
  if (!Array.isArray(left) || !Array.isArray(right)) return E.VALUE();
  const leftWidth = rangeWidth(left);
  const rightWidth = rangeWidth(right);
  const leftRows = Math.ceil(left.length / leftWidth);
  const rightRows = Math.ceil(right.length / rightWidth);
  if (leftWidth !== rightRows) return E.VALUE();
  const out: FormulaPrimitive[] = [];
  for (let row = 0; row < leftRows; row += 1) {
    for (let col = 0; col < rightWidth; col += 1) {
      let sum = 0;
      for (let k = 0; k < leftWidth; k += 1) {
        const a = asNumber(left[row * leftWidth + k] ?? 0);
        const b = asNumber(right[k * rightWidth + col] ?? 0);
        if (a instanceof FormulaError) return a;
        if (b instanceof FormulaError) return b;
        sum += a * b;
      }
      out.push(sum);
    }
  }
  return withWidth(out, rightWidth);
}

/** FORECAST fits a straight line through the known pairs and reads it at x. */
function forecast(args: FormulaValue[]): FormulaValue {
  const x = asNumber(args[0] ?? 0);
  if (x instanceof FormulaError) return x;
  const knownY = numbers(args.slice(1, 2));
  const knownX = numbers(args.slice(2, 3));
  const count = Math.min(knownY.length, knownX.length);
  if (count < 2) return E.VALUE();
  const xs = knownX.slice(0, count);
  const ys = knownY.slice(0, count);
  const meanX = xs.reduce((sum, item) => sum + item, 0) / count;
  const meanY = ys.reduce((sum, item) => sum + item, 0) / count;
  let across = 0;
  let square = 0;
  for (let i = 0; i < count; i += 1) {
    across += (xs[i]! - meanX) * (ys[i]! - meanY);
    square += (xs[i]! - meanX) ** 2;
  }
  if (square === 0) return E.DIV0();
  const slope = across / square;
  return meanY + slope * (x - meanX);
}

/** XIRR finds the rate that makes the dated cash flows worth zero, counting the year as 365 days. */
function xirr(args: FormulaValue[]): FormulaValue {
  const values = numbers(args.slice(0, 1));
  const dates = numbers(args.slice(1, 2));
  const guess = asNumber(args[2] ?? 0.1);
  if (guess instanceof FormulaError) return guess;
  const count = Math.min(values.length, dates.length);
  if (count < 2 || guess <= -1) return E.NUM();
  const flows = values.slice(0, count);
  const days = dates.slice(0, count);
  const first = days[0]!;
  const worth = (rate: number) => flows.reduce((sum, value, index) => sum + value / (1 + rate) ** ((days[index]! - first) / 365), 0);
  let rate = guess;
  for (let step = 0; step < 50; step += 1) {
    const value = worth(rate);
    const slope = (worth(rate + 1e-6) - value) / 1e-6;
    if (!Number.isFinite(value)) return E.NUM();
    if (Math.abs(value) < 1e-7) return rate;
    if (slope === 0) break;
    rate -= value / slope;
    if (rate <= -1) rate = -0.999999;
  }
  return Math.abs(worth(rate)) < 1e-4 ? rate : E.NUM();
}

/** MAKEARRAY builds a grid by calling the LAMBDA with each row and column number, both starting at 1. */
function makeArray(args: FormulaValue[], ctx: EvalContext): FormulaValue {
  const rows = asNumber(args[0] ?? 0);
  const cols = asNumber(args[1] ?? 0);
  const lambda = args[2];
  if (rows instanceof FormulaError) return rows;
  if (cols instanceof FormulaError) return cols;
  if (!isLambda(lambda) || lambda.params.length !== 2) return E.VALUE();
  const height = Math.max(1, Math.floor(rows));
  const width = Math.max(1, Math.floor(cols));
  const out: FormulaPrimitive[] = [];
  for (let row = 1; row <= height; row += 1) {
    for (let col = 1; col <= width; col += 1) {
      const value = applyLambda(lambda, [row, col], ctx);
      if (value instanceof FormulaError) return value;
      out.push(scalarPrimitive(value));
    }
  }
  return withWidth(out, width);
}

/** MAP calls the LAMBDA with the value at each position. Every range must have the same shape. */
function mapArray(args: FormulaValue[], ctx: EvalContext): FormulaValue {
  const lambda = args[args.length - 1];
  const ranges = args.slice(0, -1);
  if (!isLambda(lambda) || !ranges.length || lambda.params.length !== ranges.length) return E.VALUE();
  const first = ranges[0];
  if (!Array.isArray(first)) return E.VALUE();
  const width = rangeWidth(first);
  if (ranges.some((range) => !Array.isArray(range) || range.length !== first.length)) return E.VALUE();
  const out: FormulaPrimitive[] = [];
  for (let i = 0; i < first.length; i += 1) {
    const value = applyLambda(lambda, ranges.map((range) => (range as FormulaPrimitive[])[i] ?? ""), ctx);
    if (value instanceof FormulaError) return value;
    out.push(scalarPrimitive(value));
  }
  return withWidth(out, width);
}

/** REDUCE folds the LAMBDA over the range. SCAN returns every step, including the start value. */
function foldArray(name: string, args: FormulaValue[], ctx: EvalContext): FormulaValue {
  const start = args[0] ?? "";
  const range = args[1];
  const lambda = args[2];
  if (!Array.isArray(range) || !isLambda(lambda) || lambda.params.length !== 2) return E.VALUE();
  let acc = start;
  const steps: FormulaPrimitive[] = [scalarPrimitive(start)];
  for (const item of range) {
    const next = applyLambda(lambda, [acc, item], ctx);
    if (next instanceof FormulaError) return next;
    acc = next;
    steps.push(scalarPrimitive(next));
  }
  if (name === "REDUCE") return acc;
  return withWidth(steps, 1);
}

/** BYROW calls the LAMBDA with each row, BYCOL with each column. The LAMBDA takes the whole row or column. */
function byAxis(name: string, args: FormulaValue[], ctx: EvalContext): FormulaValue {
  const range = args[0];
  const lambda = args[1];
  if (!Array.isArray(range) || !isLambda(lambda) || lambda.params.length !== 1) return E.VALUE();
  const width = rangeWidth(range);
  const height = Math.ceil(range.length / width);
  const across = name === "BYROW";
  const count = across ? height : width;
  const out: FormulaPrimitive[] = [];
  for (let i = 0; i < count; i += 1) {
    const slice: FormulaPrimitive[] = [];
    const length = across ? width : height;
    for (let j = 0; j < length; j += 1) slice.push(range[(across ? i : j) * width + (across ? j : i)] ?? "");
    const value = applyLambda(lambda, [withWidth(slice, across ? width : 1)], ctx);
    if (value instanceof FormulaError) return value;
    out.push(scalarPrimitive(value));
  }
  return withWidth(out, across ? 1 : count);
}

/** Excel's weekend codes. 1 is Saturday and Sunday, 11 is Sunday only, and 2 through 7 start the pair on each weekday. */
function weekendMask(code: number): number | FormulaError {
  const masks: Record<number, number> = { 1: 65, 2: 96, 3: 48, 4: 24, 5: 12, 6: 6, 7: 3, 11: 64, 12: 32, 13: 16, 14: 8, 15: 4, 16: 2, 17: 1 };
  const mask = masks[Math.floor(code)];
  return mask === undefined ? E.NUM() : mask;
}

/** A bit set in the mask marks a weekend day. Bit 0 is Monday and bit 6 is Sunday. */
function isWeekend(serial: number, mask: number): boolean {
  const weekday = new Date(Math.round((serial - 25569) * 86400000)).getUTCDay();
  const bit = weekday === 0 ? 6 : weekday - 1;
  return (mask & (1 << bit)) !== 0;
}

function workdayIntl(start: number, days: number, mask: number): number {
  const step = days >= 0 ? 1 : -1;
  let left = Math.abs(Math.trunc(days));
  let day = Math.round(start);
  while (left > 0) {
    day += step;
    if (!isWeekend(day, mask)) left -= 1;
  }
  return day;
}

function networkDaysIntl(start: number, end: number, mask: number): number {
  const step = end >= start ? 1 : -1;
  let count = 0;
  for (let day = Math.round(start); step > 0 ? day <= end : day >= end; day += step) {
    if (!isWeekend(day, mask)) count += step;
  }
  return count;
}

/**
 * Coupon dates run backward from maturity by whole periods. COUPDAYS is the length of the period holding
 * the settlement, COUPNUM counts the coupons still due, and the other two return the period's end dates.
 */
function coupon(name: string, settle: number, mature: number, frequency: number): FormulaValue {
  if (![1, 2, 4].includes(frequency)) return E.NUM();
  if (mature <= settle) return E.NUM();
  const months = 12 / frequency;
  const end = new Date(Math.round((mature - 25569) * 86400000));
  const dates: number[] = [];
  for (let step = 0; ; step += 1) {
    const serial = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months * step, end.getUTCDate()) / 86400000 + 25569;
    dates.push(Math.round(serial));
    if (serial <= settle) break;
    if (step > 1200) return E.NUM();
  }
  const next = dates[dates.length - 2] ?? dates[0]!;
  const previous = dates[dates.length - 1]!;
  if (name === "COUPDAYS") return next - previous;
  if (name === "COUPNUM") return dates.length - 1;
  if (name === "COUPNCD") return next;
  return previous;
}

/** SLN is straight line, SYD sums the years' digits, DB is declining balance, and DDB is double declining. */
function depreciation(name: string, args: FormulaValue[]): FormulaValue {
  const cost = asNumber(args[0] ?? 0);
  const salvage = asNumber(args[1] ?? 0);
  const life = asNumber(args[2] ?? 0);
  if (cost instanceof FormulaError) return cost;
  if (salvage instanceof FormulaError) return salvage;
  if (life instanceof FormulaError) return life;
  if (life <= 0 || cost < 0) return E.NUM();
  if (name === "SLN") return (cost - salvage) / life;
  const period = asNumber(args[3] ?? 0);
  if (period instanceof FormulaError) return period;
  const year = Math.floor(period);
  if (year < 1 || year > life) return E.NUM();
  if (name === "SYD") return (cost - salvage) * (life - year + 1) / (life * (life + 1) / 2);
  if (name === "DB") {
    const months = args[4] === undefined ? 12 : asNumber(args[4]);
    if (months instanceof FormulaError) return months;
    if (months < 1 || months > 12) return E.NUM();
    const rate = Math.round((1 - (salvage / cost) ** (1 / life)) * 1000) / 1000;
    let book = cost;
    const charge = (which: number) => {
      const full = book * rate;
      const amount = which === 1 ? full * months / 12 : which === Math.floor(life) + 1 ? book * (12 - months) / 12 : full;
      book -= amount;
      return amount;
    };
    let value = 0;
    for (let which = 1; which <= year; which += 1) value = charge(which);
    return value;
  }
  const factor = args[4] === undefined ? 2 : asNumber(args[4]);
  if (factor instanceof FormulaError) return factor;
  if (factor <= 0) return E.NUM();
  let book = cost;
  let value = 0;
  for (let which = 1; which <= year; which += 1) {
    value = Math.min(book * factor / life, book - salvage);
    book -= value;
  }
  return value;
}

/** The straight line through the known pairs, shared by SLOPE, INTERCEPT, RSQ, and STEYX. */
function regression(name: string, args: FormulaValue[]): FormulaValue {
  const ys = numbers(args.slice(0, 1));
  const xs = numbers(args.slice(1, 2));
  const count = Math.min(ys.length, xs.length);
  if (count < 2) return E.VALUE();
  const x = xs.slice(0, count);
  const y = ys.slice(0, count);
  const meanX = x.reduce((sum, item) => sum + item, 0) / count;
  const meanY = y.reduce((sum, item) => sum + item, 0) / count;
  let across = 0;
  let squareX = 0;
  let squareY = 0;
  for (let i = 0; i < count; i += 1) {
    across += (x[i]! - meanX) * (y[i]! - meanY);
    squareX += (x[i]! - meanX) ** 2;
    squareY += (y[i]! - meanY) ** 2;
  }
  if (squareX === 0) return E.DIV0();
  const slope = across / squareX;
  if (name === "SLOPE") return slope;
  if (name === "INTERCEPT") return meanY - slope * meanX;
  if (squareY === 0) return E.DIV0();
  if (name === "RSQ") return across ** 2 / (squareX * squareY);
  let residual = 0;
  for (let i = 0; i < count; i += 1) residual += (y[i]! - (meanY + slope * (x[i]! - meanX))) ** 2;
  return Math.sqrt(residual / (count - 2));
}

/** The standard normal density and distribution, and the inverse through a rational approximation. */
function normalDist(name: string, args: FormulaValue[]): FormulaValue {
  if (name === "NORM.S.DIST" || name === "NORMSDIST") {
    const z = asNumber(args[0] ?? 0);
    if (z instanceof FormulaError) return z;
    const cumulative = name === "NORMSDIST" || asBool(args[1] ?? true);
    if (cumulative instanceof FormulaError) return cumulative;
    return cumulative ? normalCdf(z) : Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  }
  if (name === "NORMSINV") {
    const p = asNumber(args[0] ?? 0);
    if (p instanceof FormulaError) return p;
    if (p <= 0 || p >= 1) return E.NUM();
    return normalInv(p);
  }
  const x = asNumber(args[0] ?? 0);
  const mean = asNumber(args[1] ?? 0);
  const deviation = asNumber(args[2] ?? 1);
  if (x instanceof FormulaError) return x;
  if (mean instanceof FormulaError) return mean;
  if (deviation instanceof FormulaError) return deviation;
  if (deviation <= 0) return E.NUM();
  const z = (x - mean) / deviation;
  if (name === "NORM.INV") {
    if (x <= 0 || x >= 1) return E.NUM();
    return mean + deviation * normalInv(x);
  }
  const cumulative = asBool(args[3] ?? true);
  if (cumulative instanceof FormulaError) return cumulative;
  return cumulative ? normalCdf(z) : Math.exp(-z * z / 2) / (deviation * Math.sqrt(2 * Math.PI));
}

/** Abramowitz and Stegun's approximation of the standard normal distribution. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const tail = poly * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  return z >= 0 ? 1 - tail : tail;
}

/** Peter Acklam's rational approximation of the inverse standard normal distribution. */
function normalInv(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137143, 3.754408661907416];
  const low = 0.02425;
  const high = 1 - low;
  let q: number;
  if (p < low) {
    const t = Math.sqrt(-2 * Math.log(p));
    q = (((((c[0]! * t + c[1]!) * t + c[2]!) * t + c[3]!) * t + c[4]!) * t + c[5]!) / ((((d[0]! * t + d[1]!) * t + d[2]!) * t + d[3]!) * t + 1);
  } else if (p > high) {
    const t = Math.sqrt(-2 * Math.log(1 - p));
    q = -(((((c[0]! * t + c[1]!) * t + c[2]!) * t + c[3]!) * t + c[4]!) * t + c[5]!) / ((((d[0]! * t + d[1]!) * t + d[2]!) * t + d[3]!) * t + 1);
  } else {
    const t = p - 0.5;
    const r = t * t;
    q = (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * t / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  const err = normalCdf(q) - p;
  return q - err / (Math.exp(-q * q / 2) / Math.sqrt(2 * Math.PI));
}

const SUBTOTALS: Record<number, (args: FormulaValue[]) => FormulaValue> = {
  1: (args) => average(args),
  2: (args) => numbers(args).length,
  3: (args) => flatten(args).filter((item) => item !== "").length,
  4: (args) => {
    const nums = numbers(args);
    return nums.length ? Math.max(...nums) : 0;
  },
  5: (args) => {
    const nums = numbers(args);
    return nums.length ? Math.min(...nums) : 0;
  },
  9: (args) => numbers(args).reduce((a, b) => a + b, 0),
};

/** MAXIFS and MINIFS share SUMIFS' argument order: the values first, then range and criterion pairs. */
function extremeIf(name: string, args: FormulaValue[]): FormulaValue {
  const values = Array.isArray(args[0]) ? args[0] : [args[0] ?? ""];
  const rows = values.length;
  const matched: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    let ok = true;
    for (let i = 1; i + 1 < args.length; i += 2) {
      const range = args[i];
      const cell = Array.isArray(range) ? range[row] ?? "" : range ?? "";
      if (!matches(cell, args[i + 1])) {
        ok = false;
        break;
      }
    }
    if (ok) matched.push(row);
  }
  const nums = matched.map((row) => asNumber(values[row] ?? "")).filter((item): item is number => typeof item === "number");
  if (!nums.length) return 0;
  return name === "MAXIFS" ? Math.max(...nums) : Math.min(...nums);
}

function gcdLcm(name: string, args: FormulaValue[]): FormulaValue {
  const nums = numbers(args).map((item) => Math.trunc(Math.abs(item)));
  if (!nums.length) return E.VALUE();
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const value = nums.reduce((acc, item) => gcd(acc, item));
  if (name === "GCD") return value;
  return nums.reduce((acc, item) => (item === 0 ? 0 : acc / gcd(acc, item) * item), 1);
}

/** EVEN and ODD round away from zero to the next even or odd integer. */
function evenOdd(value: number, odd: boolean): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.ceil(Math.abs(value));
  const wanted = odd ? 1 : 0;
  return sign * (magnitude + (magnitude % 2 === wanted ? 0 : 1));
}

/** Week of the year. System 1 starts weeks on Sunday, 2 on Monday. */
function weekNumber(serial: number, system: number): number {
  const day = new Date(Math.round((serial - 25569) * 86400000));
  const start = Date.UTC(day.getUTCFullYear(), 0, 1);
  const firstWeekday = new Date(start).getUTCDay();
  const offset = system === 2 ? (firstWeekday + 6) % 7 : firstWeekday;
  const days = Math.round((day.getTime() - start) / 86400000);
  return Math.floor((days + offset) / 7) + 1;
}

/** ISO week number, where weeks start on Monday and week 1 holds the first Thursday. */
function isoWeekNumber(serial: number): number {
  const day = new Date(Math.round((serial - 25569) * 86400000));
  const thursday = new Date(day.getTime());
  thursday.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(4 - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 86400000 / 7);
}

function average(args: FormulaValue[]): FormulaValue {
  const nums = numbers(args);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0();
}

function conditional(name: string, range: FormulaValue | undefined, criterion: FormulaValue | undefined, sumRange: FormulaValue | undefined): FormulaValue {
  const values = Array.isArray(range) ? range : [range ?? ""];
  const sums = Array.isArray(sumRange) ? sumRange : values;
  const matched = values.map((item, index) => (matches(item, criterion) ? index : -1)).filter((index) => index >= 0);
  if (name === "COUNTIF") return matched.length;
  const nums = matched.map((index) => asNumber(sums[index] ?? 0)).filter((item): item is number => typeof item === "number");
  if (name === "AVERAGEIF") return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0();
  return nums.reduce((a, b) => a + b, 0);
}

function conditionals(name: string, args: FormulaValue[]): FormulaValue {
  const sums = args[0];
  const rows = Array.isArray(sums) ? sums.length : 1;
  const matched: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    let ok = true;
    for (let i = 1; i + 1 < args.length; i += 2) {
      const range = args[i];
      const value = Array.isArray(range) ? range[row] ?? "" : range ?? "";
      if (!matches(value, args[i + 1])) {
        ok = false;
        break;
      }
    }
    if (ok) matched.push(row);
  }
  if (name === "COUNTIFS") return matched.length;
  const nums = matched.map((row) => asNumber(Array.isArray(sums) ? sums[row] ?? 0 : sums ?? 0)).filter((item): item is number => typeof item === "number");
  if (name === "AVERAGEIFS") return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0();
  return nums.reduce((a, b) => a + b, 0);
}

function matches(value: FormulaValue | undefined, criterion: FormulaValue | undefined): boolean {
  const probe = Array.isArray(criterion) ? criterion[0] : criterion;
  if (probe instanceof FormulaError) return false;
  const cell = value ?? "";
  if (typeof probe === "string") {
    const op = /^(>=|<=|<>|>|<|=)(.*)$/.exec(probe);
    if (op) return compare(cell, coerceCellText(op[2] ?? ""), op[1]!) === true;
    if (probe.includes("*") || probe.includes("?")) {
      return new RegExp(`^${wildcardPattern(probe)}$`, "i").test(String(cell));
    }
  }
  return compare(cell, probe ?? "", "=") === true;
}

function sameValue(left: FormulaValue | undefined, right: FormulaValue | undefined): boolean {
  return compare(left ?? "", right ?? "", "=") === true;
}

/** Excel FIND/SEARCH position, or -1. SEARCH ignores case and treats `?` and `*` as wildcards. */
function findText(haystack: string, needle: string, from: number, wildcard: boolean): number {
  if (!wildcard) return haystack.indexOf(needle, from);
  const source = wildcardPattern(needle);
  const found = new RegExp(source, "i").exec(haystack.slice(from));
  return found ? from + (found.index ?? 0) : -1;
}

function wildcardPattern(text: string): string {
  let pattern = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (char === "~" && (text[i + 1] === "*" || text[i + 1] === "?" || text[i + 1] === "~")) {
      pattern += `\\${text[i + 1]}`;
      i += 1;
    } else if (char === "*") pattern += ".*";
    else if (char === "?") pattern += ".";
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return pattern;
}

interface RangeFlags {
  width?: number;
  hidden?: boolean[];
  subtotals?: boolean[];
  origin?: RangeOrigin;
}

function tagRange(values: FormulaPrimitive[], width: number, hidden: boolean[], subtotals: boolean[], origin?: RangeOrigin): FormulaPrimitive[] {
  Object.defineProperty(values, "width", { value: Math.max(1, width), enumerable: false });
  Object.defineProperty(values, "hidden", { value: hidden, enumerable: false });
  Object.defineProperty(values, "subtotals", { value: subtotals, enumerable: false });
  if (origin) Object.defineProperty(values, "origin", { value: origin, enumerable: false });
  return values;
}

function withWidth(values: FormulaPrimitive[], width: number): FormulaPrimitive[] {
  return tagRange(values, width, values.map(() => false), values.map(() => false));
}

function rangeWidth(table: FormulaPrimitive[]): number {
  const width = (table as RangeFlags).width;
  return typeof width === "number" && width > 0 ? width : 1;
}

/** SUBTOTAL drops nested SUBTOTAL cells, and codes 101+ also drop filtered rows. */
function visibleArgs(args: FormulaValue[], skipHidden: boolean): FormulaValue[] {
  return args.map((arg) => {
    if (!Array.isArray(arg)) return arg;
    const flags = arg as FormulaPrimitive[] & RangeFlags;
    const kept = arg.filter((_item, index) => !(flags.subtotals?.[index] ?? false) && !(skipHidden && (flags.hidden?.[index] ?? false)));
    return tagRange(kept, rangeWidth(arg), [], []);
  });
}

function rowOf(value: FormulaValue | undefined, ctx: EvalContext): number {
  const origin = rangeOrigin(value);
  if (origin) return origin.r1;
  const parsed = value === undefined ? undefined : parseA1(asText(value));
  return parsed?.row ?? ctx.row;
}

function columnOf(value: FormulaValue | undefined, ctx: EvalContext): number {
  const origin = rangeOrigin(value);
  if (origin) return origin.c1;
  const parsed = value === undefined ? undefined : parseA1(asText(value));
  return parsed?.col ?? ctx.col;
}

function rowsOf(value: FormulaValue | undefined): number {
  const origin = rangeOrigin(value);
  if (origin) return origin.r2 - origin.r1 + 1;
  return Array.isArray(value) ? Math.ceil(value.length / rangeWidth(value)) : 1;
}

function columnsOf(value: FormulaValue | undefined): number {
  const origin = rangeOrigin(value);
  if (origin) return origin.c2 - origin.c1 + 1;
  return Array.isArray(value) ? rangeWidth(value) : 1;
}

function rangeOrigin(value: FormulaValue | undefined): RangeOrigin | undefined {
  if (!Array.isArray(value)) return undefined;
  return (value as RangeFlags).origin;
}

/** A1 column letters for a zero-based column. */
function columnName(col: number): string {
  let name = "";
  let rest = col + 1;
  while (rest > 0) {
    rest -= 1;
    name = String.fromCharCode(65 + (rest % 26)) + name;
    rest = Math.floor(rest / 26);
  }
  return name;
}

/** OFFSET moves a range by rows and columns, and can resize it. */
function offsetRange(ctx: EvalContext, args: FormulaValue[]): FormulaValue {
  const origin = rangeOrigin(args[0]);
  if (!origin) return E.VALUE();
  const rows = asNumber(args[1] ?? 0);
  const cols = asNumber(args[2] ?? 0);
  const height = args[3] === undefined ? origin.r2 - origin.r1 + 1 : asNumber(args[3]);
  const width = args[4] === undefined ? origin.c2 - origin.c1 + 1 : asNumber(args[4]);
  if (rows instanceof FormulaError) return rows;
  if (cols instanceof FormulaError) return cols;
  if (height instanceof FormulaError) return height;
  if (width instanceof FormulaError) return width;
  if (height < 1 || width < 1) return E.REF();
  const r1 = origin.r1 + Math.trunc(rows);
  const c1 = origin.c1 + Math.trunc(cols);
  if (r1 < 0 || c1 < 0) return E.REF();
  const values = readRange(ctx.workbook, origin.sheetIndex, { row: r1, col: c1 }, { row: r1 + Math.trunc(height) - 1, col: c1 + Math.trunc(width) - 1 });
  return values.length === 1 ? values[0] ?? "" : values;
}

/** INDIRECT reads whatever range the text names, on the current sheet unless the text names one. */
function indirectRange(ctx: EvalContext, args: FormulaValue[]): FormulaValue {
  const text = asText(args[0] ?? "").trim();
  const bang = text.lastIndexOf("!");
  const sheetName = bang < 0 ? undefined : text.slice(0, bang).replace(/^'|'$/g, "").replace(/''/g, "'");
  const body = bang < 0 ? text : text.slice(bang + 1);
  const [startText, endText] = body.split(":");
  const start = parseA1(startText ?? "");
  const end = parseA1(endText ?? startText ?? "");
  if (!start || !end) return E.REF();
  const sheetIndex = sheetName === undefined ? ctx.sheetIndex : findSheet(ctx.workbook, sheetName);
  if (sheetIndex < 0) return E.REF();
  const values = readRange(ctx.workbook, sheetIndex, start, end);
  return values.length === 1 ? values[0] ?? "" : values;
}

function scalar(value: FormulaValue | undefined): FormulaPrimitive | FormulaError {
  if (isPending(value)) return E.NAME();
  if (isLambda(value)) return E.VALUE();
  if (Array.isArray(value) && value.length === 1) return scalar(value[0] ?? "");
  if (value instanceof FormulaError) return value;
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** Exact lookup: numbers match numbers, text is case-insensitive, and `?` `*` are wildcards. */
function lookupEqual(cell: FormulaPrimitive, needle: FormulaPrimitive): boolean {
  if (typeof needle === "number") return typeof cell === "number" && cell === needle;
  const text = String(needle);
  if (text.includes("*") || text.includes("?")) return new RegExp(`^${wildcardPattern(text)}$`, "i").test(String(cell));
  return String(cell).toLowerCase() === text.toLowerCase();
}

/** Approximate match. `direction` -1 finds the largest value at or below the needle, 1 the smallest at or above. */
function approxIndex(table: FormulaPrimitive[], needle: FormulaPrimitive, direction: 1 | -1): number {
  const probe = asNumber(needle);
  if (probe instanceof FormulaError) return -1;
  let found = -1;
  let best = 0;
  table.forEach((item, index) => {
    const cell = asNumber(item);
    if (cell instanceof FormulaError) return;
    const fits = direction < 0 ? cell <= probe : cell >= probe;
    if (!fits) return;
    if (found < 0 || (direction < 0 ? cell > best : cell < best)) {
      found = index;
      best = cell;
    }
  });
  return found;
}

/** Excel's MD ignores months and YD ignores years, borrowing a month or a year when the day falls short. */
function datedifDays(from: Date, to: Date, unit: "MD" | "YD"): number {
  let year = to.getUTCFullYear();
  const month = unit === "MD" ? to.getUTCMonth() : from.getUTCMonth();
  let borrow = 0;
  if (unit === "MD" && to.getUTCDate() < from.getUTCDate()) borrow = 1;
  if (unit === "YD" && (from.getUTCMonth() > to.getUTCMonth() || (from.getUTCMonth() === to.getUTCMonth() && from.getUTCDate() > to.getUTCDate()))) year -= 1;
  const endMonth = month - borrow;
  const last = new Date(Date.UTC(year, endMonth + 1, 0)).getUTCDate();
  const start = Date.UTC(year, endMonth, Math.min(from.getUTCDate(), last));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((end - start) / 86400000);
}

/** Ordinary annuity: payments at the end of each period, or at the beginning when `due` is 1. */
function finance(name: string, args: FormulaValue[]): FormulaValue {
  const nums = args.map((arg) => asNumber(arg ?? 0));
  const bad = nums.find((item) => item instanceof FormulaError);
  if (bad instanceof FormulaError) return bad;
  const [first = 0, second = 0, third = 0, fourth = 0, fifth = 0, sixth = 0] = nums as number[];
  const due = (type: number): number => (type ? 1 : 0);
  if (name === "PMT") {
    const [rate, nper, pv, fv = 0, type = 0] = [first, second, third, fourth, fifth];
    if (rate === 0) return nper === 0 ? E.NUM() : -(pv + fv) / nper;
    const grown = (1 + rate) ** nper;
    return (-(pv * grown + fv) * rate) / ((1 + rate * due(type)) * (grown - 1));
  }
  if (name === "PV") {
    const [rate, nper, pmt, fv = 0, type = 0] = [first, second, third, fourth, fifth];
    if (rate === 0) return -(fv + pmt * nper);
    const grown = (1 + rate) ** nper;
    return -(fv + pmt * (1 + rate * due(type)) * (grown - 1) / rate) / grown;
  }
  if (name === "FV") {
    const [rate, nper, pmt, pv = 0, type = 0] = [first, second, third, fourth, fifth];
    if (rate === 0) return -(pv + pmt * nper);
    const grown = (1 + rate) ** nper;
    return -(pv * grown + pmt * (1 + rate * due(type)) * (grown - 1) / rate);
  }
  if (name === "NPER") {
    const [rate, pmt, pv, fv = 0, type = 0] = [first, second, third, fourth, fifth];
    if (rate === 0) return pmt === 0 ? E.NUM() : -(pv + fv) / pmt;
    const paid = pmt * (1 + rate * due(type));
    if (paid + pv * rate === 0) return E.NUM();
    return Math.log((paid - fv * rate) / (paid + pv * rate)) / Math.log(1 + rate);
  }
  if (name === "IPMT" || name === "PPMT") {
    const [rate, per, nper, pv, fv = 0, type = 0] = [first, second, third, fourth, fifth, sixth];
    if (per < 1 || per > nper) return E.NUM();
    const payment = finance("PMT", [rate, nper, pv, fv, type]);
    if (typeof payment !== "number") return payment;
    const grown = finance("FV", [rate, per - 1, payment, pv, type]);
    if (typeof grown !== "number") return grown;
    const interest = type && per === 1 ? 0 : -grown * rate;
    return name === "IPMT" ? interest : payment - interest;
  }
  const [nper, pmt, pv, fv = 0, type = 0, guess = 0.1] = [first, second, third, fourth, fifth, sixth];
  return solveRate(nper, pmt, pv, fv, type, guess);
}

function solveRate(nper: number, pmt: number, pv: number, fv: number, type: number, guess: number): FormulaValue {
  let rate = guess;
  for (let step = 0; step < 50; step += 1) {
    if (rate <= -1) return E.NUM();
    const grown = (1 + rate) ** nper;
    const due = type ? 1 : 0;
    const value = pv * grown + pmt * (1 + rate * due) * (grown - 1) / rate + fv;
    const slope = pv * nper * (1 + rate) ** (nper - 1) +
      (pmt * (1 + rate * due) * (nper * rate * (1 + rate) ** (nper - 1) - (grown - 1))) / rate ** 2 +
      (pmt * due * (grown - 1)) / rate;
    if (slope === 0) return E.NUM();
    const next = rate - value / slope;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }
  return E.NUM();
}

function internalRate(values: number[], guess: number): FormulaValue {
  if (!values.some((item) => item > 0) || !values.some((item) => item < 0)) return E.NUM();
  let rate = guess;
  for (let step = 0; step < 50; step += 1) {
    if (rate <= -1) return E.NUM();
    let value = 0;
    let slope = 0;
    values.forEach((item, index) => {
      value += item / (1 + rate) ** index;
      slope -= (index * item) / (1 + rate) ** (index + 1);
    });
    if (slope === 0) return E.NUM();
    const next = rate - value / slope;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }
  return E.NUM();
}

function variance(args: FormulaValue[], population: boolean): FormulaValue {
  const nums = numbers(args);
  const divisor = nums.length - (population ? 0 : 1);
  if (divisor <= 0) return E.DIV0();
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((sum, item) => sum + (item - mean) ** 2, 0) / divisor;
}

function stdev(args: FormulaValue[], population: boolean): FormulaValue {
  const spread = variance(args, population);
  return typeof spread === "number" ? Math.sqrt(spread) : spread;
}

function modeOf(nums: number[]): FormulaValue {
  if (!nums.length) return E.NUM();
  const counts = new Map<number, number>();
  for (const item of nums) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best = nums[0]!;
  let seen = 0;
  for (const [value, count] of counts) {
    if (count > seen) {
      best = value;
      seen = count;
    }
  }
  return seen > 1 ? best : E.NA();
}

function percentile(nums: number[], k: number): FormulaValue {
  if (!nums.length || k < 0 || k > 1) return E.NUM();
  const sorted = [...nums].sort((a, b) => a - b);
  const position = k * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * fraction;
}

function correl(left: number[], right: number[]): FormulaValue {
  const length = Math.min(left.length, right.length);
  if (length < 2) return E.DIV0();
  const xs = left.slice(0, length);
  const ys = right.slice(0, length);
  const mean = (list: number[]): number => list.reduce((a, b) => a + b, 0) / list.length;
  const mx = mean(xs);
  const my = mean(ys);
  let cross = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < length; i += 1) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    cross += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  return vx === 0 || vy === 0 ? E.DIV0() : cross / Math.sqrt(vx * vy);
}

function mathFn(name: string, args: FormulaValue[]): FormulaValue {
  if (name === "PI") return Math.PI;
  const n = asNumber(args[0] ?? 0);
  if (n instanceof FormulaError) return n;
  if (name === "LN") return n > 0 ? Math.log(n) : E.NUM();
  if (name === "LOG10") return n > 0 ? Math.log10(n) : E.NUM();
  if (name === "LOG") {
    const base = asNumber(args[1] ?? 10);
    if (base instanceof FormulaError) return base;
    return n > 0 && base > 0 && base !== 1 ? Math.log(n) / Math.log(base) : E.NUM();
  }
  if (name === "EXP") return Math.exp(n);
  if (name === "SIN") return Math.sin(n);
  if (name === "COS") return Math.cos(n);
  if (name === "TAN") return Math.tan(n);
  if (name === "ASIN" || name === "ACOS") return n < -1 || n > 1 ? E.NUM() : name === "ASIN" ? Math.asin(n) : Math.acos(n);
  if (name === "ATAN") return Math.atan(n);
  if (name === "ATAN2") {
    const y = asNumber(args[1] ?? 0);
    if (y instanceof FormulaError) return y;
    return n === 0 && y === 0 ? E.DIV0() : Math.atan2(y, n);
  }
  if (name === "SIGN") return Math.sign(n);
  if (name === "RADIANS") return (n * Math.PI) / 180;
  if (name === "DEGREES") return (n * 180) / Math.PI;
  if (name === "FACT") {
    if (n < 0 || !Number.isInteger(n) || n > 170) return E.NUM();
    let out = 1;
    for (let i = 2; i <= n; i += 1) out *= i;
    return out;
  }
  const k = asNumber(args[1] ?? 0);
  if (k instanceof FormulaError) return k;
  if (n < 0 || k < 0 || k > n || !Number.isInteger(n) || !Number.isInteger(k)) return E.NUM();
  let out = 1;
  for (let i = 1; i <= k; i += 1) out = (out * (n - k + i)) / i;
  return out;
}

function workday(start: number, days: number): number {
  const step = days >= 0 ? 1 : -1;
  let left = Math.abs(Math.trunc(days));
  let day = Math.round(start);
  while (left > 0) {
    day += step;
    const weekday = new Date(Math.round((day - 25569) * 86400000)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return day;
}

function yearFrac(start: number, end: number, basis: number): FormulaValue {
  const [from, to] = start <= end ? [start, end] : [end, start];
  if (basis === 1) return (to - from) / (new Date(Date.UTC(new Date((from - 25569) * 86400000).getUTCFullYear(), 1, 29)).getUTCMonth() === 1 ? 366 : 365);
  if (basis === 2) return (to - from) / 360;
  if (basis === 3) return (to - from) / 365;
  if (basis !== 0 && basis !== 4) return E.NUM();
  const a = new Date(Math.round((from - 25569) * 86400000));
  const b = new Date(Math.round((to - 25569) * 86400000));
  const day = (date: Date): number => Math.min(date.getUTCDate(), 30);
  const days = 360 * (b.getUTCFullYear() - a.getUTCFullYear()) + 30 * (b.getUTCMonth() - a.getUTCMonth()) + day(b) - day(a);
  return days / 360;
}

const BASE_DIGITS = "0123456789ABCDEF";

function baseConvert(name: string, args: FormulaValue[]): FormulaValue {
  const [from, to] = name.split("2") as [string, string];
  const raw = asText(args[0] ?? "").trim().toUpperCase();
  const source = from === "DEC" ? 10 : from === "BIN" ? 2 : from === "OCT" ? 8 : 16;
  const target = to === "DEC" ? 10 : to === "BIN" ? 2 : to === "OCT" ? 8 : 16;
  const digits = raw.startsWith("-") ? raw.slice(1) : raw;
  if (!digits || [...digits].some((char) => BASE_DIGITS.indexOf(char) < 0 || BASE_DIGITS.indexOf(char) >= source)) return E.NUM();
  const magnitude = parseInt(digits, source);
  const value = raw.startsWith("-") ? -magnitude : magnitude;
  if (to === "DEC") return value;
  if (value < 0) return E.NUM();
  const places = asNumber(args[1] ?? 0);
  if (args[1] !== undefined && places instanceof FormulaError) return places;
  const out = value.toString(target).toUpperCase();
  if (out.length > 10) return E.NUM();
  return typeof places === "number" && places > out.length ? out.padStart(Math.min(10, Math.floor(places)), "0") : out;
}

const UNITS: Record<string, { group: string; factor: number }> = {
  m: { group: "length", factor: 1 },
  km: { group: "length", factor: 1000 },
  cm: { group: "length", factor: 0.01 },
  mm: { group: "length", factor: 0.001 },
  in: { group: "length", factor: 0.0254 },
  ft: { group: "length", factor: 0.3048 },
  yd: { group: "length", factor: 0.9144 },
  mi: { group: "length", factor: 1609.344 },
  g: { group: "mass", factor: 1 },
  kg: { group: "mass", factor: 1000 },
  mg: { group: "mass", factor: 0.001 },
  lb: { group: "mass", factor: 453.59237 },
  oz: { group: "mass", factor: 28.349523125 },
  l: { group: "volume", factor: 1 },
  ml: { group: "volume", factor: 0.001 },
  gal: { group: "volume", factor: 3.785411784 },
  c: { group: "temp", factor: 1 },
  f: { group: "temp", factor: 1 },
  k: { group: "temp", factor: 1 },
};

function convertUnit(value: number, from: string, to: string): FormulaValue {
  const source = UNITS[from.toLowerCase()];
  const target = UNITS[to.toLowerCase()];
  if (!source || !target || source.group !== target.group) return E.NA();
  if (source.group === "temp") {
    const unit = (code: string): string => code.toLowerCase();
    const kelvin = unit(from) === "k" ? value : unit(from) === "f" ? (value - 32) * 5 / 9 + 273.15 : value + 273.15;
    if (unit(to) === "k") return kelvin;
    if (unit(to) === "f") return (kelvin - 273.15) * 9 / 5 + 32;
    return kelvin - 273.15;
  }
  return (value * source.factor) / target.factor;
}

export { formatNumber } from "./format";

export function setFormula(cell: SheetCell, formula: string): void {
  const body = formula.startsWith("=") ? formula.slice(1) : formula;
  cell.formula = body;
}
