import { formatNumber } from "./format.js";
export class FormulaError {
    code;
    constructor(code) {
        this.code = code;
    }
    toString() {
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
/** Recalculate every formula cell. Display results go into `value`; `formula` stays. */
export function recalculate(workbook) {
    for (let s = 0; s < workbook.sheets.length; s += 1) {
        const sheet = workbook.sheets[s];
        for (let r = 0; r < sheet.cells.length; r += 1) {
            const line = sheet.cells[r];
            if (!line)
                continue;
            for (let c = 0; c < line.length; c += 1) {
                const cell = line[c];
                if (!cell?.formula)
                    continue;
                const result = evaluate(`=${cell.formula}`, { workbook, sheetIndex: s, row: r, col: c });
                cell.value = formatResult(result);
            }
        }
    }
}
export function evaluate(input, ctx) {
    const text = input.startsWith("=") ? input.slice(1) : input;
    if (!text.trim())
        return "";
    try {
        const tokens = tokenize(text);
        const parser = new Parser(tokens, ctx);
        const value = parser.parseExpression();
        if (parser.notDone())
            return E.VALUE();
        return value;
    }
    catch (err) {
        if (err instanceof FormulaError)
            return err;
        return E.VALUE();
    }
}
/** Combine the source ranges into the destination sheet. Stores the definition so it reads back. */
export function consolidateRanges(workbook, spec) {
    const dest = parseSource(spec.dest);
    const sheet = dest ? workbook.sheets[findSheet(workbook, dest.sheet)] : undefined;
    const func = spec.func ?? "sum";
    const consolidation = {
        func,
        sources: spec.sources,
        dest: spec.dest,
        ...(spec.topRow ? { topRow: true } : {}),
        ...(spec.leftCol ? { leftCol: true } : {}),
        ...(spec.links ? { links: true } : {}),
    };
    if (!dest || !sheet)
        return consolidation;
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
            const picks = spots.flatMap((key, source) => valueAt(grids[source], key.row + top, key.col + left));
            const cell = ensureCell(sheet, dest.row + rowOffset + row, dest.col + colOffset + col);
            const result = reduceNumbers(picks, func);
            if (spec.links && picks.length) {
                cell.formula = linkFormula(grids, spots, top, left, func);
                cell.value = typeof result === "number" ? formatResult(result) : "";
            }
            else {
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
function readSource(workbook, source) {
    const parsed = parseSource(source);
    const empty = { sheet: "", row: 0, col: 0, rows: 0, cols: 0, values: [], text: [] };
    if (!parsed)
        return empty;
    const sheet = workbook.sheets[findSheet(workbook, parsed.sheet)];
    if (!sheet)
        return { ...empty, sheet: parsed.sheet };
    const values = [];
    const text = [];
    for (let row = 0; row < parsed.rows; row += 1) {
        const line = [];
        const labels = [];
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
function parseSource(source) {
    const match = /^([^!]+)!(.+)$/.exec(source.trim());
    if (!match)
        return undefined;
    const sheet = (match[1] ?? "").replace(/^'|'$/g, "").replace(/''/g, "'").toUpperCase();
    const parts = (match[2] ?? "").split(":");
    const start = parseA1(parts[0] ?? "");
    const end = parseA1(parts[1] ?? parts[0] ?? "");
    if (!start || !end)
        return undefined;
    const row = Math.min(start.row, end.row);
    const col = Math.min(start.col, end.col);
    return { sheet, row, col, rows: Math.abs(end.row - start.row) + 1, cols: Math.abs(end.col - start.col) + 1 };
}
function labelKeys(grids, top, left) {
    const rowLabels = [];
    const colLabels = [];
    for (const grid of grids) {
        for (let row = top; row < grid.rows; row += 1) {
            const label = left ? grid.text[row]?.[0] ?? "" : String(row - top + 1);
            if (label && !rowLabels.includes(label))
                rowLabels.push(label);
        }
        for (let col = left; col < grid.cols; col += 1) {
            const label = top ? grid.text[0]?.[col] ?? "" : String(col - left + 1);
            if (label && !colLabels.includes(label))
                colLabels.push(label);
        }
    }
    const keys = rowLabels.map((rowLabel) => colLabels.map((colLabel) => grids.map((grid) => {
        const rowAt = left ? grid.text.findIndex((line, index) => index >= top && line[0] === rowLabel) : top + rowLabels.indexOf(rowLabel);
        const colAt = top ? (grid.text[0] ?? []).findIndex((label, index) => index >= left && label === colLabel) : left + colLabels.indexOf(colLabel);
        return { row: rowAt - top, col: colAt - left };
    })));
    return { rowLabels: left ? rowLabels : [], colLabels: top ? colLabels : [], keys };
}
function valueAt(grid, row, col) {
    const value = grid.values[row]?.[col];
    return value == null ? [] : [value];
}
function reduceNumbers(values, func) {
    if (!values.length && func !== "count" && func !== "countNums")
        return undefined;
    const total = values.reduce((sum, value) => sum + value, 0);
    const count = func === "count" || func === "countNums" ? values.length : values.length;
    if (func === "count" || func === "countNums")
        return count;
    if (func === "average")
        return count ? total / count : undefined;
    if (func === "max")
        return Math.max(...values);
    if (func === "min")
        return Math.min(...values);
    if (func === "product")
        return values.reduce((product, value) => product * value, 1);
    if (func === "stdev" || func === "stdevp") {
        const divisor = func === "stdev" ? count - 1 : count;
        if (divisor <= 0)
            return undefined;
        const mean = total / count;
        return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / divisor);
    }
    if (func === "var" || func === "varp") {
        const divisor = func === "var" ? count - 1 : count;
        if (divisor <= 0)
            return undefined;
        const mean = total / count;
        return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / divisor;
    }
    return total;
}
function linkFormula(grids, spots, top, left, func) {
    const refs = grids.flatMap((grid, index) => {
        const spot = spots[index];
        if (!spot)
            return [];
        const row = spot.row + top;
        const col = spot.col + left;
        if (grid.values[row]?.[col] == null)
            return [];
        return [`'${grid.sheet.replace(/'/g, "''")}'!${columnLetters(grid.col + col)}${grid.row + row + 1}`];
    });
    const name = func === "countNums" ? "COUNT" : func === "stdev" ? "STDEV" : func === "var" ? "VAR" : func.toUpperCase();
    return refs.length === 1 && func === "sum" ? refs[0] : `${name}(${refs.join(",")})`;
}
function columnLetters(index) {
    let name = "";
    let next = index + 1;
    while (next > 0) {
        next -= 1;
        name = String.fromCharCode(65 + (next % 26)) + name;
        next = Math.floor(next / 26);
    }
    return name;
}
function ensureCell(sheet, row, col) {
    const line = sheet.cells[row] ?? [];
    sheet.cells[row] = line;
    const cell = line[col] ?? { value: "" };
    line[col] = cell;
    return cell;
}
export function formatResult(value) {
    if (value instanceof FormulaError)
        return value.code;
    if (Array.isArray(value))
        return value.map((item) => formatResult(item)).join(",");
    if (typeof value === "boolean")
        return value ? "TRUE" : "FALSE";
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            return E.NUM().code;
        if (Number.isInteger(value))
            return String(value);
        return String(Math.round(value * 1e10) / 1e10);
    }
    return value;
}
function tokenize(text) {
    const out = [];
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            i += 1;
            continue;
        }
        if (ch === "'") {
            let j = i + 1;
            let value = "";
            while (j < text.length) {
                const c = text[j];
                if (c === "'" && text[j + 1] === "'") {
                    value += "'";
                    j += 2;
                    continue;
                }
                if (c === "'")
                    break;
                value += c;
                j += 1;
            }
            if (text[j] !== "'")
                throw E.VALUE();
            out.push({ kind: "id", value: value.toUpperCase() });
            i = j + 1;
            continue;
        }
        if (ch === "\"") {
            let j = i + 1;
            let value = "";
            while (j < text.length) {
                const c = text[j];
                if (c === "\"" && text[j + 1] === "\"") {
                    value += "\"";
                    j += 2;
                    continue;
                }
                if (c === "\"")
                    break;
                value += c;
                j += 1;
            }
            out.push({ kind: "str", value });
            i = j + 1;
            continue;
        }
        if (/[0-9.]/.test(ch)) {
            let j = i + 1;
            while (j < text.length && /[0-9.]/.test(text[j]))
                j += 1;
            const raw = text.slice(i, j);
            const num = Number(raw);
            if (!Number.isFinite(num))
                throw E.VALUE();
            out.push({ kind: "num", value: num });
            i = j;
            continue;
        }
        if (/[A-Za-z_$一-鿿]/.test(ch)) {
            let j = i + 1;
            while (j < text.length && /[A-Za-z0-9_$一-鿿.]/.test(text[j]))
                j += 1;
            const raw = text.slice(i, j);
            if (/^\$?[A-Za-z]+\$?\d+$/.test(raw))
                out.push({ kind: "ref", value: raw.toUpperCase() });
            else
                out.push({ kind: "id", value: raw.toUpperCase() });
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
            }
            else if (ch === "<" && text[i + 1] === ">") {
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
    tokens;
    ctx;
    i = 0;
    constructor(tokens, ctx) {
        this.tokens = tokens;
        this.ctx = ctx;
    }
    notDone() {
        return this.i < this.tokens.length;
    }
    peek() {
        return this.tokens[this.i];
    }
    take() {
        const token = this.tokens[this.i];
        if (!token)
            throw E.VALUE();
        this.i += 1;
        return token;
    }
    parseExpression() {
        return this.parseCompare();
    }
    parseCompare() {
        let left = this.parseConcat();
        while (this.peek()?.kind === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(this.peek().value)) {
            const op = this.take().value;
            const right = this.parseConcat();
            left = compare(left, right, op);
        }
        return left;
    }
    parseConcat() {
        let left = this.parseAdd();
        while (this.peek()?.kind === "op" && this.peek().value === "&") {
            this.take();
            const right = this.parseAdd();
            if (left instanceof FormulaError)
                return left;
            if (right instanceof FormulaError)
                return right;
            left = `${asText(left)}${asText(right)}`;
        }
        return left;
    }
    parseAdd() {
        let left = this.parseMul();
        while (this.peek()?.kind === "op" && ["+", "-"].includes(this.peek().value)) {
            const op = this.take().value;
            const right = this.parseMul();
            left = binaryNum(left, right, op === "+" ? (a, b) => a + b : (a, b) => a - b);
        }
        return left;
    }
    parseMul() {
        let left = this.parsePow();
        while (this.peek()?.kind === "op" && ["*", "/"].includes(this.peek().value)) {
            const op = this.take().value;
            const right = this.parsePow();
            left = binaryNum(left, right, op === "*" ? (a, b) => a * b : (a, b) => (b === 0 ? E.DIV0() : a / b));
        }
        return left;
    }
    parsePow() {
        let left = this.parseUnary();
        while (this.peek()?.kind === "op" && this.peek().value === "^") {
            this.take();
            const right = this.parseUnary();
            left = binaryNum(left, right, (a, b) => a ** b);
        }
        return left;
    }
    parseUnary() {
        if (this.peek()?.kind === "op" && this.peek().value === "+") {
            this.take();
            return this.parseUnary();
        }
        if (this.peek()?.kind === "op" && this.peek().value === "-") {
            this.take();
            const value = this.parseUnary();
            return binaryNum(0, value, (a, b) => a - b);
        }
        let value = this.parsePrimary();
        if (this.peek()?.kind === "op" && this.peek().value === "%") {
            this.take();
            value = binaryNum(value, 100, (a, b) => a / b);
        }
        return value;
    }
    parsePrimary() {
        const token = this.peek();
        if (!token)
            throw E.VALUE();
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
            if (this.peek()?.kind !== "rp")
                throw E.VALUE();
            this.take();
            return value;
        }
        if (token.kind === "ref" || token.kind === "id") {
            return this.parseRefOrCall();
        }
        throw E.VALUE();
    }
    parseRefOrCall() {
        const first = this.take();
        if (first.kind !== "ref" && first.kind !== "id")
            throw E.VALUE();
        // SheetName!A1 or SheetName!A1:B2
        if (this.peek()?.kind === "bang") {
            this.take();
            const sheetName = first.value;
            const next = this.take();
            if (next.kind !== "ref" && next.kind !== "id")
                throw E.REF();
            return this.parseRangeTail(sheetName, next.value);
        }
        if (first.kind === "id" && this.peek()?.kind === "lp") {
            this.take();
            const args = [];
            if (this.peek()?.kind !== "rp") {
                args.push(this.parseExpression());
                while (this.peek()?.kind === "comma") {
                    this.take();
                    args.push(this.parseExpression());
                }
            }
            if (this.peek()?.kind !== "rp")
                throw E.VALUE();
            this.take();
            return callFunction(first.value, args, this.ctx);
        }
        if (first.kind === "id" && (first.value === "TRUE" || first.value === "FALSE")) {
            return first.value === "TRUE";
        }
        return this.parseRangeTail(undefined, first.value);
    }
    parseRangeTail(sheetName, startRef) {
        let endRef = startRef;
        if (this.peek()?.kind === "colon") {
            this.take();
            const next = this.take();
            if (next.kind !== "ref" && next.kind !== "id")
                throw E.REF();
            endRef = next.value;
        }
        const start = parseA1(startRef);
        const end = parseA1(endRef);
        if (!start || !end) {
            // bare identifier used as name
            if (!sheetName && startRef === endRef) {
                const named = this.ctx.workbook.names?.find((item) => item.name.toUpperCase() === startRef);
                if (named)
                    return evaluate(named.refersTo.startsWith("=") ? named.refersTo : `=${named.refersTo}`, this.ctx);
            }
            throw E.NAME();
        }
        const sheetIndex = sheetName ? findSheet(this.ctx.workbook, sheetName) : this.ctx.sheetIndex;
        if (sheetIndex < 0)
            return E.REF();
        const values = readRange(this.ctx.workbook, sheetIndex, start, end);
        if (start.row === end.row && start.col === end.col)
            return values[0] ?? "";
        return values;
    }
}
function parseA1(ref) {
    const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
    if (!match)
        return undefined;
    let col = 0;
    for (const letter of match[1] ?? "")
        col = col * 26 + letter.charCodeAt(0) - 64;
    return { row: Number(match[2]) - 1, col: col - 1 };
}
function findSheet(workbook, name) {
    const needle = name.replace(/^'|'$/g, "").toUpperCase();
    return workbook.sheets.findIndex((sheet) => sheet.name.toUpperCase() === needle);
}
function readRange(workbook, sheetIndex, start, end) {
    const sheet = workbook.sheets[sheetIndex];
    if (!sheet)
        return [];
    const r1 = Math.min(start.row, end.row);
    const r2 = Math.max(start.row, end.row);
    const c1 = Math.min(start.col, end.col);
    const c2 = Math.max(start.col, end.col);
    const out = [];
    const hidden = [];
    const subtotals = [];
    const hiddenRows = new Set(sheet.hiddenRows ?? []);
    for (let r = r1; r <= r2; r += 1) {
        for (let c = c1; c <= c2; c += 1) {
            out.push(cellPrimitive(sheet, r, c, workbook, sheetIndex));
            hidden.push(hiddenRows.has(r));
            subtotals.push(/^SUBTOTAL\s*\(/i.test(sheet.cells[r]?.[c]?.formula ?? ""));
        }
    }
    return tagRange(out, c2 - c1 + 1, hidden, subtotals);
}
function cellPrimitive(sheet, row, col, workbook, sheetIndex) {
    const cell = sheet.cells[row]?.[col];
    if (!cell)
        return "";
    if (cell.formula) {
        // Use already-computed display when present and looks like a result; otherwise evaluate.
        if (cell.value && !cell.value.startsWith("#") && cell.value !== `=${cell.formula}` && cell.value.toUpperCase() !== cell.formula.toUpperCase()) {
            return coerceCellText(cell.value);
        }
        const nested = evaluate(`=${cell.formula}`, { workbook, sheetIndex, row, col });
        if (nested instanceof FormulaError)
            return nested.code;
        if (Array.isArray(nested))
            return nested[0] ?? "";
        return nested;
    }
    return coerceCellText(cell.value);
}
function coerceCellText(text) {
    if (text === "")
        return "";
    if (text === "TRUE")
        return true;
    if (text === "FALSE")
        return false;
    if (/^-?\d+(?:\.\d+)?$/.test(text))
        return Number(text);
    return text;
}
function flatten(args) {
    const out = [];
    for (const arg of args) {
        if (arg instanceof FormulaError)
            continue;
        if (Array.isArray(arg))
            out.push(...arg);
        else
            out.push(arg);
    }
    return out;
}
function numbers(args) {
    return flatten(args)
        .map((item) => (typeof item === "number" ? item : typeof item === "boolean" ? Number(item) : Number(item)))
        .filter((item) => Number.isFinite(item));
}
function asNumber(value) {
    if (value instanceof FormulaError)
        return value;
    if (Array.isArray(value))
        return asNumber(value[0] ?? "");
    if (typeof value === "number")
        return value;
    if (typeof value === "boolean")
        return value ? 1 : 0;
    if (value === "")
        return 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : E.VALUE();
}
function asText(value) {
    if (value instanceof FormulaError)
        return value.code;
    if (Array.isArray(value))
        return asText(value[0] ?? "");
    if (typeof value === "boolean")
        return value ? "TRUE" : "FALSE";
    return String(value);
}
function asBool(value) {
    if (value instanceof FormulaError)
        return value;
    if (Array.isArray(value))
        return asBool(value[0] ?? false);
    if (typeof value === "boolean")
        return value;
    if (typeof value === "number")
        return value !== 0;
    if (value === "TRUE")
        return true;
    if (value === "FALSE")
        return false;
    return E.VALUE();
}
function binaryNum(left, right, op) {
    const a = asNumber(left);
    if (a instanceof FormulaError)
        return a;
    const b = asNumber(right);
    if (b instanceof FormulaError)
        return b;
    return op(a, b);
}
function compare(left, right, op) {
    if (left instanceof FormulaError)
        return left;
    if (right instanceof FormulaError)
        return right;
    const l = Array.isArray(left) ? left[0] ?? "" : left;
    const r = Array.isArray(right) ? right[0] ?? "" : right;
    const ln = typeof l === "number" || (typeof l === "string" && /^-?\d+(?:\.\d+)?$/.test(l)) ? Number(l) : null;
    const rn = typeof r === "number" || (typeof r === "string" && /^-?\d+(?:\.\d+)?$/.test(r)) ? Number(r) : null;
    let cmp;
    if (ln !== null && rn !== null && Number.isFinite(ln) && Number.isFinite(rn))
        cmp = ln - rn;
    else
        cmp = String(l).localeCompare(String(r));
    if (op === "=")
        return cmp === 0;
    if (op === "<>")
        return cmp !== 0;
    if (op === "<")
        return cmp < 0;
    if (op === ">")
        return cmp > 0;
    if (op === "<=")
        return cmp <= 0;
    if (op === ">=")
        return cmp >= 0;
    return E.VALUE();
}
function callFunction(name, args, ctx) {
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
            if (cond instanceof FormulaError)
                return cond;
            return cond ? (args[1] ?? true) : (args[2] ?? false);
        }
        case "AND": {
            for (const arg of flatten(args)) {
                const b = asBool(arg);
                if (b instanceof FormulaError)
                    return b;
                if (!b)
                    return false;
            }
            return true;
        }
        case "OR": {
            for (const arg of flatten(args)) {
                const b = asBool(arg);
                if (b instanceof FormulaError)
                    return b;
                if (b)
                    return true;
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
            if (n instanceof FormulaError)
                return n;
            if (name === "ABS")
                return Math.abs(n);
            if (name === "SQRT")
                return n < 0 ? E.NUM() : Math.sqrt(n);
            return Math.trunc(n);
        }
        case "ROUND": {
            const n = asNumber(args[0] ?? 0);
            const d = asNumber(args[1] ?? 0);
            if (n instanceof FormulaError)
                return n;
            if (d instanceof FormulaError)
                return d;
            const f = 10 ** d;
            return Math.round(n * f) / f;
        }
        case "MOD": {
            const n = asNumber(args[0] ?? 0);
            const d = asNumber(args[1] ?? 0);
            if (n instanceof FormulaError)
                return n;
            if (d instanceof FormulaError)
                return d;
            if (d === 0)
                return E.DIV0();
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
            if (n instanceof FormulaError)
                return n;
            return name === "LEFT" ? text.slice(0, Math.max(0, n)) : text.slice(Math.max(0, text.length - n));
        }
        case "MID": {
            const text = asText(args[0] ?? "");
            const start = asNumber(args[1] ?? 1);
            const len = asNumber(args[2] ?? 0);
            if (start instanceof FormulaError)
                return start;
            if (len instanceof FormulaError)
                return len;
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
            if (primary instanceof FormulaError)
                return args[1] ?? "";
            return primary ?? "";
        }
        case "ROW":
            return (args[0] === undefined ? ctx.row : parseA1(asText(args[0]))?.row ?? ctx.row) + 1;
        case "COLUMN":
            return (args[0] === undefined ? ctx.col : parseA1(asText(args[0]))?.col ?? ctx.col) + 1;
        case "ROWS":
            return Array.isArray(args[0]) ? Math.ceil(args[0].length / rangeWidth(args[0])) : 1;
        case "COLUMNS":
            return Array.isArray(args[0]) ? rangeWidth(args[0]) : 1;
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
            if (serial instanceof FormulaError)
                return serial;
            const date = new Date(Math.round((serial - 25569) * 86400000));
            if (name === "YEAR")
                return date.getUTCFullYear();
            if (name === "MONTH")
                return date.getUTCMonth() + 1;
            return date.getUTCDate();
        }
        case "DATE": {
            const y = asNumber(args[0] ?? 1900);
            const m = asNumber(args[1] ?? 1);
            const d = asNumber(args[2] ?? 1);
            if (y instanceof FormulaError)
                return y;
            if (m instanceof FormulaError)
                return m;
            if (d instanceof FormulaError)
                return d;
            return Date.UTC(y, m - 1, d) / 86400000 + 25569;
        }
        case "VLOOKUP": {
            const needle = scalar(args[0]);
            const table = args[1];
            const col = asNumber(args[2] ?? 1);
            const approximate = args[3] === undefined ? true : asBool(args[3]);
            if (needle instanceof FormulaError)
                return needle;
            if (!(table instanceof Array) || col instanceof FormulaError)
                return E.VALUE();
            if (approximate instanceof FormulaError)
                return approximate;
            const cols = rangeWidth(table);
            const index = Math.max(1, Math.floor(col));
            if (index > cols)
                return E.REF();
            const column = [];
            for (let offset = 0; offset < table.length; offset += cols)
                column.push(table[offset] ?? "");
            const at = approximate ? approxIndex(column, needle, -1) : column.findIndex((cell) => lookupEqual(cell, needle));
            return at < 0 ? E.NA() : table[at * cols + index - 1] ?? E.NA();
        }
        case "XLOOKUP": {
            const needle = scalar(args[0]);
            const lookup = args[1];
            const result = args[2];
            const mode = asNumber(args[4] ?? 0);
            if (needle instanceof FormulaError)
                return needle;
            if (!(lookup instanceof Array) || !(result instanceof Array))
                return E.NA();
            if (mode instanceof FormulaError)
                return mode;
            const at = mode < 0 || mode === 1 ? approxIndex(lookup, needle, mode < 0 ? -1 : 1) : lookup.findIndex((item) => lookupEqual(item, needle));
            if (at < 0)
                return args[3] !== undefined ? scalar(args[3]) : E.NA();
            return result[at] ?? E.NA();
        }
        case "INDEX": {
            const table = args[0];
            const row = asNumber(args[1] ?? 1);
            const col = asNumber(args[2] ?? 1);
            if (!(table instanceof Array))
                return table ?? E.REF();
            if (row instanceof FormulaError)
                return row;
            if (col instanceof FormulaError)
                return col;
            if (args[2] === undefined)
                return table[Math.max(0, Math.floor(row) - 1)] ?? E.REF();
            const width = rangeWidth(table);
            return table[(Math.max(0, Math.floor(row) - 1)) * width + (Math.max(0, Math.floor(col) - 1))] ?? E.REF();
        }
        case "MATCH": {
            const needle = scalar(args[0]);
            const table = args[1];
            const mode = asNumber(args[2] ?? 0);
            if (needle instanceof FormulaError)
                return needle;
            if (!(table instanceof Array))
                return E.NA();
            if (mode instanceof FormulaError)
                return mode;
            const at = mode === 0 ? table.findIndex((item) => lookupEqual(item, needle)) : approxIndex(table, needle, mode > 0 ? -1 : 1);
            return at < 0 ? E.NA() : at + 1;
        }
        case "TEXT": {
            const value = asNumber(args[0] ?? 0);
            if (value instanceof FormulaError)
                return value;
            return formatNumber(value, asText(args[1] ?? "0"));
        }
        case "SEQUENCE": {
            const rows = asNumber(args[0] ?? 1);
            const cols = asNumber(args[1] ?? 1);
            const start = asNumber(args[2] ?? 1);
            const step = asNumber(args[3] ?? 1);
            if (rows instanceof FormulaError)
                return rows;
            if (cols instanceof FormulaError)
                return cols;
            if (start instanceof FormulaError)
                return start;
            if (step instanceof FormulaError)
                return step;
            const out = [];
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
            if (!(table instanceof Array))
                return table ?? E.VALUE();
            const seen = new Set();
            const out = [];
            for (const item of table) {
                const key = String(item);
                if (seen.has(key))
                    continue;
                seen.add(key);
                out.push(item);
            }
            return withWidth(out, rangeWidth(table));
        }
        case "SORT": {
            const table = args[0];
            if (!(table instanceof Array))
                return table ?? E.VALUE();
            return withWidth([...table].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })), rangeWidth(table));
        }
        case "FILTER": {
            const table = args[0];
            const include = args[1];
            if (!(table instanceof Array) || !(include instanceof Array))
                return E.VALUE();
            const width = rangeWidth(table);
            const out = [];
            for (let offset = 0, row = 0; offset < table.length; offset += width, row += 1) {
                if (!asBool(include[row] ?? false))
                    continue;
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
            return conditionals(name, args.length ? [args[0], ...args] : args);
        case "COUNTBLANK":
            return flatten(args).filter((item) => item === "").length;
        case "IFS": {
            for (let i = 0; i + 1 < args.length; i += 2) {
                const cond = asBool(args[i] ?? false);
                if (cond instanceof FormulaError)
                    return cond;
                if (cond)
                    return args[i + 1] ?? "";
            }
            return E.NA();
        }
        case "IFNA": {
            const primary = args[0];
            if (primary instanceof FormulaError && primary.code === "#N/A")
                return args[1] ?? "";
            return primary ?? "";
        }
        case "SWITCH": {
            const probe = args[0];
            for (let i = 1; i + 1 < args.length; i += 2) {
                if (sameValue(probe, args[i]))
                    return args[i + 1] ?? "";
            }
            return args.length % 2 === 0 ? (args[args.length - 1] ?? "") : E.NA();
        }
        case "FIND":
        case "SEARCH": {
            const needle = asText(args[0] ?? "");
            const haystack = asText(args[1] ?? "");
            const start = asNumber(args[2] ?? 1);
            if (start instanceof FormulaError)
                return start;
            const from = Math.max(0, Math.floor(start) - 1);
            const at = findText(haystack, needle, from, name === "SEARCH");
            return at < 0 ? E.VALUE() : at + 1;
        }
        case "SUBSTITUTE": {
            const text = asText(args[0] ?? "");
            const from = asText(args[1] ?? "");
            const to = asText(args[2] ?? "");
            const which = args[3] === undefined ? undefined : asNumber(args[3]);
            if (which instanceof FormulaError)
                return which;
            if (!from)
                return text;
            if (which === undefined)
                return text.split(from).join(to);
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
            if (start instanceof FormulaError)
                return start;
            if (count instanceof FormulaError)
                return count;
            const at = Math.max(0, Math.floor(start) - 1);
            return text.slice(0, at) + asText(args[3] ?? "") + text.slice(at + Math.max(0, Math.floor(count)));
        }
        case "REPT": {
            const text = asText(args[0] ?? "");
            const times = asNumber(args[1] ?? 0);
            if (times instanceof FormulaError)
                return times;
            if (times < 0)
                return E.VALUE();
            return text.repeat(Math.min(10000, Math.floor(times)));
        }
        case "EXACT":
            return asText(args[0] ?? "") === asText(args[1] ?? "");
        case "TEXTJOIN": {
            const sep = asText(args[0] ?? "");
            const skip = asBool(args[1] ?? false);
            if (skip instanceof FormulaError)
                return skip;
            const parts = flatten(args.slice(2)).map((item) => asText(item));
            return (skip ? parts.filter((item) => item !== "") : parts).join(sep);
        }
        case "ROUNDUP":
        case "ROUNDDOWN": {
            const n = asNumber(args[0] ?? 0);
            const d = asNumber(args[1] ?? 0);
            if (n instanceof FormulaError)
                return n;
            if (d instanceof FormulaError)
                return d;
            const factor = 10 ** Math.floor(d);
            const scaled = n * factor;
            const moved = name === "ROUNDUP" ? (scaled < 0 ? Math.floor(scaled) : Math.ceil(scaled)) : (scaled < 0 ? Math.ceil(scaled) : Math.floor(scaled));
            return moved / factor;
        }
        case "CEILING":
        case "FLOOR": {
            const n = asNumber(args[0] ?? 0);
            const step = asNumber(args[1] ?? 1);
            if (n instanceof FormulaError)
                return n;
            if (step instanceof FormulaError)
                return step;
            if (step === 0)
                return 0;
            const units = n / step;
            return (name === "CEILING" ? Math.ceil(units) : Math.floor(units)) * step;
        }
        case "SUMPRODUCT": {
            const lists = args.filter((arg) => Array.isArray(arg));
            if (!lists.length)
                return 0;
            const length = Math.min(...lists.map((list) => list.length));
            let total = 0;
            for (let i = 0; i < length; i += 1) {
                let product = 1;
                for (const list of lists) {
                    const value = asNumber(list[i] ?? 0);
                    if (value instanceof FormulaError)
                        return value;
                    product *= value;
                }
                total += product;
            }
            return total;
        }
        case "MEDIAN": {
            const nums = numbers(args).sort((a, b) => a - b);
            if (!nums.length)
                return E.NUM();
            const mid = Math.floor(nums.length / 2);
            return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
        }
        case "LARGE":
        case "SMALL": {
            const nums = numbers([args[0] ?? 0]).sort((a, b) => (name === "LARGE" ? b - a : a - b));
            const k = asNumber(args[1] ?? 1);
            if (k instanceof FormulaError)
                return k;
            const value = nums[Math.floor(k) - 1];
            return value === undefined ? E.NUM() : value;
        }
        case "RANK": {
            const target = asNumber(args[0] ?? 0);
            if (target instanceof FormulaError)
                return target;
            const nums = numbers([args[1] ?? 0]);
            const order = asNumber(args[2] ?? 0);
            if (order instanceof FormulaError)
                return order;
            if (!nums.some((item) => item === target))
                return E.NA();
            const ahead = nums.filter((item) => (order === 0 ? item > target : item < target)).length;
            return ahead + 1;
        }
        case "EDATE": {
            const serial = asNumber(args[0] ?? 0);
            const months = asNumber(args[1] ?? 0);
            if (serial instanceof FormulaError)
                return serial;
            if (months instanceof FormulaError)
                return months;
            const date = new Date(Math.round((serial - 25569) * 86400000));
            const monthIndex = date.getUTCMonth() + Math.trunc(months);
            const last = new Date(Date.UTC(date.getUTCFullYear(), monthIndex + 1, 0)).getUTCDate();
            return Date.UTC(date.getUTCFullYear(), monthIndex, Math.min(date.getUTCDate(), last)) / 86400000 + 25569;
        }
        case "EOMONTH": {
            const serial = asNumber(args[0] ?? 0);
            const months = asNumber(args[1] ?? 0);
            if (serial instanceof FormulaError)
                return serial;
            if (months instanceof FormulaError)
                return months;
            const date = new Date(Math.round((serial - 25569) * 86400000));
            return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Math.trunc(months) + 1, 0) / 86400000 + 25569;
        }
        case "DATEDIF": {
            const start = asNumber(args[0] ?? 0);
            const end = asNumber(args[1] ?? 0);
            if (start instanceof FormulaError)
                return start;
            if (end instanceof FormulaError)
                return end;
            if (end < start)
                return E.NUM();
            const unit = asText(args[2] ?? "D").toUpperCase();
            if (unit === "D")
                return Math.round(end - start);
            const from = new Date(Math.round((start - 25569) * 86400000));
            const to = new Date(Math.round((end - 25569) * 86400000));
            let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
            if (to.getUTCDate() < from.getUTCDate())
                months -= 1;
            if (unit === "M")
                return months;
            if (unit === "Y")
                return Math.floor(months / 12);
            if (unit === "YM")
                return ((months % 12) + 12) % 12;
            if (unit === "MD")
                return datedifDays(from, to, "MD");
            if (unit === "YD")
                return datedifDays(from, to, "YD");
            return E.NUM();
        }
        case "WEEKDAY": {
            const serial = asNumber(args[0] ?? 0);
            if (serial instanceof FormulaError)
                return serial;
            const date = new Date(Math.round((serial - 25569) * 86400000));
            return date.getUTCDay() + 1;
        }
        case "TEXTBEFORE":
        case "TEXTAFTER": {
            const text = asText(args[0] ?? "");
            const marker = asText(args[1] ?? "");
            const at = text.indexOf(marker);
            if (at < 0)
                return E.NA();
            return name === "TEXTBEFORE" ? text.slice(0, at) : text.slice(at + marker.length);
        }
        case "NETWORKDAYS": {
            const start = asNumber(args[0] ?? 0);
            const end = asNumber(args[1] ?? 0);
            if (start instanceof FormulaError)
                return start;
            if (end instanceof FormulaError)
                return end;
            const step = end >= start ? 1 : -1;
            let count = 0;
            for (let day = Math.round(start); step > 0 ? day <= end : day >= end; day += step) {
                const weekday = new Date(Math.round((day - 25569) * 86400000)).getUTCDay();
                if (weekday !== 0 && weekday !== 6)
                    count += step;
            }
            return count;
        }
        case "SUBTOTAL": {
            const code = asNumber(args[0] ?? 9);
            if (code instanceof FormulaError)
                return code;
            const fn = SUBTOTALS[Math.floor(code) % 100];
            return fn ? fn(visibleArgs(args.slice(1), Math.floor(code) >= 100)) : E.VALUE();
        }
        case "HLOOKUP": {
            const needle = scalar(args[0]);
            const table = args[1];
            const row = asNumber(args[2] ?? 1);
            const approximate = args[3] === undefined ? true : asBool(args[3]);
            if (needle instanceof FormulaError)
                return needle;
            if (!(table instanceof Array) || row instanceof FormulaError)
                return E.VALUE();
            if (approximate instanceof FormulaError)
                return approximate;
            const width = rangeWidth(table);
            const index = Math.max(1, Math.floor(row));
            if (index > Math.ceil(table.length / width))
                return E.REF();
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
            if (rate instanceof FormulaError)
                return rate;
            if (rate <= -1)
                return E.NUM();
            return numbers(args.slice(1)).reduce((sum, value, index) => sum + value / (1 + rate) ** (index + 1), 0);
        }
        case "IRR": {
            const values = numbers(args.slice(0, 1));
            const guess = asNumber(args[1] ?? 0.1);
            if (guess instanceof FormulaError)
                return guess;
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
            if (k instanceof FormulaError)
                return k;
            return percentile(numbers(args.slice(0, 1)), k);
        }
        case "QUARTILE":
        case "QUARTILE.INC": {
            const q = asNumber(args[1] ?? 0);
            if (q instanceof FormulaError)
                return q;
            if (q < 0 || q > 4)
                return E.NUM();
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
            return asText(args[0] ?? "").toLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_m, lead, letter) => lead + letter.toUpperCase());
        case "CHAR": {
            const code = asNumber(args[0] ?? 0);
            if (code instanceof FormulaError)
                return code;
            if (code < 1 || code > 255)
                return E.VALUE();
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
            if (h instanceof FormulaError)
                return h;
            if (m instanceof FormulaError)
                return m;
            if (s instanceof FormulaError)
                return s;
            return (h * 3600 + m * 60 + s) / 86400;
        }
        case "HOUR":
        case "MINUTE":
        case "SECOND": {
            const serial = asNumber(args[0] ?? 0);
            if (serial instanceof FormulaError)
                return serial;
            const seconds = Math.round((((serial % 1) + 1) % 1) * 86400);
            if (name === "HOUR")
                return Math.floor(seconds / 3600);
            if (name === "MINUTE")
                return Math.floor(seconds / 60) % 60;
            return seconds % 60;
        }
        case "DATEVALUE": {
            const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(asText(args[0] ?? "").trim());
            if (!match)
                return E.VALUE();
            return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000 + 25569;
        }
        case "WORKDAY": {
            const start = asNumber(args[0] ?? 0);
            const days = asNumber(args[1] ?? 0);
            if (start instanceof FormulaError)
                return start;
            if (days instanceof FormulaError)
                return days;
            return workday(start, days);
        }
        case "YEARFRAC": {
            const start = asNumber(args[0] ?? 0);
            const end = asNumber(args[1] ?? 0);
            const basis = asNumber(args[2] ?? 0);
            if (start instanceof FormulaError)
                return start;
            if (end instanceof FormulaError)
                return end;
            if (basis instanceof FormulaError)
                return basis;
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
            if (value instanceof FormulaError)
                return value;
            return convertUnit(value, asText(args[1] ?? ""), asText(args[2] ?? ""));
        }
        default:
            return E.NAME();
    }
}
const SUBTOTALS = {
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
function average(args) {
    const nums = numbers(args);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0();
}
function conditional(name, range, criterion, sumRange) {
    const values = Array.isArray(range) ? range : [range ?? ""];
    const sums = Array.isArray(sumRange) ? sumRange : values;
    const matched = values.map((item, index) => (matches(item, criterion) ? index : -1)).filter((index) => index >= 0);
    if (name === "COUNTIF")
        return matched.length;
    const nums = matched.map((index) => asNumber(sums[index] ?? 0)).filter((item) => typeof item === "number");
    if (name === "AVERAGEIF")
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0();
    return nums.reduce((a, b) => a + b, 0);
}
function conditionals(name, args) {
    const sums = args[0];
    const rows = Array.isArray(sums) ? sums.length : 1;
    const matched = [];
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
        if (ok)
            matched.push(row);
    }
    if (name === "COUNTIFS")
        return matched.length;
    const nums = matched.map((row) => asNumber(Array.isArray(sums) ? sums[row] ?? 0 : sums ?? 0)).filter((item) => typeof item === "number");
    if (name === "AVERAGEIFS")
        return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : E.DIV0();
    return nums.reduce((a, b) => a + b, 0);
}
function matches(value, criterion) {
    const probe = Array.isArray(criterion) ? criterion[0] : criterion;
    if (probe instanceof FormulaError)
        return false;
    const cell = value ?? "";
    if (typeof probe === "string") {
        const op = /^(>=|<=|<>|>|<|=)(.*)$/.exec(probe);
        if (op)
            return compare(cell, coerceCellText(op[2] ?? ""), op[1]) === true;
        if (probe.includes("*") || probe.includes("?")) {
            return new RegExp(`^${wildcardPattern(probe)}$`, "i").test(String(cell));
        }
    }
    return compare(cell, probe ?? "", "=") === true;
}
function sameValue(left, right) {
    return compare(left ?? "", right ?? "", "=") === true;
}
/** Excel FIND/SEARCH position, or -1. SEARCH ignores case and treats `?` and `*` as wildcards. */
function findText(haystack, needle, from, wildcard) {
    if (!wildcard)
        return haystack.indexOf(needle, from);
    const source = wildcardPattern(needle);
    const found = new RegExp(source, "i").exec(haystack.slice(from));
    return found ? from + (found.index ?? 0) : -1;
}
function wildcardPattern(text) {
    let pattern = "";
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (char === "~" && (text[i + 1] === "*" || text[i + 1] === "?" || text[i + 1] === "~")) {
            pattern += `\\${text[i + 1]}`;
            i += 1;
        }
        else if (char === "*")
            pattern += ".*";
        else if (char === "?")
            pattern += ".";
        else
            pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    return pattern;
}
function tagRange(values, width, hidden, subtotals) {
    Object.defineProperty(values, "width", { value: Math.max(1, width), enumerable: false });
    Object.defineProperty(values, "hidden", { value: hidden, enumerable: false });
    Object.defineProperty(values, "subtotals", { value: subtotals, enumerable: false });
    return values;
}
function withWidth(values, width) {
    return tagRange(values, width, values.map(() => false), values.map(() => false));
}
function rangeWidth(table) {
    const width = table.width;
    return typeof width === "number" && width > 0 ? width : 1;
}
/** SUBTOTAL drops nested SUBTOTAL cells, and codes 101+ also drop filtered rows. */
function visibleArgs(args, skipHidden) {
    return args.map((arg) => {
        if (!Array.isArray(arg))
            return arg;
        const flags = arg;
        const kept = arg.filter((_item, index) => !(flags.subtotals?.[index] ?? false) && !(skipHidden && (flags.hidden?.[index] ?? false)));
        return tagRange(kept, rangeWidth(arg), [], []);
    });
}
function scalar(value) {
    if (value instanceof FormulaError)
        return value;
    if (Array.isArray(value))
        return value[0] ?? "";
    return value ?? "";
}
/** Exact lookup: numbers match numbers, text is case-insensitive, and `?` `*` are wildcards. */
function lookupEqual(cell, needle) {
    if (typeof needle === "number")
        return typeof cell === "number" && cell === needle;
    const text = String(needle);
    if (text.includes("*") || text.includes("?"))
        return new RegExp(`^${wildcardPattern(text)}$`, "i").test(String(cell));
    return String(cell).toLowerCase() === text.toLowerCase();
}
/** Approximate match. `direction` -1 finds the largest value at or below the needle, 1 the smallest at or above. */
function approxIndex(table, needle, direction) {
    const probe = asNumber(needle);
    if (probe instanceof FormulaError)
        return -1;
    let found = -1;
    let best = 0;
    table.forEach((item, index) => {
        const cell = asNumber(item);
        if (cell instanceof FormulaError)
            return;
        const fits = direction < 0 ? cell <= probe : cell >= probe;
        if (!fits)
            return;
        if (found < 0 || (direction < 0 ? cell > best : cell < best)) {
            found = index;
            best = cell;
        }
    });
    return found;
}
/** Excel's MD ignores months and YD ignores years, borrowing a month or a year when the day falls short. */
function datedifDays(from, to, unit) {
    let year = to.getUTCFullYear();
    const month = unit === "MD" ? to.getUTCMonth() : from.getUTCMonth();
    let borrow = 0;
    if (unit === "MD" && to.getUTCDate() < from.getUTCDate())
        borrow = 1;
    if (unit === "YD" && (from.getUTCMonth() > to.getUTCMonth() || (from.getUTCMonth() === to.getUTCMonth() && from.getUTCDate() > to.getUTCDate())))
        year -= 1;
    const endMonth = month - borrow;
    const last = new Date(Date.UTC(year, endMonth + 1, 0)).getUTCDate();
    const start = Date.UTC(year, endMonth, Math.min(from.getUTCDate(), last));
    const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.round((end - start) / 86400000);
}
/** Ordinary annuity: payments at the end of each period, or at the beginning when `due` is 1. */
function finance(name, args) {
    const nums = args.map((arg) => asNumber(arg ?? 0));
    const bad = nums.find((item) => item instanceof FormulaError);
    if (bad instanceof FormulaError)
        return bad;
    const [first = 0, second = 0, third = 0, fourth = 0, fifth = 0, sixth = 0] = nums;
    const due = (type) => (type ? 1 : 0);
    if (name === "PMT") {
        const [rate, nper, pv, fv = 0, type = 0] = [first, second, third, fourth, fifth];
        if (rate === 0)
            return nper === 0 ? E.NUM() : -(pv + fv) / nper;
        const grown = (1 + rate) ** nper;
        return (-(pv * grown + fv) * rate) / ((1 + rate * due(type)) * (grown - 1));
    }
    if (name === "PV") {
        const [rate, nper, pmt, fv = 0, type = 0] = [first, second, third, fourth, fifth];
        if (rate === 0)
            return -(fv + pmt * nper);
        const grown = (1 + rate) ** nper;
        return -(fv + pmt * (1 + rate * due(type)) * (grown - 1) / rate) / grown;
    }
    if (name === "FV") {
        const [rate, nper, pmt, pv = 0, type = 0] = [first, second, third, fourth, fifth];
        if (rate === 0)
            return -(pv + pmt * nper);
        const grown = (1 + rate) ** nper;
        return -(pv * grown + pmt * (1 + rate * due(type)) * (grown - 1) / rate);
    }
    if (name === "NPER") {
        const [rate, pmt, pv, fv = 0, type = 0] = [first, second, third, fourth, fifth];
        if (rate === 0)
            return pmt === 0 ? E.NUM() : -(pv + fv) / pmt;
        const paid = pmt * (1 + rate * due(type));
        if (paid + pv * rate === 0)
            return E.NUM();
        return Math.log((paid - fv * rate) / (paid + pv * rate)) / Math.log(1 + rate);
    }
    if (name === "IPMT" || name === "PPMT") {
        const [rate, per, nper, pv, fv = 0, type = 0] = [first, second, third, fourth, fifth, sixth];
        if (per < 1 || per > nper)
            return E.NUM();
        const payment = finance("PMT", [rate, nper, pv, fv, type]);
        if (typeof payment !== "number")
            return payment;
        const grown = finance("FV", [rate, per - 1, payment, pv, type]);
        if (typeof grown !== "number")
            return grown;
        const interest = type && per === 1 ? 0 : -grown * rate;
        return name === "IPMT" ? interest : payment - interest;
    }
    const [nper, pmt, pv, fv = 0, type = 0, guess = 0.1] = [first, second, third, fourth, fifth, sixth];
    return solveRate(nper, pmt, pv, fv, type, guess);
}
function solveRate(nper, pmt, pv, fv, type, guess) {
    let rate = guess;
    for (let step = 0; step < 50; step += 1) {
        if (rate <= -1)
            return E.NUM();
        const grown = (1 + rate) ** nper;
        const due = type ? 1 : 0;
        const value = pv * grown + pmt * (1 + rate * due) * (grown - 1) / rate + fv;
        const slope = pv * nper * (1 + rate) ** (nper - 1) +
            (pmt * (1 + rate * due) * (nper * rate * (1 + rate) ** (nper - 1) - (grown - 1))) / rate ** 2 +
            (pmt * due * (grown - 1)) / rate;
        if (slope === 0)
            return E.NUM();
        const next = rate - value / slope;
        if (Math.abs(next - rate) < 1e-9)
            return next;
        rate = next;
    }
    return E.NUM();
}
function internalRate(values, guess) {
    if (!values.some((item) => item > 0) || !values.some((item) => item < 0))
        return E.NUM();
    let rate = guess;
    for (let step = 0; step < 50; step += 1) {
        if (rate <= -1)
            return E.NUM();
        let value = 0;
        let slope = 0;
        values.forEach((item, index) => {
            value += item / (1 + rate) ** index;
            slope -= (index * item) / (1 + rate) ** (index + 1);
        });
        if (slope === 0)
            return E.NUM();
        const next = rate - value / slope;
        if (Math.abs(next - rate) < 1e-9)
            return next;
        rate = next;
    }
    return E.NUM();
}
function variance(args, population) {
    const nums = numbers(args);
    const divisor = nums.length - (population ? 0 : 1);
    if (divisor <= 0)
        return E.DIV0();
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    return nums.reduce((sum, item) => sum + (item - mean) ** 2, 0) / divisor;
}
function stdev(args, population) {
    const spread = variance(args, population);
    return typeof spread === "number" ? Math.sqrt(spread) : spread;
}
function modeOf(nums) {
    if (!nums.length)
        return E.NUM();
    const counts = new Map();
    for (const item of nums)
        counts.set(item, (counts.get(item) ?? 0) + 1);
    let best = nums[0];
    let seen = 0;
    for (const [value, count] of counts) {
        if (count > seen) {
            best = value;
            seen = count;
        }
    }
    return seen > 1 ? best : E.NA();
}
function percentile(nums, k) {
    if (!nums.length || k < 0 || k > 1)
        return E.NUM();
    const sorted = [...nums].sort((a, b) => a - b);
    const position = k * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const fraction = position - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}
function correl(left, right) {
    const length = Math.min(left.length, right.length);
    if (length < 2)
        return E.DIV0();
    const xs = left.slice(0, length);
    const ys = right.slice(0, length);
    const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
    const mx = mean(xs);
    const my = mean(ys);
    let cross = 0;
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < length; i += 1) {
        const dx = xs[i] - mx;
        const dy = ys[i] - my;
        cross += dx * dy;
        vx += dx * dx;
        vy += dy * dy;
    }
    return vx === 0 || vy === 0 ? E.DIV0() : cross / Math.sqrt(vx * vy);
}
function mathFn(name, args) {
    if (name === "PI")
        return Math.PI;
    const n = asNumber(args[0] ?? 0);
    if (n instanceof FormulaError)
        return n;
    if (name === "LN")
        return n > 0 ? Math.log(n) : E.NUM();
    if (name === "LOG10")
        return n > 0 ? Math.log10(n) : E.NUM();
    if (name === "LOG") {
        const base = asNumber(args[1] ?? 10);
        if (base instanceof FormulaError)
            return base;
        return n > 0 && base > 0 && base !== 1 ? Math.log(n) / Math.log(base) : E.NUM();
    }
    if (name === "EXP")
        return Math.exp(n);
    if (name === "SIN")
        return Math.sin(n);
    if (name === "COS")
        return Math.cos(n);
    if (name === "TAN")
        return Math.tan(n);
    if (name === "ASIN" || name === "ACOS")
        return n < -1 || n > 1 ? E.NUM() : name === "ASIN" ? Math.asin(n) : Math.acos(n);
    if (name === "ATAN")
        return Math.atan(n);
    if (name === "ATAN2") {
        const y = asNumber(args[1] ?? 0);
        if (y instanceof FormulaError)
            return y;
        return n === 0 && y === 0 ? E.DIV0() : Math.atan2(y, n);
    }
    if (name === "SIGN")
        return Math.sign(n);
    if (name === "RADIANS")
        return (n * Math.PI) / 180;
    if (name === "DEGREES")
        return (n * 180) / Math.PI;
    if (name === "FACT") {
        if (n < 0 || !Number.isInteger(n) || n > 170)
            return E.NUM();
        let out = 1;
        for (let i = 2; i <= n; i += 1)
            out *= i;
        return out;
    }
    const k = asNumber(args[1] ?? 0);
    if (k instanceof FormulaError)
        return k;
    if (n < 0 || k < 0 || k > n || !Number.isInteger(n) || !Number.isInteger(k))
        return E.NUM();
    let out = 1;
    for (let i = 1; i <= k; i += 1)
        out = (out * (n - k + i)) / i;
    return out;
}
function workday(start, days) {
    const step = days >= 0 ? 1 : -1;
    let left = Math.abs(Math.trunc(days));
    let day = Math.round(start);
    while (left > 0) {
        day += step;
        const weekday = new Date(Math.round((day - 25569) * 86400000)).getUTCDay();
        if (weekday !== 0 && weekday !== 6)
            left -= 1;
    }
    return day;
}
function yearFrac(start, end, basis) {
    const [from, to] = start <= end ? [start, end] : [end, start];
    if (basis === 1)
        return (to - from) / (new Date(Date.UTC(new Date((from - 25569) * 86400000).getUTCFullYear(), 1, 29)).getUTCMonth() === 1 ? 366 : 365);
    if (basis === 2)
        return (to - from) / 360;
    if (basis === 3)
        return (to - from) / 365;
    if (basis !== 0 && basis !== 4)
        return E.NUM();
    const a = new Date(Math.round((from - 25569) * 86400000));
    const b = new Date(Math.round((to - 25569) * 86400000));
    const day = (date) => Math.min(date.getUTCDate(), 30);
    const days = 360 * (b.getUTCFullYear() - a.getUTCFullYear()) + 30 * (b.getUTCMonth() - a.getUTCMonth()) + day(b) - day(a);
    return days / 360;
}
const BASE_DIGITS = "0123456789ABCDEF";
function baseConvert(name, args) {
    const [from, to] = name.split("2");
    const raw = asText(args[0] ?? "").trim().toUpperCase();
    const source = from === "DEC" ? 10 : from === "BIN" ? 2 : from === "OCT" ? 8 : 16;
    const target = to === "DEC" ? 10 : to === "BIN" ? 2 : to === "OCT" ? 8 : 16;
    const digits = raw.startsWith("-") ? raw.slice(1) : raw;
    if (!digits || [...digits].some((char) => BASE_DIGITS.indexOf(char) < 0 || BASE_DIGITS.indexOf(char) >= source))
        return E.NUM();
    const magnitude = parseInt(digits, source);
    const value = raw.startsWith("-") ? -magnitude : magnitude;
    if (to === "DEC")
        return value;
    if (value < 0)
        return E.NUM();
    const places = asNumber(args[1] ?? 0);
    if (args[1] !== undefined && places instanceof FormulaError)
        return places;
    const out = value.toString(target).toUpperCase();
    if (out.length > 10)
        return E.NUM();
    return typeof places === "number" && places > out.length ? out.padStart(Math.min(10, Math.floor(places)), "0") : out;
}
const UNITS = {
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
function convertUnit(value, from, to) {
    const source = UNITS[from.toLowerCase()];
    const target = UNITS[to.toLowerCase()];
    if (!source || !target || source.group !== target.group)
        return E.NA();
    if (source.group === "temp") {
        const unit = (code) => code.toLowerCase();
        const kelvin = unit(from) === "k" ? value : unit(from) === "f" ? (value - 32) * 5 / 9 + 273.15 : value + 273.15;
        if (unit(to) === "k")
            return kelvin;
        if (unit(to) === "f")
            return (kelvin - 273.15) * 9 / 5 + 32;
        return kelvin - 273.15;
    }
    return (value * source.factor) / target.factor;
}
export { formatNumber } from "./format.js";
export function setFormula(cell, formula) {
    const body = formula.startsWith("=") ? formula.slice(1) : formula;
    cell.formula = body;
}
