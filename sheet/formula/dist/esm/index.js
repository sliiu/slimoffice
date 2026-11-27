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
export const E = {
    DIV0: () => new FormulaError("#DIV/0!"),
    NULL: () => new FormulaError("#NULL!"),
    VALUE: () => new FormulaError("#VALUE!"),
    REF: () => new FormulaError("#REF!"),
    NA: () => new FormulaError("#N/A"),
    NAME: () => new FormulaError("#NAME?"),
    NUM: () => new FormulaError("#NUM!"),
};
/** Recalculate every formula cell. Display results go into `value`; `formula` stays. */
export function recalculate(workbook) {
    // Drop the previous spill first, so a result that shrank does not leave stale values behind.
    for (const sheet of workbook.sheets)
        clearSpilled(sheet);
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
                if (Array.isArray(result) && result.length > 1) {
                    if (spillInto(sheet, r, c, result))
                        continue;
                    delete cell.spillRef;
                    cell.value = "#SPILL!";
                    continue;
                }
                delete cell.spillRef;
                cell.value = formatResult(result);
            }
        }
    }
}
/** Clears cells a previous spill filled. A cell the user has since typed into has lost its marker, so it stays. */
function clearSpilled(sheet) {
    for (const line of sheet.cells) {
        if (!line)
            continue;
        for (const cell of line) {
            if (cell?.spill && !cell.formula) {
                cell.value = "";
                delete cell.spill;
            }
        }
    }
}
/**
 * Writes an array result into the cells below and to the right of the anchor.
 * Returns false, and writes nothing, when one of those cells already holds a value or a formula.
 */
function spillInto(sheet, row, col, result) {
    const cols = rangeWidth(result);
    const rows = Math.ceil(result.length / cols);
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            if (r === 0 && c === 0)
                continue;
            const target = sheet.cells[row + r]?.[col + c];
            if (target && (target.formula || target.value !== ""))
                return false;
        }
    }
    const anchor = sheet.cells[row]?.[col];
    if (!anchor)
        return false;
    anchor.value = formatResult(result[0] ?? "");
    anchor.spillRef = `${columnName(col)}${row + 1}:${columnName(col + cols - 1)}${row + rows}`;
    const anchorRef = `${columnName(col)}${row + 1}`;
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            if (r === 0 && c === 0)
                continue;
            const cell = ensureCell(sheet, row + r, col + c);
            cell.value = formatResult(result[r * cols + c] ?? "");
            cell.spill = anchorRef;
            delete cell.formula;
        }
    }
    return true;
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
        if (isPending(value))
            return E.NAME();
        return Array.isArray(value) && value.length === 1 ? value[0] ?? "" : value;
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
    if (isPending(value))
        return E.NAME().code;
    if (isLambda(value))
        return E.VALUE().code;
    if (Array.isArray(value) && value.length === 1)
        return formatResult(value[0] ?? "");
    if (value instanceof FormulaError)
        return value.code;
    if (Array.isArray(value))
        return value.map((item) => formatResult(item)).join(",");
    if (isOmitted(value))
        return "";
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
            // An R1C1 address keeps its brackets, as in R[-1]C[2]. A name stops before them.
            if (/^[Rr]$/.test(text.slice(i, j)) && text[j] === "[") {
                while (j < text.length && /[RrCc0-9\[\]+\-]/.test(text[j]))
                    j += 1;
            }
            const raw = text.slice(i, j);
            const upper = raw.toUpperCase();
            // A cell reference is one to three column letters and a row number, or an R1C1 address. Anything else is a name.
            if (/^\$?[A-Z]{1,3}\$?\d+$/.test(upper) || isR1C1(upper))
                out.push({ kind: "ref", value: upper });
            else
                out.push({ kind: "id", value: upper });
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
        if (ch === "[") {
            out.push({ kind: "lsb" });
            i += 1;
            continue;
        }
        if (ch === "]") {
            out.push({ kind: "rsb" });
            i += 1;
            continue;
        }
        if (ch === ";") {
            out.push({ kind: "semi" });
            i += 1;
            continue;
        }
        // The # or @ of a table specifier, as in [#This Row] or [@数量]. Elsewhere both stay errors.
        if ((ch === "#" || ch === "@") && out.at(-1)?.kind === "lsb") {
            let j = i + 1;
            while (j < text.length && /[A-Za-z0-9_$一-鿿. ]/.test(text[j]))
                j += 1;
            const rest = text.slice(i + 1, j).trim();
            out.push({ kind: "id", value: (ch === "@" && rest ? `@${rest}` : `${ch}${rest}`).toUpperCase() });
            i = j;
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
    /** Parentheses opened by a function call. A comma inside one separates arguments, not ranges. */
    depth = 0;
    /** Parentheses opened on their own, where a comma joins ranges. */
    paren = 0;
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
            const lifted = lift(left, right, (a, b) => {
                if (a instanceof FormulaError)
                    return a;
                if (b instanceof FormulaError)
                    return b;
                return `${asText(a)}${asText(b)}`;
            });
            left = lifted ?? `${asText(left)}${asText(right)}`;
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
            // `1:1` is every column of those rows, not two numbers.
            if (this.peek()?.kind === "colon" && this.tokens[this.i + 1]?.kind === "num") {
                this.take();
                const end = this.take().value;
                return this.rowRange(undefined, token.value, end);
            }
            return token.value;
        }
        if (token.kind === "str") {
            this.take();
            return token.value;
        }
        if (token.kind === "lp") {
            this.take();
            this.paren += 1;
            const value = this.parseExpression();
            this.paren -= 1;
            if (this.peek()?.kind !== "rp")
                throw E.VALUE();
            this.take();
            return value;
        }
        if (token.kind === "lb")
            return this.parseArray();
        if (token.kind === "id" && this.tokens[this.i + 1]?.kind === "lp")
            return this.parseLambda();
        if (token.kind === "ref" || token.kind === "id") {
            return this.parseRefOrCall();
        }
        throw E.VALUE();
    }
    /** `{1,2;3,4}` is a constant array: commas run across a row, semicolons start the next. */
    parseArray() {
        this.take();
        const rows = [];
        let row = [];
        const push = (value) => {
            if (value instanceof FormulaError)
                throw value;
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
        if (this.peek()?.kind !== "rb")
            throw E.VALUE();
        this.take();
        const width = rows.reduce((widest, line) => Math.max(widest, line.length), 1);
        const out = [];
        for (const line of rows) {
            for (let i = 0; i < width; i += 1)
                out.push(line[i] ?? "");
        }
        return withWidth(out, width);
    }
    /**
     * `LAMBDA(name, ..., body)(arg, ...)` defines its names for the body only.
     * A call without the trailing arguments returns the definition, which LET and MAKEARRAY apply.
     */
    parseLambda() {
        const name = this.take().value;
        if (name !== "LAMBDA" && name !== "LET")
            return this.parseCall(name);
        this.take();
        if (name === "LET")
            return this.parseLet();
        const params = [];
        const optional = [];
        while (this.peek()?.kind === "id" && this.tokens[this.i + 1]?.kind === "comma") {
            params.push(this.take().value);
            this.take();
        }
        // A bracketed name is optional, and every optional name has to come last.
        while (this.peek()?.kind === "lsb") {
            this.take();
            if (this.peek()?.kind !== "id")
                throw E.VALUE();
            const id = this.take().value;
            if (this.peek()?.kind !== "rsb")
                throw E.VALUE();
            this.take();
            params.push(id);
            optional.push(id);
            if (this.peek()?.kind !== "comma")
                break;
            this.take();
        }
        const bodyStart = this.i;
        let depth = 1;
        while (this.i < this.tokens.length && depth > 0) {
            const kind = this.tokens[this.i]?.kind;
            if (kind === "lp")
                depth += 1;
            else if (kind === "rp")
                depth -= 1;
            if (depth > 0)
                this.i += 1;
        }
        if (this.peek()?.kind !== "rp")
            throw E.VALUE();
        const body = this.tokens.slice(bodyStart, this.i);
        this.take();
        const lambda = { params, optional, body };
        if (this.peek()?.kind !== "lp")
            return lambda;
        this.take();
        const args = this.parseArgList();
        if (this.peek()?.kind !== "rp")
            throw E.VALUE();
        this.take();
        return applyLambda(lambda, args, this.ctx);
    }
    /**
     * LET pairs each name with the following value, then evaluates the final expression under those names.
     * The pairs are collected as tokens first, because a value can itself contain a name defined earlier.
     */
    parseLet() {
        const pairs = [];
        while (this.peek()?.kind === "id" && this.tokens[this.i + 1]?.kind === "comma") {
            const id = this.take().value;
            this.take();
            const start = this.i;
            this.parseExpression();
            pairs.push({ name: id, tokens: this.tokens.slice(start, this.i) });
            if (this.peek()?.kind !== "comma")
                throw E.VALUE();
            this.take();
        }
        if (!pairs.length)
            throw E.VALUE();
        const start = this.i;
        this.parseExpression();
        const body = this.tokens.slice(start, this.i);
        if (this.peek()?.kind !== "rp")
            throw E.VALUE();
        this.take();
        const names = new Map();
        for (const pair of pairs) {
            names.set(pair.name, new Parser(rewrite(pair.tokens, names), this.ctx).parseExpression());
        }
        return new Parser(rewrite(body, names), this.ctx).parseExpression();
    }
    parseCall(name) {
        this.take();
        this.depth += 1;
        const args = this.parseArgList();
        this.depth -= 1;
        if (this.peek()?.kind !== "rp")
            throw E.VALUE();
        this.take();
        return callFunction(name, args, this.ctx);
    }
    parseArgList() {
        const args = [];
        // An empty slot, as in GROUPBY(rows, values, SUM,,,2), counts as an omitted argument.
        const slot = () => (this.peek()?.kind === "comma" || this.peek()?.kind === "rp" ? { omitted: true } : this.parseExpression());
        if (this.peek()?.kind !== "rp") {
            args.push(slot());
            while (this.peek()?.kind === "comma") {
                this.take();
                args.push(slot());
            }
        }
        return args;
    }
    parseRefOrCall() {
        let value = this.parseOneRef();
        // A space between two ranges is their intersection, as in `A1:C3 B2:B4`.
        while (value instanceof FormulaError === false && this.startsRef()) {
            value = intersectRanges(this.ctx.workbook, value, this.parseOneRef());
        }
        // A comma inside bare parentheses joins ranges into one union, as in `(A1:A2,B1)`.
        // Inside a function call the comma separates arguments, so SUM(A1,B1) stays two arguments.
        if (Array.isArray(value) && this.peek()?.kind === "comma" && this.paren > 0 && this.startsUnion()) {
            const parts = [value];
            while (this.peek()?.kind === "comma" && this.startsUnion()) {
                this.take();
                const next = this.parseRefOrCall();
                if (!Array.isArray(next))
                    return next;
                parts.push(next);
            }
            value = unionRanges(parts);
        }
        return value;
    }
    /** A comma starts a union only when a range follows it. A function argument stays an argument. */
    startsUnion() {
        const token = this.tokens[this.i + 1];
        return token?.kind === "ref" || token?.kind === "lp";
    }
    startsRef() {
        const token = this.peek();
        return token?.kind === "ref" || (token?.kind === "id" && this.tokens[this.i + 1]?.kind !== "lp");
    }
    parseOneRef() {
        const first = this.take();
        if (first.kind !== "ref" && first.kind !== "id")
            throw E.VALUE();
        // SheetName!A1 or SheetName!A1:B2
        if (this.peek()?.kind === "bang") {
            this.take();
            const sheetName = first.value;
            const next = this.peek();
            if (next?.kind === "num") {
                this.take();
                if (this.peek()?.kind !== "colon")
                    throw E.REF();
                this.take();
                const end = this.take();
                if (end.kind !== "num")
                    throw E.REF();
                return this.rowRange(sheetName, next.value, end.value);
            }
            if (!next || (next.kind !== "ref" && next.kind !== "id"))
                throw E.REF();
            this.take();
            return this.parseRangeTail(sheetName, next.value);
        }
        // Sheet1:Sheet3!A1 stacks that range on every sheet from the first name to the second.
        if (this.peek()?.kind === "colon") {
            const sheetEnd = this.tokens[this.i + 1];
            const mark = this.tokens[this.i + 2];
            if (sheetEnd && (sheetEnd.kind === "id" || sheetEnd.kind === "ref") && mark?.kind === "bang") {
                this.take();
                this.take();
                this.take();
                return this.threeD(first.value, sheetEnd.value);
            }
        }
        if (first.kind === "id" && this.peek()?.kind === "lp")
            return this.parseCall(first.value);
        // Table1[列] reads that column of the named table. A specifier picks the header, the totals, or this row.
        if (first.kind === "id" && this.peek()?.kind === "lsb")
            return this.tableRef(first.value);
        if (first.kind === "id" && (first.value === "TRUE" || first.value === "FALSE")) {
            return first.value === "TRUE";
        }
        if (first.kind === "id" && first.value === "\u0000OMITTED")
            return { omitted: true };
        return this.parseRangeTail(undefined, first.value);
    }
    parseRangeTail(sheetName, startRef) {
        let endRef = startRef;
        let ranged = false;
        if (this.peek()?.kind === "colon") {
            this.take();
            const next = this.take();
            if (next.kind !== "ref" && next.kind !== "id")
                throw E.REF();
            endRef = next.value;
            ranged = true;
        }
        // A colon between column letters, as in A:A, covers those columns. A bare letter stays a name.
        const start = locateRef(startRef, ranged, this.ctx);
        const end = locateRef(endRef, ranged, this.ctx);
        // A relative R1C1 address that leaves the sheet is a reference error, not a name.
        if ((start && start.row < 0) || (end && end.row < 0))
            return E.REF();
        if (!start || !end || start.whole !== end.whole) {
            if (!sheetName && startRef === endRef) {
                const named = this.ctx.workbook.names?.find((item) => item.name.toUpperCase() === startRef);
                if (named)
                    return evaluate(named.refersTo.startsWith("=") ? named.refersTo : `=${named.refersTo}`, this.ctx);
                return { name: startRef };
            }
            throw start || end ? E.REF() : E.NAME();
        }
        const sheetIndex = sheetName ? findSheet(this.ctx.workbook, sheetName) : this.ctx.sheetIndex;
        if (sheetIndex < 0)
            return E.REF();
        const values = readRange(this.ctx.workbook, sheetIndex, start, end);
        if (start.row === end.row && start.col === end.col)
            return values;
        return values;
    }
    /**
     * One column of a table, or the row the formula sits on.
     * `Table1[列]` is the data, `Table1[[#Headers],[列]]` the header, `Table1[[#Totals],[列]]` the totals row,
     * and `Table1[[#This Row],[列]]` (also written `Table1[@列]`) the cell on the formula's own row.
     */
    tableRef(name) {
        const spec = this.tableSpec();
        if (spec instanceof FormulaError)
            return spec;
        for (const [sheetIndex, sheet] of this.ctx.workbook.sheets.entries()) {
            const table = (sheet.tables ?? []).find((item) => item.name.toUpperCase() === name);
            if (!table)
                continue;
            const at = (table.columns ?? []).findIndex((item) => item.toUpperCase() === spec.column);
            if (at < 0)
                return E.REF();
            const col = table.c1 + at;
            const dataTop = table.headerRow === false ? table.r1 : table.r1 + 1;
            const dataBottom = table.totalsRow ? table.r2 - 1 : table.r2;
            if (spec.part === "this") {
                if (this.ctx.row < dataTop || this.ctx.row > dataBottom)
                    return E.VALUE();
                return readRange(this.ctx.workbook, sheetIndex, { row: this.ctx.row, col }, { row: this.ctx.row, col });
            }
            if (spec.part === "headers") {
                if (table.headerRow === false)
                    return E.REF();
                return readRange(this.ctx.workbook, sheetIndex, { row: table.r1, col }, { row: table.r1, col });
            }
            if (spec.part === "totals") {
                if (!table.totalsRow)
                    return E.REF();
                return readRange(this.ctx.workbook, sheetIndex, { row: table.r2, col }, { row: table.r2, col });
            }
            if (dataBottom < dataTop)
                return [];
            return readRange(this.ctx.workbook, sheetIndex, { row: dataTop, col }, { row: dataBottom, col });
        }
        return E.NAME();
    }
    /** The part and the column inside the brackets. A bare column means the data rows. */
    tableSpec() {
        this.take();
        const item = this.tableItem();
        if (item instanceof FormulaError)
            return item;
        if (this.peek()?.kind !== "comma") {
            if (this.peek()?.kind !== "rsb")
                return E.REF();
            this.take();
            // `[@列]` names the current row of that column. Any other bare specifier needs its column beside it.
            if (item.part === "this" && item.column)
                return item;
            if (item.part !== "data")
                return E.REF();
            return item;
        }
        this.take();
        const column = this.tableItem();
        if (column instanceof FormulaError)
            return column;
        if (this.peek()?.kind !== "rsb")
            return E.REF();
        this.take();
        if (item.part === "data" || column.part !== "data")
            return E.REF();
        return { part: item.part, column: column.column };
    }
    /** One bracket item: a column name, or a specifier such as `#This Row` or `@`. */
    tableItem() {
        const nested = this.peek()?.kind === "lsb";
        if (nested)
            this.take();
        const token = this.peek();
        if (token?.kind !== "id" && token?.kind !== "str" && token?.kind !== "op")
            return E.REF();
        this.take();
        if (nested) {
            if (this.peek()?.kind !== "rsb")
                return E.REF();
            this.take();
        }
        const raw = token.value;
        const part = tablePart(raw);
        if (part)
            return { part, column: "" };
        // `@列` is the current row of that column, written without the #This Row specifier.
        if (raw.startsWith("@"))
            return { part: "this", column: raw.slice(1) };
        return { part: "data", column: raw };
    }
    /** The same cells on every sheet between the two names, including sheets in between. */
    threeD(startName, endName) {
        const from = findSheet(this.ctx.workbook, startName);
        const to = findSheet(this.ctx.workbook, endName);
        if (from < 0 || to < 0)
            return E.REF();
        const span = this.takeSpan();
        if (span instanceof FormulaError)
            return span;
        const out = [];
        for (let sheetIndex = Math.min(from, to); sheetIndex <= Math.max(from, to); sheetIndex += 1) {
            out.push(...readRange(this.ctx.workbook, sheetIndex, span.start, span.end));
        }
        return out;
    }
    /** The range after `!`, as corners. A bare name here is a reference error, not a defined name. */
    takeSpan() {
        const next = this.peek();
        if (next?.kind === "num") {
            this.take();
            if (this.peek()?.kind !== "colon")
                return E.REF();
            this.take();
            const end = this.take();
            if (end.kind !== "num")
                return E.REF();
            if (!Number.isInteger(next.value) || !Number.isInteger(end.value) || next.value < 1 || end.value < 1 || next.value > 1048576 || end.value > 1048576) {
                return E.REF();
            }
            return {
                start: { row: next.value - 1, col: 0, whole: "row" },
                end: { row: end.value - 1, col: 0, whole: "row" },
            };
        }
        if (!next || (next.kind !== "ref" && next.kind !== "id"))
            return E.REF();
        this.take();
        let endRef = next.value;
        let ranged = false;
        if (this.peek()?.kind === "colon") {
            this.take();
            const last = this.take();
            if (last.kind !== "ref" && last.kind !== "id")
                return E.REF();
            endRef = last.value;
            ranged = true;
        }
        const start = locateRef(next.value, ranged, this.ctx);
        const end = locateRef(endRef, ranged, this.ctx);
        if ((start && start.row < 0) || (end && end.row < 0))
            return E.REF();
        if (!start || !end || start.whole !== end.whole)
            return E.REF();
        return { start, end };
    }
    /** `1:3` covers every column of those rows, bounded by the columns the sheet actually holds. */
    rowRange(sheetName, start, end) {
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || start > 1048576 || end > 1048576)
            return E.REF();
        const sheetIndex = sheetName ? findSheet(this.ctx.workbook, sheetName) : this.ctx.sheetIndex;
        if (sheetIndex < 0)
            return E.REF();
        return readRange(this.ctx.workbook, sheetIndex, { row: start - 1, col: 0, whole: "row" }, { row: end - 1, col: 0, whole: "row" });
    }
}
function parseA1(ref, ctx) {
    const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.toUpperCase());
    if (match) {
        const col = columnNumber(match[1] ?? "");
        if (col == null)
            return undefined;
        return { row: Number(match[2]) - 1, col };
    }
    return ctx ? parseR1C1(ref, ctx) : undefined;
}
/** `R2C3` is absolute, `R[1]C[-2]` counts from the cell holding the formula. */
function isR1C1(ref) {
    return /^R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?$/.test(ref);
}
function parseR1C1(ref, ctx) {
    const match = /^R(\[(-?\d+)\]|(\d+))?C(\[(-?\d+)\]|(\d+))?$/.exec(ref.toUpperCase());
    if (!match)
        return undefined;
    const row = match[3] ? Number(match[3]) - 1 : ctx.row + (match[2] ? Number(match[2]) : 0);
    const col = match[6] ? Number(match[6]) - 1 : ctx.col + (match[5] ? Number(match[5]) : 0);
    if (row < 0 || col < 0 || row > 1048575 || col > 16383)
        return { row: -1, col: -1 };
    return { row, col };
}
/** A column letter on its own, so `A:C` can mean every row of those columns. Only after a colon, so a bare name stays a name. */
function locateRef(ref, allowColumn, ctx) {
    const cell = parseA1(ref, ctx);
    if (cell)
        return cell;
    if (!allowColumn)
        return undefined;
    const col = columnNumber(ref.replace(/^\$/, ""));
    if (col == null || !/^\$?[A-Z]{1,3}$/.test(ref.toUpperCase()))
        return undefined;
    return { row: 0, col, whole: "col" };
}
function columnNumber(letters) {
    if (!/^[A-Z]{1,3}$/.test(letters))
        return undefined;
    let col = 0;
    for (const letter of letters)
        col = col * 26 + letter.charCodeAt(0) - 64;
    if (col < 1 || col > 16384)
        return undefined;
    return col - 1;
}
/** `#Headers`, `#Totals`, `#This Row` and `@` name a part of a table. Anything else is a column. */
function tablePart(raw) {
    if (raw === "@")
        return "this";
    if (raw === "#HEADERS" || raw === "#标题")
        return "headers";
    if (raw === "#TOTALS" || raw === "#汇总")
        return "totals";
    if (raw === "#THIS ROW" || raw === "#此行")
        return "this";
    return undefined;
}
function findSheet(workbook, name) {
    const needle = name.replace(/^'|'$/g, "").toUpperCase();
    return workbook.sheets.findIndex((sheet) => sheet.name.toUpperCase() === needle);
}
function readRange(workbook, sheetIndex, start, end) {
    const sheet = workbook.sheets[sheetIndex];
    if (!sheet)
        return [];
    let r1 = Math.min(start.row, end.row);
    let r2 = Math.max(start.row, end.row);
    let c1 = Math.min(start.col, end.col);
    let c2 = Math.max(start.col, end.col);
    // A whole column or row stops at the cells the sheet holds, not Excel's empty million.
    if (start.whole === "col" && end.whole === "col") {
        r1 = 0;
        r2 = Math.max(0, sheet.cells.length - 1);
    }
    if (start.whole === "row" && end.whole === "row") {
        c1 = 0;
        c2 = Math.max(0, sheet.cells.reduce((widest, row) => Math.max(widest, row?.length ?? 0), 1) - 1);
    }
    const out = [];
    const hidden = [];
    const subtotals = [];
    const hiddenRows = new Set(sheet.hiddenRows ?? []);
    for (let r = r1; r <= r2; r += 1) {
        for (let c = c1; c <= c2; c += 1) {
            out.push(cellPrimitive(sheet, r, c, workbook, sheetIndex));
            hidden.push(hiddenRows.has(r));
            subtotals.push(/^(SUBTOTAL|AGGREGATE)\s*\(/i.test(sheet.cells[r]?.[c]?.formula ?? ""));
        }
    }
    return tagRange(out, c2 - c1 + 1, hidden, subtotals, { sheetIndex, r1, c1, r2, c2 });
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
        if (isLambda(nested) || isPending(nested) || isOmitted(nested))
            return "";
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
    const number = numberText(text);
    return number === undefined ? text : number;
}
/**
 * A number a cell shows with grouping, a percent, or accounting parentheses.
 * `1,000` is a thousand, `12%` is 0.12, and `(500)` is minus 500. Plain text stays text.
 */
function numberText(text) {
    const body = text.trim().replace(/[￥¥$€£]\s*/g, "");
    const negative = /^\(.*\)$/.test(body);
    const percent = body.endsWith("%");
    const core = body.replace(/^[()]+|[()]+$/g, "").replace(/%$/, "").replace(/,/g, "");
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(core))
        return undefined;
    const value = Number(core) * (negative ? -1 : 1) * (percent ? 0.01 : 1);
    return Number.isFinite(value) ? value : undefined;
}
/** A one-cell range carries its position, but everywhere else it behaves as its single value. */
function collapse(value) {
    return Array.isArray(value) && value.length === 1 ? value[0] ?? "" : value;
}
function flatten(args) {
    const out = [];
    const areas = [];
    for (const arg of args) {
        const value = collapse(arg);
        if (isLambda(value) || isPending(value) || isOmitted(value) || value instanceof FormulaError)
            continue;
        if (Array.isArray(value)) {
            out.push(...value);
            const parts = rangeAreas(value);
            if (parts.length)
                areas.push(...parts);
        }
        else
            out.push(value);
    }
    // A union flattened for SUM keeps its separate ranges, so AREAS and INDEX can still see them.
    if (areas.length)
        Object.defineProperty(out, "areas", { value: areas, enumerable: false });
    return out;
}
function isPending(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof FormulaError) && "name" in value && !("params" in value);
}
function isPendingFunction(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof FormulaError) && "fn" in value;
}
function isLambda(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof FormulaError) && "params" in value && "body" in value;
}
function isOmitted(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof FormulaError) && "omitted" in value;
}
/** An array constant only holds scalars, so a nested range contributes its first value. */
function scalarPrimitive(value) {
    if (Array.isArray(value))
        return scalarPrimitive(value[0] ?? "");
    if (value instanceof FormulaError || isLambda(value) || isPending(value) || isOmitted(value))
        return "";
    return value;
}
/** Runs a LAMBDA body with each parameter bound to the matching argument. */
function applyLambda(lambda, args, ctx) {
    const required = lambda.params.length - lambda.optional.length;
    if (args.length < required || args.length > lambda.params.length)
        return E.VALUE();
    const bound = new Map(lambda.params.map((param, index) => [param, args[index] ?? { omitted: true }]));
    return new Parser(rewrite(lambda.body, bound), ctx).parseExpression();
}
/** Replaces each bound name in the tokens, including names nested inside a LAMBDA body. */
function rewrite(tokens, names) {
    return tokens.flatMap((token) => (token.kind === "id" && names.has(token.value) ? valueTokens(names.get(token.value)) : [token]));
}
/** Turns a computed value back into the tokens a LAMBDA body can carry. A range becomes an array constant. */
function valueTokens(value) {
    // A marker rather than a call, so the body's own ISOMITTED() is what reads it.
    if (isOmitted(value))
        return [{ kind: "id", value: "\u0000OMITTED" }];
    if (typeof value === "number")
        return [{ kind: "num", value }];
    if (typeof value === "boolean")
        return [{ kind: "id", value: value ? "TRUE" : "FALSE" }];
    if (typeof value === "string")
        return [{ kind: "str", value }];
    if (value instanceof FormulaError)
        return [{ kind: "str", value: value.code }];
    if (isLambda(value) || isPending(value))
        return [];
    const width = rangeWidth(value);
    const rows = Math.max(1, Math.ceil(value.length / width));
    const tokens = [{ kind: "lb" }];
    for (let row = 0; row < rows; row += 1) {
        if (row > 0)
            tokens.push({ kind: "semi" });
        for (let col = 0; col < width; col += 1) {
            if (col > 0)
                tokens.push({ kind: "comma" });
            const cell = value[row * width + col];
            tokens.push(typeof cell === "number" ? { kind: "num", value: cell } : { kind: "str", value: cell === undefined ? "" : String(cell) });
        }
    }
    tokens.push({ kind: "rb" });
    return tokens;
}
function numbers(args) {
    return flatten(args)
        .map((item) => (typeof item === "number" ? item : typeof item === "boolean" ? Number(item) : Number(item)))
        .filter((item) => Number.isFinite(item));
}
/** A number, or a date written as text such as `2026-1-31` or `2026-1-31 13:30`. */
function asDate(value) {
    if (typeof value === "string") {
        const date = dateText(value) ?? timeText(value);
        if (date !== undefined)
            return date;
        return E.VALUE();
    }
    if (Array.isArray(value) && value.length === 1)
        return asDate(value[0] ?? "");
    return asNumber(value);
}
/** `2026-1-31`, `2026/1/31`, and either followed by a time, as an Excel serial. A day past the calendar is not a date. */
function dateText(text) {
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(text.trim());
    if (!match)
        return undefined;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return undefined;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
        return undefined;
    const time = match[4] === undefined ? 0 : clock(Number(match[4]), Number(match[5]), Number(match[6] ?? 0));
    return time === undefined ? undefined : date.getTime() / 86400000 + 25569 + time;
}
/** `13:30` and `13:30:05` as the fraction of a day. An hour past 23 is not a time. */
function timeText(text) {
    const match = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(text.trim());
    if (!match)
        return undefined;
    return clock(Number(match[1]), Number(match[2]), Number(match[3] ?? 0));
}
function clock(hours, minutes, seconds) {
    if (hours > 23 || minutes > 59 || seconds > 59)
        return undefined;
    return (hours * 3600 + minutes * 60 + seconds) / 86400;
}
function asNumber(value) {
    if (isPending(value))
        return E.NAME();
    if (isLambda(value))
        return E.VALUE();
    if (Array.isArray(value) && value.length === 1)
        return asNumber(value[0] ?? "");
    if (value instanceof FormulaError)
        return value;
    if (Array.isArray(value))
        return asNumber(value[0] ?? "");
    if (typeof value === "number")
        return value;
    if (typeof value === "boolean")
        return value ? 1 : 0;
    if (typeof value !== "string")
        return E.VALUE();
    if (value === "")
        return 0;
    const time = timeText(value);
    if (time !== undefined)
        return time;
    const date = dateText(value);
    if (date !== undefined)
        return date;
    const shown = numberText(value);
    if (shown !== undefined)
        return shown;
    const num = Number(value);
    return Number.isFinite(num) ? num : E.VALUE();
}
function asText(value) {
    if (isLambda(value))
        return "";
    if (Array.isArray(value) && value.length === 1)
        return asText(value[0] ?? "");
    if (value instanceof FormulaError)
        return value.code;
    if (Array.isArray(value))
        return asText(value[0] ?? "");
    if (typeof value === "boolean")
        return value ? "TRUE" : "FALSE";
    return String(value);
}
function asBool(value) {
    if (isPending(value))
        return E.NAME();
    if (isLambda(value))
        return E.VALUE();
    if (Array.isArray(value) && value.length === 1)
        return asBool(value[0] ?? false);
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
    const lifted = lift(left, right, (a, b) => {
        if (a instanceof FormulaError)
            return a;
        if (b instanceof FormulaError)
            return b;
        const x = asNumber(a);
        if (x instanceof FormulaError)
            return x;
        const y = asNumber(b);
        if (y instanceof FormulaError)
            return y;
        return op(x, y);
    });
    if (lifted)
        return lifted;
    const a = asNumber(left);
    if (a instanceof FormulaError)
        return a;
    const b = asNumber(right);
    if (b instanceof FormulaError)
        return b;
    return op(a, b);
}
const ERROR_CODES = new Set(["#DIV/0!", "#N/A", "#NAME?", "#NULL!", "#NUM!", "#VALUE!", "#REF!", "#SPILL!", "#CALC!"]);
function isMulti(value) {
    return Array.isArray(value) && value.length > 1;
}
/**
 * An operator between two ranges runs once per cell. A single value spreads across the
 * other side, and a single row against a single column fills the block. A side that is
 * shorter, and not a single row or column, leaves #N/A in the cells it does not cover.
 * Returns undefined when both sides are single values, so the scalar path stays as it was.
 */
function lift(left, right, op) {
    if (!isMulti(left) && !isMulti(right))
        return undefined;
    if (left instanceof FormulaError)
        return left;
    if (right instanceof FormulaError)
        return right;
    if (isPending(left) || isPending(right))
        return E.NAME();
    if (isLambda(left) || isLambda(right))
        return E.VALUE();
    const a = gridOf(left);
    const b = gridOf(right);
    const rows = Math.max(a.rows, b.rows);
    const cols = Math.max(a.cols, b.cols);
    const out = [];
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            const cell = op(a.at(r, c), b.at(r, c));
            out.push(cell instanceof FormulaError ? cell.code : cell);
        }
    }
    return withWidth(out, cols);
}
function gridOf(value) {
    if (!isMulti(value)) {
        const cell = Array.isArray(value) ? (value[0] ?? "") : value instanceof FormulaError || isPending(value) || isLambda(value) || isOmitted(value) ? "" : value;
        return { rows: 1, cols: 1, at: () => cell };
    }
    const cols = rangeWidth(value);
    const rows = Math.ceil(value.length / cols);
    return {
        rows,
        cols,
        at: (row, col) => {
            const r = rows === 1 ? 0 : row;
            const c = cols === 1 ? 0 : col;
            if (r >= rows || c >= cols)
                return E.NA();
            const item = value[r * cols + c] ?? "";
            return typeof item === "string" && ERROR_CODES.has(item) ? new FormulaError(item) : item;
        },
    };
}
function compare(left, right, op) {
    const lifted = lift(left, right, (a, b) => {
        if (a instanceof FormulaError)
            return a;
        if (b instanceof FormulaError)
            return b;
        const result = compare(a, b, op);
        return result instanceof FormulaError ? result : result === true;
    });
    if (lifted)
        return lifted;
    if (isPending(left) || isPending(right))
        return E.NAME();
    if (isLambda(left) || isLambda(right))
        return E.VALUE();
    if (left instanceof FormulaError)
        return left;
    if (right instanceof FormulaError)
        return right;
    const flat = (value) => {
        const cell = Array.isArray(value) && value.length === 1 ? value[0] ?? "" : value;
        if (typeof cell === "string")
            return dateText(cell) ?? timeText(cell) ?? cell;
        // A serial joined with & comes back as its date text, so a serial compares as that date too.
        if (typeof cell === "number" && cell > 20000 && cell < 100000) {
            const whole = Math.floor(cell);
            const date = new Date(Math.round((whole - 25569) * 86400000));
            const month = String(date.getUTCMonth() + 1).padStart(2, "0");
            const day = String(date.getUTCDate()).padStart(2, "0");
            return dateText(`${date.getUTCFullYear()}-${month}-${day}`) ?? cell;
        }
        return cell;
    };
    const l = flat(left);
    const r = flat(right);
    if (Array.isArray(l) || Array.isArray(r))
        return E.VALUE();
    const ln = typeof l === "number" || (typeof l === "string" && /^-?\d+(?:\.\d+)?$/.test(l)) ? Number(l) : null;
    const rn = typeof r === "number" || (typeof r === "string" && /^-?\d+(?:\.\d+)?$/.test(r)) ? Number(r) : null;
    let cmp;
    if (ln !== null && rn !== null && Number.isFinite(ln) && Number.isFinite(rn))
        cmp = ln - rn;
    else if ((ln === null) !== (rn === null) && op !== "=" && op !== "<>")
        return false;
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
/** Functions that read a range as a whole. Everything else runs once per cell. */
const TAKES_RANGE = new Set([
    "SUM", "AVERAGE", "COUNT", "COUNTA", "COUNTBLANK", "MIN", "MAX", "AND", "OR", "XOR",
    "SUMIF", "SUMIFS", "COUNTIF", "COUNTIFS", "AVERAGEIF", "AVERAGEIFS", "MAXIFS", "MINIFS",
    "SUMPRODUCT", "PRODUCT", "SUMSQ", "GCD", "LCM", "MULTINOMIAL", "CONCAT", "CONCATENATE", "TEXTJOIN",
    "AVERAGEA", "MAXA", "MINA", "SUBTOTAL", "AGGREGATE",
    "STDEV", "STDEV.P", "STDEV.S", "STDEVA", "STDEVP", "STDEVPA",
    "VAR", "VAR.P", "VAR.S", "VARA", "VARP", "VARPA",
    "MEDIAN", "MODE", "MODE.MULT", "MODE.SNGL", "LARGE", "SMALL",
    "PERCENTILE", "PERCENTILE.EXC", "PERCENTILE.INC", "QUARTILE", "QUARTILE.EXC", "QUARTILE.INC",
    "PERCENTRANK", "PERCENTRANK.EXC", "PERCENTRANK.INC", "PERCENTOF",
    "RANK", "RANK.AVG", "RANK.EQ", "CORREL", "PEARSON", "COVAR", "COVARIANCE.P", "COVARIANCE.S",
    "FORECAST", "FORECAST.LINEAR", "FORECAST.ETS", "FORECAST.ETS.CONFINT", "FORECAST.ETS.SEASONALITY", "FORECAST.ETS.STAT",
    "TREND", "GROWTH", "LINEST", "LOGEST", "SLOPE", "INTERCEPT", "RSQ", "STEYX",
    "GEOMEAN", "HARMEAN", "TRIMMEAN", "AVEDEV", "DEVSQ", "SKEW", "SKEW.P", "KURT", "FREQUENCY",
    "CHISQ.TEST", "F.TEST", "T.TEST", "Z.TEST", "CHITEST", "FTEST", "TTEST", "ZTEST", "PROB",
    "SUMX2MY2", "SUMX2PY2", "SUMXMY2",
    "VLOOKUP", "HLOOKUP", "XLOOKUP", "LOOKUP", "INDEX", "MATCH", "XMATCH",
    "OFFSET", "INDIRECT", "TRANSPOSE", "ADDRESS", "ROW", "COLUMN", "ROWS", "COLUMNS", "CHOOSE",
    "FORMULATEXT", "HYPERLINK", "SHEET", "SHEETS", "CELL", "AREAS", "INFO", "IMAGE", "ISFORMULA", "ISREF", "PHONETIC",
    "SEQUENCE", "UNIQUE", "SORT", "SORTBY", "FILTER", "HSTACK", "VSTACK", "MAKEARRAY", "MAP", "REDUCE", "SCAN",
    "BYROW", "BYCOL", "TAKE", "DROP", "CHOOSECOLS", "CHOOSEROWS", "TOCOL", "TOROW", "WRAPROWS", "WRAPCOLS",
    "EXPAND", "RANDARRAY", "GROUPBY", "PIVOTBY", "MMULT", "MDETERM", "MINVERSE", "MUNIT", "TRIMRANGE",
    "ARRAYTOTEXT", "TEXTSPLIT", "SERIESSUM",
    "DAVERAGE", "DCOUNT", "DCOUNTA", "DGET", "DMAX", "DMIN", "DPRODUCT", "DSTDEV", "DSTDEVP", "DSUM", "DVAR", "DVARP",
    "NPV", "IRR", "XIRR", "XNPV", "MIRR", "FVSCHEDULE", "IMSUM", "IMPRODUCT",
    "NETWORKDAYS", "NETWORKDAYS.INTL", "WORKDAY", "WORKDAY.INTL",
]);
const ERROR_TRAPS = new Set(["IFERROR", "IFNA", "ISERROR", "ISERR", "ISNA", "ERROR.TYPE"]);
/** Runs a scalar function on every cell. A single value spreads; a short side leaves #N/A. */
function elementwise(name, args, ctx) {
    const grids = args.map(gridOf);
    const rows = Math.max(1, ...grids.map((grid) => grid.rows));
    const cols = Math.max(1, ...grids.map((grid) => grid.cols));
    const out = [];
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            const cellArgs = grids.map((grid) => grid.at(r, c));
            const bad = ERROR_TRAPS.has(name) ? undefined : cellArgs.find((item) => item instanceof FormulaError);
            if (bad instanceof FormulaError) {
                out.push(bad.code);
                continue;
            }
            const result = callFunction(name, cellArgs, ctx);
            if (result instanceof FormulaError)
                out.push(result.code);
            else if (typeof result === "number" || typeof result === "string" || typeof result === "boolean")
                out.push(result);
            else
                out.push(asText(result));
        }
    }
    return withWidth(out, cols);
}
function callFunction(name, args, ctx) {
    if (args.some(isMulti) && !TAKES_RANGE.has(name))
        return elementwise(name, args, ctx);
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
        case "XOR": {
            let trues = 0;
            let seen = false;
            for (const arg of flatten(args)) {
                if (arg === "")
                    continue;
                const flag = asBool(arg);
                if (flag instanceof FormulaError)
                    return flag;
                seen = true;
                if (flag)
                    trues += 1;
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
        case "TRUNC": {
            const n = asNumber(args[0] ?? 0);
            const d = asNumber(args[1] ?? 0);
            if (n instanceof FormulaError)
                return n;
            if (d instanceof FormulaError)
                return d;
            const factor = 10 ** Math.trunc(d);
            return Math.trunc(n * factor) / factor;
        }
        case "MROUND": {
            const n = asNumber(args[0] ?? 0);
            const multiple = asNumber(args[1] ?? 0);
            if (n instanceof FormulaError)
                return n;
            if (multiple instanceof FormulaError)
                return multiple;
            if (n === 0 || multiple === 0)
                return 0;
            if (n > 0 !== multiple > 0)
                return E.NUM();
            return Math.round(n / multiple) * multiple;
        }
        case "QUOTIENT": {
            const n = asNumber(args[0] ?? 0);
            const d = asNumber(args[1] ?? 0);
            if (n instanceof FormulaError)
                return n;
            if (d instanceof FormulaError)
                return d;
            if (d === 0)
                return E.DIV0();
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
            if (n instanceof FormulaError)
                return n;
            return evenOdd(n, name === "ODD");
        }
        case "RAND":
            return Math.random();
        case "RANDBETWEEN": {
            const low = asNumber(args[0] ?? 0);
            const high = asNumber(args[1] ?? 0);
            if (low instanceof FormulaError)
                return low;
            if (high instanceof FormulaError)
                return high;
            const first = Math.ceil(Math.min(low, high));
            const last = Math.floor(Math.max(low, high));
            if (first > last)
                return E.NUM();
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
        case "ISERROR":
            return args[0] instanceof FormulaError;
        case "ISERR":
            return args[0] instanceof FormulaError && args[0].code !== "#N/A";
        case "ISNA":
            return args[0] instanceof FormulaError && args[0].code === "#N/A";
        case "ISOMITTED":
            return isOmitted(args[0]);
        case "ISLOGICAL": {
            const v = collapse(args[0] ?? "");
            return typeof v === "boolean";
        }
        case "ISNONTEXT": {
            const v = collapse(args[0] ?? "");
            return typeof v !== "string";
        }
        case "ISFORMULA":
            return cellHasFormula(ctx, args[0]);
        case "ERROR.TYPE": {
            const v = collapse(args[0] ?? "");
            if (!(v instanceof FormulaError))
                return E.NA();
            const codes = ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"];
            const index = codes.indexOf(v.code);
            return index < 0 ? E.NA() : index + 1;
        }
        case "ISEVEN":
        case "ISODD": {
            const n = asNumber(args[0] ?? 0);
            if (n instanceof FormulaError)
                return n;
            return Math.trunc(Math.abs(n)) % 2 === (name === "ISEVEN" ? 0 : 1);
        }
        case "N": {
            const v = collapse(args[0] ?? 0);
            if (v instanceof FormulaError)
                return v;
            if (typeof v === "number")
                return v;
            if (typeof v === "boolean")
                return v ? 1 : 0;
            return 0;
        }
        case "T": {
            const v = collapse(args[0] ?? "");
            if (v instanceof FormulaError)
                return v;
            return typeof v === "string" ? v : "";
        }
        case "TYPE": {
            const v = collapse(args[0] ?? "");
            if (Array.isArray(v))
                return 64;
            if (typeof v === "number")
                return 1;
            if (typeof v === "string")
                return 2;
            if (typeof v === "boolean")
                return 4;
            return 16;
        }
        case "IFERROR": {
            const primary = args[0];
            if (primary instanceof FormulaError)
                return args[1] ?? "";
            return primary ?? "";
        }
        case "ROW":
            return rowNumbers(args[0], ctx);
        case "COLUMN":
            return columnNumbers(args[0], ctx);
        case "ROWS":
            return rowsOf(args[0]);
        case "COLUMNS":
            return columnsOf(args[0]);
        case "ADDRESS": {
            const row = asNumber(args[0] ?? 1);
            const col = asNumber(args[1] ?? 1);
            if (row instanceof FormulaError)
                return row;
            if (col instanceof FormulaError)
                return col;
            if (row < 1 || col < 1)
                return E.VALUE();
            const abs = asNumber(args[2] ?? 1);
            if (abs instanceof FormulaError)
                return abs;
            const lockRow = abs === 1 || abs === 2;
            const lockCol = abs === 1 || abs === 3;
            const sheet = args[4] === undefined ? "" : `'${asText(args[4]).replace(/'/g, "''")}'!`;
            return `${sheet}${lockCol ? "$" : ""}${columnName(Math.floor(col) - 1)}${lockRow ? "$" : ""}${Math.floor(row)}`;
        }
        case "CHOOSE": {
            const index = asNumber(args[0] ?? 0);
            if (index instanceof FormulaError)
                return index;
            const pick = args[Math.floor(index)];
            return pick === undefined ? E.VALUE() : pick;
        }
        case "TRANSPOSE": {
            const table = args[0];
            if (!(table instanceof Array))
                return table ?? E.VALUE();
            const width = rangeWidth(table);
            const height = Math.ceil(table.length / width);
            const out = [];
            for (let c = 0; c < width; c += 1) {
                for (let r = 0; r < height; r += 1)
                    out.push(table[r * width + c] ?? "");
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
            const serial = asDate(args[0] ?? 0);
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
            // The fourth argument picks one area of a union, counting from one.
            if (args[3] !== undefined) {
                const areas = rangeAreas(args[0] ?? "");
                if (!areas.length)
                    return E.REF();
                const which = asNumber(args[3]);
                if (which instanceof FormulaError)
                    return which;
                const area = areas[Math.floor(which) - 1];
                if (!area)
                    return E.REF();
                return callFunction("INDEX", [area, args[1] ?? 1, args[2] ?? 1], ctx);
            }
            const table = args[0];
            const row = asNumber(args[1] ?? 1);
            const col = asNumber(args[2] ?? 1);
            if (!(table instanceof Array))
                return table ?? E.REF();
            if (row instanceof FormulaError)
                return row;
            if (col instanceof FormulaError)
                return col;
            const width = rangeWidth(table);
            const height = Math.ceil(table.length / width);
            const rowAt = Math.floor(row);
            const colAt = Math.floor(col);
            if (rowAt < 0 || rowAt > height || colAt < 0 || colAt > width)
                return E.REF();
            // A zero picks the whole row or the whole column, so SUM(INDEX(A1:B3,0,2)) adds the column.
            if (rowAt === 0 || colAt === 0) {
                if (args[2] === undefined)
                    return E.REF();
                const out = [];
                const r1 = rowAt === 0 ? 0 : rowAt - 1;
                const r2 = rowAt === 0 ? height - 1 : rowAt - 1;
                const c1 = colAt === 0 ? 0 : colAt - 1;
                const c2 = colAt === 0 ? width - 1 : colAt - 1;
                for (let r = r1; r <= r2; r += 1) {
                    for (let c = c1; c <= c2; c += 1)
                        out.push(table[r * width + c] ?? "");
                }
                return out.length === 1 ? out[0] ?? "" : withWidth(out, c2 - c1 + 1);
            }
            if (args[2] === undefined)
                return table[rowAt - 1] ?? E.REF();
            return table[(rowAt - 1) * width + (colAt - 1)] ?? E.REF();
        }
        case "MATCH":
        case "XMATCH": {
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
            if (at < 0)
                return args[3] !== undefined ? scalar(args[3]) : E.NA();
            return at + 1;
        }
        case "LOOKUP": {
            const needle = scalar(args[0]);
            const lookup = args[1];
            if (needle instanceof FormulaError)
                return needle;
            if (!(lookup instanceof Array))
                return E.NA();
            const result = Array.isArray(args[2]) ? args[2] : lookup;
            const width = rangeWidth(lookup);
            const rows = Math.ceil(lookup.length / width);
            const across = rows === 1;
            const column = [];
            for (let i = 0; i < (across ? width : rows); i += 1)
                column.push(lookup[across ? i : i * width] ?? "");
            const at = approxIndex(column, needle, -1);
            if (at < 0)
                return E.NA();
            const resultWidth = rangeWidth(result);
            const resultRows = Math.ceil(result.length / resultWidth);
            if (across && resultRows === 1)
                return result[at] ?? E.NA();
            return result[at * resultWidth + resultWidth - 1] ?? E.NA();
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
        case "MAXIFS":
        case "MINIFS":
            return extremeIf(name, args);
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
        case "TEXTSPLIT": {
            const text = asText(args[0] ?? "");
            const colDelim = asText(args[1] ?? "");
            const rowDelim = args[2] === undefined ? "" : asText(args[2]);
            if (!colDelim && !rowDelim)
                return E.VALUE();
            const lines = rowDelim ? text.split(rowDelim) : [text];
            const rows = lines.map((line) => (colDelim ? line.split(colDelim) : [line]));
            const width = rows.reduce((widest, line) => Math.max(widest, line.length), 1);
            const pad = args[3] === undefined ? "" : asText(args[3]);
            const out = [];
            for (const line of rows) {
                for (let i = 0; i < width; i += 1)
                    out.push(line[i] ?? pad);
            }
            return withWidth(out, width);
        }
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
        case "RANK":
        case "RANK.EQ": {
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
        case "WEEKNUM": {
            const serial = asNumber(args[0] ?? 0);
            const system = asNumber(args[1] ?? 1);
            if (serial instanceof FormulaError)
                return serial;
            if (system instanceof FormulaError)
                return system;
            return weekNumber(serial, system);
        }
        case "ISOWEEKNUM": {
            const serial = asNumber(args[0] ?? 0);
            if (serial instanceof FormulaError)
                return serial;
            return isoWeekNumber(serial);
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
            const serial = asDate(args[0] ?? 0);
            if (serial instanceof FormulaError)
                return serial;
            const seconds = Math.round((((serial % 1) + 1) % 1) * 86400);
            if (name === "HOUR")
                return Math.floor(seconds / 3600);
            if (name === "MINUTE")
                return Math.floor(seconds / 60) % 60;
            return seconds % 60;
        }
        case "DATEVALUE":
            return dateText(asText(args[0] ?? "")) ?? E.VALUE();
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
        case "BIN2HEX":
        case "BIN2OCT":
        case "DEC2BIN":
        case "HEX2DEC":
        case "HEX2BIN":
        case "HEX2OCT":
        case "DEC2HEX":
        case "OCT2DEC":
        case "OCT2BIN":
        case "OCT2HEX":
        case "DEC2OCT":
            return baseConvert(name, args);
        case "CONVERT": {
            const value = asNumber(args[0] ?? 0);
            if (value instanceof FormulaError)
                return value;
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
        case "DSTDEVP":
        case "DVAR":
        case "DVARP":
        case "DGET":
            return database(name, args);
        case "DAYS360": {
            const start = asNumber(args[0] ?? 0);
            const end = asNumber(args[1] ?? 0);
            if (start instanceof FormulaError)
                return start;
            if (end instanceof FormulaError)
                return end;
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
            if (end instanceof FormulaError)
                return end;
            if (start instanceof FormulaError)
                return start;
            return Math.round(end - start);
        }
        case "WORKDAY.INTL": {
            const start = asNumber(args[0] ?? 0);
            const days = asNumber(args[1] ?? 0);
            const weekend = asNumber(args[2] ?? 1);
            if (start instanceof FormulaError)
                return start;
            if (days instanceof FormulaError)
                return days;
            if (weekend instanceof FormulaError)
                return weekend;
            const mask = weekendMask(weekend);
            return mask instanceof FormulaError ? mask : workdayIntl(start, days, mask);
        }
        case "NETWORKDAYS.INTL": {
            const start = asNumber(args[0] ?? 0);
            const end = asNumber(args[1] ?? 0);
            const weekend = asNumber(args[2] ?? 1);
            if (start instanceof FormulaError)
                return start;
            if (end instanceof FormulaError)
                return end;
            if (weekend instanceof FormulaError)
                return weekend;
            const mask = weekendMask(weekend);
            return mask instanceof FormulaError ? mask : networkDaysIntl(start, end, mask);
        }
        case "COUPDAYS":
        case "COUPDAYBS":
        case "COUPDAYSNC":
        case "COUPNUM":
        case "COUPPCD":
        case "COUPNCD": {
            const settle = asNumber(args[0] ?? 0);
            const mature = asNumber(args[1] ?? 0);
            const frequency = asNumber(args[2] ?? 0);
            if (settle instanceof FormulaError)
                return settle;
            if (mature instanceof FormulaError)
                return mature;
            if (frequency instanceof FormulaError)
                return frequency;
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
            if (first instanceof FormulaError)
                return first;
            if (periods instanceof FormulaError)
                return periods;
            if (first <= 0 || periods < 1)
                return E.NUM();
            const n = Math.floor(periods);
            return name === "EFFECT" ? (1 + first / n) ** n - 1 : ((1 + first) ** (1 / n) - 1) * n;
        }
        case "SLOPE":
        case "INTERCEPT":
        case "RSQ":
        case "STEYX":
            return regression(name, numbers(args.slice(0, 1)), numbers(args.slice(1, 2)));
        case "NORM.DIST":
        case "NORM.S.DIST":
        case "NORM.INV":
        case "NORM.S.INV":
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
        case "SKEW.P":
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
        case "DBCS":
            return textExtra(name, args);
        case "TREND":
        case "GROWTH":
        case "LINEST":
        case "LOGEST":
            return trend(name, args);
        case "FVSCHEDULE":
        case "ISPMT":
        case "MDURATION":
        case "PRICEDISC":
        case "YIELDDISC":
        case "TBILLEQ":
        case "VDB":
            return financeMore(name, args);
        case "BINOM.DIST":
        case "POISSON.DIST":
        case "EXPON.DIST":
        case "LOGNORM.DIST":
        case "CHISQ.DIST":
        case "T.DIST":
        case "F.DIST":
        case "CONFIDENCE.NORM":
        case "PERCENTRANK.INC":
        case "PERCENTRANK.EXC":
        case "ERF":
        case "ERFC":
            return distFn(name, args);
        case "SUMX2MY2":
        case "SUMX2PY2":
        case "SUMXMY2":
        case "MULTINOMIAL":
        case "SQRTPI":
        case "TIMEVALUE":
            return mathExtra(name, args);
        case "AVERAGEA":
        case "MAXA":
        case "MINA":
        case "STDEVA":
        case "VARA":
        case "COVARIANCE.P":
        case "COVARIANCE.S":
        case "RANK.AVG":
        case "MODE.MULT":
        case "STANDARDIZE":
        case "PHI":
        case "GAUSS":
        case "FISHER":
        case "FISHERINV":
        case "LOGNORM.INV":
        case "BINOM.DIST.RANGE":
        case "BINOM.INV":
        case "T.INV":
        case "T.DIST.2T":
        case "T.DIST.RT":
        case "F.INV":
        case "F.DIST.RT":
        case "CHISQ.INV":
        case "CHISQ.DIST.RT":
        case "MDETERM":
        case "MINVERSE":
        case "MIRR":
        case "XNPV":
        case "FORMULATEXT":
        case "ISREF":
        case "SHEET":
        case "SHEETS":
        case "HYPERLINK":
        case "RANDARRAY":
        case "AGGREGATE":
        case "COMBINA":
        case "FACTDOUBLE":
        case "PERMUTATIONA":
        case "CEILING.MATH":
        case "FLOOR.MATH":
        case "BASE":
        case "DECIMAL":
        case "ROMAN":
        case "ARABIC":
        case "BITAND":
        case "BITOR":
        case "BITXOR":
        case "BITLSHIFT":
        case "BITRSHIFT":
        case "SINH":
        case "COSH":
        case "TANH":
        case "ASINH":
        case "ACOSH":
        case "ATANH":
        case "SEC":
        case "CSC":
        case "COT":
        case "GAMMA":
        case "GAMMALN":
        case "GAMMALN.PRECISE":
        case "TBILLYIELD":
        case "ACCRINTM":
        case "DOLLARDE":
        case "DOLLARFR":
        case "DELTA":
        case "GESTEP":
            return catalog(name, args, ctx);
        case "ACOT":
        case "ACOTH":
        case "SECH":
        case "CSCH":
        case "COTH":
        case "T.INV.2T":
        case "F.INV.RT":
        case "CHISQ.INV.RT":
        case "CONFIDENCE.T":
        case "GAMMA.DIST":
        case "GAMMA.INV":
        case "WEIBULL.DIST":
        case "HYPGEOM.DIST":
        case "NEGBINOM.DIST":
        case "BETA.DIST":
        case "BETA.INV":
        case "Z.TEST":
        case "PROB":
        case "CHISQ.TEST":
        case "INTRATE":
        case "RECEIVED":
        case "PRICEMAT":
        case "YIELDMAT":
        case "ENCODEURL":
        case "SERIESSUM":
        case "BAHTTEXT":
        case "CELL":
        case "BESSELJ":
        case "BESSELY":
        case "BESSELI":
        case "BESSELK":
        case "COMPLEX":
        case "IMABS":
        case "IMAGINARY":
        case "IMARGUMENT":
        case "IMCONJUGATE":
        case "IMDIV":
        case "IMEXP":
        case "IMLN":
        case "IMLOG10":
        case "IMLOG2":
        case "IMPOWER":
        case "IMPRODUCT":
        case "IMREAL":
        case "IMSQRT":
        case "IMSUB":
        case "IMSUM":
        case "IMCOS":
        case "IMCOSH":
        case "IMCOT":
        case "IMCSC":
        case "IMCSCH":
        case "IMSEC":
        case "IMSECH":
        case "IMSIN":
        case "IMSINH":
        case "IMTAN":
        case "BETADIST":
        case "BETAINV":
        case "BINOMDIST":
        case "CHIDIST":
        case "CHIINV":
        case "CHITEST":
        case "CONFIDENCE":
        case "COVAR":
        case "CRITBINOM":
        case "EXPONDIST":
        case "FDIST":
        case "FINV":
        case "FTEST":
        case "GAMMADIST":
        case "GAMMAINV":
        case "HYPGEOMDIST":
        case "LOGINV":
        case "LOGNORMDIST":
        case "NEGBINOMDIST":
        case "NORMDIST":
        case "NORMINV":
        case "POISSON":
        case "TDIST":
        case "TINV":
        case "TTEST":
        case "WEIBULL":
        case "ZTEST":
        case "CEILING.PRECISE":
        case "FLOOR.PRECISE":
        case "ERF.PRECISE":
        case "ERFC.PRECISE":
        case "ISO.CEILING":
        case "MUNIT":
        case "ARRAYTOTEXT":
        case "VALUETOTEXT":
        case "REGEXEXTRACT":
        case "REGEXREPLACE":
        case "REGEXTEST":
        case "JIS":
        case "PHONETIC":
        case "INFO":
        case "AREAS":
        case "PERCENTOF":
        case "VARPA":
        case "STDEVPA":
        case "F.TEST":
        case "T.TEST":
        case "EUROCONVERT":
        case "AMORDEGRC":
        case "AMORLINC":
        case "ODDFPRICE":
        case "ODDFYIELD":
        case "ODDLPRICE":
        case "ODDLYIELD":
        case "FORECAST.ETS":
        case "FORECAST.ETS.CONFINT":
        case "FORECAST.ETS.SEASONALITY":
        case "FORECAST.ETS.STAT":
        case "TRIMRANGE":
        case "IMAGE":
        case "GROUPBY":
        case "PIVOTBY":
            return extended(name, args, ctx);
        default:
            return E.NAME();
    }
}
/**
 * Reshapes an array. TAKE and DROP keep or skip rows and columns from either end, CHOOSECOLS and CHOOSEROWS
 * pick by number, TOCOL and TOROW flatten, WRAPROWS and WRAPCOLS fold a list, and EXPAND pads to a size.
 */
function reshape(name, args) {
    const source = args[0];
    if (!Array.isArray(source))
        return E.VALUE();
    const width = rangeWidth(source);
    const height = Math.ceil(source.length / width);
    const count = (value, fallback) => {
        if (value === undefined)
            return fallback;
        const parsed = asNumber(value);
        return parsed instanceof FormulaError ? parsed : Math.trunc(parsed);
    };
    if (name === "TOCOL" || name === "TOROW") {
        const scanByRow = asNumber(args[1] ?? 0);
        if (scanByRow instanceof FormulaError)
            return scanByRow;
        const ignore = asNumber(args[2] ?? 0);
        if (ignore instanceof FormulaError)
            return ignore;
        const out = [];
        const read = (row, col) => {
            const cell = source[row * width + col] ?? "";
            if ((ignore === 1 || ignore === 3) && cell === "")
                return;
            out.push(cell);
        };
        const byColumn = scanByRow !== 0;
        if (byColumn)
            for (let col = 0; col < width; col += 1)
                for (let row = 0; row < height; row += 1)
                    read(row, col);
        else
            for (let row = 0; row < height; row += 1)
                for (let col = 0; col < width; col += 1)
                    read(row, col);
        return withWidth(out, name === "TOROW" ? Math.max(1, out.length) : 1);
    }
    if (name === "WRAPROWS" || name === "WRAPCOLS") {
        const size = count(args[1], 0);
        if (size instanceof FormulaError)
            return size;
        if (size < 1)
            return E.NUM();
        const pad = args[2] === undefined ? "" : scalarPrimitive(args[2]);
        const across = name === "WRAPROWS";
        const lines = Math.ceil(source.length / size);
        const out = [];
        for (let line = 0; line < lines; line += 1) {
            for (let i = 0; i < size; i += 1)
                out.push(source[(across ? line * size : i * lines) + (across ? i : line)] ?? pad);
        }
        return withWidth(out, across ? size : lines);
    }
    if (name === "EXPAND") {
        const rows = count(args[1], height);
        const cols = count(args[2], width);
        if (rows instanceof FormulaError)
            return rows;
        if (cols instanceof FormulaError)
            return cols;
        if (rows < height || cols < width)
            return E.VALUE();
        const pad = args[3] === undefined ? "" : scalarPrimitive(args[3]);
        const out = [];
        for (let row = 0; row < rows; row += 1)
            for (let col = 0; col < cols; col += 1)
                out.push(source[row * width + col] ?? pad);
        return withWidth(out, cols);
    }
    const rows = count(args[1], name.endsWith("ROWS") ? 1 : height);
    if (rows instanceof FormulaError)
        return rows;
    const pick = (total, requested) => {
        if (requested === 0 || Math.abs(requested) > total)
            return E.VALUE();
        const out = [];
        const span = Math.abs(requested);
        for (let i = 0; i < span; i += 1)
            out.push(requested > 0 ? i : total - span + i);
        return out;
    };
    if (name === "TAKE" || name === "DROP") {
        const cols = count(args[2], name === "DROP" ? 0 : width);
        if (cols instanceof FormulaError)
            return cols;
        const dropped = (total, requested) => {
            if (requested === 0)
                return [];
            return pick(total, requested);
        };
        const rowDrop = name === "DROP" ? dropped(height, rows) : pick(height, rows || height);
        if (rowDrop instanceof FormulaError)
            return rowDrop;
        const rowIndex = name === "TAKE" ? rowDrop : [...Array(height).keys()].filter((row) => !rowDrop.includes(row));
        const colDrop = name === "DROP" ? dropped(width, cols) : pick(width, cols || width);
        if (colDrop instanceof FormulaError)
            return colDrop;
        const colIndex = name === "TAKE" ? colDrop : [...Array(width).keys()].filter((col) => !colDrop.includes(col));
        const out = [];
        for (const row of rowIndex)
            for (const col of colIndex)
                out.push(source[row * width + col] ?? "");
        return withWidth(out, Math.max(1, colIndex.length));
    }
    const indexes = [];
    for (const arg of args.slice(1)) {
        const value = asNumber(arg ?? 0);
        if (value instanceof FormulaError)
            return value;
        const index = Math.trunc(value);
        const limit = name === "CHOOSEROWS" ? height : width;
        if (index === 0 || Math.abs(index) > limit)
            return E.VALUE();
        indexes.push(index > 0 ? index - 1 : limit + index);
    }
    if (!indexes.length)
        return E.VALUE();
    const out = [];
    if (name === "CHOOSEROWS")
        for (const row of indexes)
            for (let col = 0; col < width; col += 1)
                out.push(source[row * width + col] ?? "");
    else
        for (let row = 0; row < height; row += 1)
            for (const col of indexes)
                out.push(source[row * width + col] ?? "");
    return withWidth(out, name === "CHOOSEROWS" ? width : indexes.length);
}
/** The descriptive statistics that read one list: means, rank, spread, and the exclusive percentile. */
function statsFn(name, args) {
    if (name === "PERMUT") {
        const n = asNumber(args[0] ?? 0);
        const k = asNumber(args[1] ?? 0);
        if (n instanceof FormulaError)
            return n;
        if (k instanceof FormulaError)
            return k;
        if (n < 0 || k < 0 || k > n || !Number.isInteger(n) || !Number.isInteger(k))
            return E.NUM();
        let out = 1;
        for (let i = 0; i < k; i += 1)
            out *= n - i;
        return out;
    }
    if (name === "FREQUENCY") {
        const data = numbers(args.slice(0, 1));
        const bins = numbers(args.slice(1, 2)).sort((a, b) => a - b);
        const counts = bins.map(() => 0);
        let above = 0;
        for (const value of data) {
            const bin = bins.findIndex((edge) => value <= edge);
            if (bin < 0)
                above += 1;
            else
                counts[bin] = (counts[bin] ?? 0) + 1;
        }
        return withWidth([...counts, above], 1);
    }
    const ranged = name === "PERCENTRANK" || name === "TRIMMEAN" || name === "PERCENTILE.EXC" || name === "QUARTILE.EXC";
    const nums = numbers(ranged ? args.slice(0, 1) : args);
    if (!nums.length)
        return E.NUM();
    if (name === "GEOMEAN") {
        if (nums.some((item) => item <= 0))
            return E.NUM();
        return Math.exp(nums.reduce((sum, item) => sum + Math.log(item), 0) / nums.length);
    }
    if (name === "HARMEAN") {
        if (nums.some((item) => item <= 0))
            return E.NUM();
        return nums.length / nums.reduce((sum, item) => sum + 1 / item, 0);
    }
    const mean = nums.reduce((sum, item) => sum + item, 0) / nums.length;
    if (name === "AVEDEV")
        return nums.reduce((sum, item) => sum + Math.abs(item - mean), 0) / nums.length;
    if (name === "DEVSQ")
        return nums.reduce((sum, item) => sum + (item - mean) ** 2, 0);
    const square = nums.reduce((sum, item) => sum + (item - mean) ** 2, 0);
    if (name === "SKEW" || name === "SKEW.P" || name === "KURT") {
        if (nums.length < (name === "KURT" ? 4 : 3) || square === 0)
            return E.DIV0();
        const deviation = Math.sqrt(square / (name === "SKEW.P" ? nums.length : nums.length - 1));
        const moment = nums.reduce((sum, item) => sum + ((item - mean) / deviation) ** (name === "KURT" ? 4 : 3), 0);
        const n = nums.length;
        if (name === "SKEW.P")
            return moment / n;
        return name === "SKEW" ? (n / ((n - 1) * (n - 2))) * moment : ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * moment - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
    }
    if (name === "PERCENTRANK") {
        const target = asNumber(args[1] ?? 0);
        if (target instanceof FormulaError)
            return target;
        const sorted = [...nums].sort((a, b) => a - b);
        if (target < sorted[0] || target > sorted[sorted.length - 1])
            return E.NA();
        const above = sorted.filter((item) => item < target).length;
        const same = sorted.filter((item) => item === target).length;
        return (above + (same > 1 ? (same - 1) / 2 : 0)) / (sorted.length - 1);
    }
    if (name === "TRIMMEAN") {
        const fraction = asNumber(args[1] ?? 0);
        if (fraction instanceof FormulaError)
            return fraction;
        if (fraction < 0 || fraction >= 1)
            return E.NUM();
        const sorted = [...nums].sort((a, b) => a - b);
        const cut = Math.floor(sorted.length * fraction / 2);
        const kept = sorted.slice(cut, sorted.length - cut);
        return kept.reduce((sum, item) => sum + item, 0) / kept.length;
    }
    const k = asNumber(args[1] ?? 0);
    if (k instanceof FormulaError)
        return k;
    const probe = name === "QUARTILE.EXC" ? k / 4 : k;
    if (probe <= 0 || probe >= 1)
        return E.NUM();
    const sorted = [...nums].sort((a, b) => a - b);
    const position = probe * (sorted.length + 1) - 1;
    if (position < 0 || position > sorted.length - 1)
        return E.NUM();
    const lower = Math.floor(position);
    return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}
/** Loan totals, growth rates, and the straight bond and treasury bill prices. */
function financeExtra(name, args) {
    const values = [];
    for (const arg of args) {
        const value = asNumber(arg ?? 0);
        if (value instanceof FormulaError)
            return value;
        values.push(value);
    }
    const at = (index) => values[index] ?? 0;
    if (name === "CUMPRINC" || name === "CUMIPMT") {
        const [rate, periods, present, first, last] = [at(0), at(1), at(2), at(3), at(4)];
        if (rate <= 0 || periods < 1 || first < 1 || last < first || last > periods)
            return E.NUM();
        const payment = present * rate / (1 - (1 + rate) ** -periods);
        let total = 0;
        let balance = present;
        for (let period = 1; period <= last; period += 1) {
            const interest = balance * rate;
            const principal = payment - interest;
            if (period >= first)
                total += name === "CUMIPMT" ? interest : principal;
            balance -= principal;
        }
        return -Math.abs(total);
    }
    if (name === "RRI" || name === "PDURATION") {
        const [periods, present, future] = [at(0), at(1), at(2)];
        if (present <= 0 || future <= 0 || periods <= 0)
            return E.NUM();
        const growth = Math.log(future / present);
        return name === "RRI" ? Math.exp(growth / periods) - 1 : growth / Math.log(1 + periods);
    }
    if (name === "DISC" || name === "TBILLPRICE") {
        const [settlement, maturity, third, redemption] = [at(0), at(1), at(2), at(3)];
        const days = maturity - settlement;
        if (days <= 0)
            return E.NUM();
        if (name === "TBILLPRICE")
            return 100 * (1 - third * days / 360);
        if (redemption === 0)
            return E.DIV0();
        return (redemption - third) / redemption * (360 / days);
    }
    const rate = at(0);
    if (name === "ACCRINT") {
        const [first, settlement, par, frequency] = [at(1), at(2), at(3), at(4)];
        if (frequency <= 0 || settlement < first)
            return E.NUM();
        return par * rate / frequency * Math.round((settlement - first) / (365 / frequency));
    }
    const [coupon, settlement, maturity, frequency] = [at(1), at(2), at(3), at(4)];
    if (![1, 2, 4].includes(frequency) || maturity <= settlement)
        return E.NUM();
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
    if (present <= 0)
        return E.NUM();
    let low = 0;
    let high = 1;
    for (let step = 0; step < 60; step += 1) {
        const mid = (low + high) / 2;
        let price = 0;
        for (let period = 1; period <= periods; period += 1) {
            price += (coupon / frequency + (period === periods ? 100 : 0)) / (1 + mid / frequency) ** period;
        }
        if (price > present)
            low = mid;
        else
            high = mid;
    }
    return (low + high) / 2;
}
/** NUMBERVALUE reads a number with its own separators. The rest format or clean a text value. */
function textExtra(name, args) {
    const text = asText(args[0] ?? "");
    if (name === "UNICODE")
        return text ? text.codePointAt(0) : E.VALUE();
    if (name === "UNICHAR") {
        const code = asNumber(args[0] ?? 0);
        if (code instanceof FormulaError)
            return code;
        if (code < 1 || code > 0x10ffff)
            return E.VALUE();
        return String.fromCodePoint(Math.floor(code));
    }
    if (name === "CLEAN")
        return text.replace(/[\u0000-\u001f]/g, "");
    if (name === "ASC")
        return text.normalize("NFKC");
    if (name === "DBCS")
        return text;
    if (name === "NUMBERVALUE") {
        const decimal = asText(args[1] ?? ".");
        const group = asText(args[2] ?? ",");
        const cleaned = text.split(group).join("").replace(decimal, ".");
        const value = Number(cleaned.replace(/%$/, ""));
        if (!Number.isFinite(value))
            return E.VALUE();
        return cleaned.endsWith("%") ? value / 100 : value;
    }
    const value = asNumber(args[0] ?? 0);
    if (value instanceof FormulaError)
        return value;
    const digits = name === "DOLLAR" ? asNumber(args[1] ?? 2) : asNumber(args[1] ?? 2);
    if (digits instanceof FormulaError)
        return digits;
    const fixed = value.toFixed(Math.max(0, Math.floor(digits)));
    const [whole, fraction] = fixed.split(".");
    const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const body = fraction === undefined ? grouped : `${grouped}.${fraction}`;
    return name === "DOLLAR" ? `$${body}` : body;
}
/** SORTBY orders the first range by the values in each following range, ascending unless the order is negative. */
function sortBy(args) {
    const table = args[0];
    if (!Array.isArray(table))
        return table ?? E.VALUE();
    const width = rangeWidth(table);
    const rows = Math.ceil(table.length / width);
    const keys = [];
    for (let i = 1; i < args.length; i += 2) {
        const by = args[i];
        if (!Array.isArray(by))
            return E.VALUE();
        const order = i + 1 < args.length ? asNumber(args[i + 1] ?? 1) : 1;
        if (order instanceof FormulaError)
            return order;
        keys.push({ values: by, descending: order < 0 });
    }
    if (!keys.length)
        return E.VALUE();
    const order = [...Array(rows).keys()].sort((a, b) => {
        for (const key of keys) {
            const diff = sortCompare(key.values[a] ?? "", key.values[b] ?? "");
            if (diff !== 0)
                return key.descending ? -diff : diff;
        }
        return 0;
    });
    const out = [];
    for (const row of order)
        out.push(...table.slice(row * width, row * width + width));
    return withWidth(out, width);
}
function sortCompare(left, right) {
    const a = typeof left === "number" ? left : Number.NaN;
    const b = typeof right === "number" ? right : Number.NaN;
    if (Number.isFinite(a) && Number.isFinite(b))
        return a - b;
    return String(left).localeCompare(String(right), undefined, { numeric: true });
}
/** HSTACK places ranges side by side, VSTACK places them one under the other. Short rows and columns are padded. */
function stack(name, args) {
    // A bare function name becomes a marker, so GROUPBY can read a row of them built with HSTACK.
    const held = (value) => (isPending(value) ? { fn: value.name } : scalarPrimitive(value));
    const blocks = args.map((arg) => (Array.isArray(arg) ? arg.map((item) => held(item)) : [held(arg ?? "")]));
    if (!blocks.length)
        return E.VALUE();
    if (name === "VSTACK") {
        const width = blocks.reduce((widest, block) => Math.max(widest, rangeWidth(block)), 1);
        const out = [];
        for (const block of blocks) {
            const blockWidth = rangeWidth(block);
            const rows = Math.ceil(block.length / blockWidth);
            for (let row = 0; row < rows; row += 1) {
                for (let col = 0; col < width; col += 1)
                    out.push(block[row * blockWidth + col] ?? "");
            }
        }
        return withWidth(out, width);
    }
    const height = blocks.reduce((tallest, block) => Math.max(tallest, Math.ceil(block.length / rangeWidth(block))), 1);
    const out = [];
    for (let row = 0; row < height; row += 1) {
        for (const block of blocks) {
            const blockWidth = rangeWidth(block);
            for (let col = 0; col < blockWidth; col += 1)
                out.push(block[row * blockWidth + col] ?? "");
        }
    }
    return withWidth(out, blocks.reduce((sum, block) => sum + rangeWidth(block), 0));
}
/**
 * A database function reads the column named by the second argument from the table, keeping the rows
 * whose cells match every condition in the criteria range. The criteria range starts with field names.
 */
function database(name, args) {
    const table = args[0];
    if (!Array.isArray(table))
        return E.VALUE();
    const width = rangeWidth(table);
    const rows = Math.ceil(table.length / width);
    if (rows < 2)
        return E.VALUE();
    const header = table.slice(0, width).map((cell) => String(cell).toUpperCase());
    const field = args[1];
    const column = typeof field === "number" ? Math.floor(field) - 1 : header.indexOf(asText(field ?? "").toUpperCase());
    if (column < 0 || column >= width)
        return E.VALUE();
    const criteria = args[2];
    if (!Array.isArray(criteria))
        return E.VALUE();
    const criteriaWidth = rangeWidth(criteria);
    const criteriaRows = Math.ceil(criteria.length / criteriaWidth);
    const criteriaCols = criteria.slice(0, criteriaWidth).map((cell) => header.indexOf(String(cell).toUpperCase()));
    const matched = [];
    for (let row = 1; row < rows; row += 1) {
        let ok = criteriaRows < 2;
        for (let line = 1; line < criteriaRows && !ok; line += 1) {
            ok = criteriaCols.every((col, index) => {
                if (col < 0)
                    return true;
                return matches(table[row * width + col] ?? "", criteria[line * criteriaWidth + index] ?? "");
            });
        }
        if (ok)
            matched.push(row);
    }
    const values = matched.map((row) => table[row * width + column] ?? "");
    if (name === "DGET") {
        if (values.length !== 1)
            return E.NUM();
        return values[0] ?? "";
    }
    if (name === "DCOUNT")
        return values.filter((item) => typeof item === "number").length;
    if (name === "DCOUNTA")
        return values.filter((item) => item !== "").length;
    const nums = values.map((item) => asNumber(item)).filter((item) => typeof item === "number");
    if (!nums.length)
        return 0;
    if (name === "DSUM")
        return nums.reduce((sum, item) => sum + item, 0);
    if (name === "DAVERAGE")
        return nums.reduce((sum, item) => sum + item, 0) / nums.length;
    if (name === "DMAX")
        return Math.max(...nums);
    if (name === "DMIN")
        return Math.min(...nums);
    if (name === "DPRODUCT")
        return nums.reduce((product, item) => product * item, 1);
    const mean = nums.reduce((sum, item) => sum + item, 0) / nums.length;
    const spread = nums.reduce((sum, item) => sum + (item - mean) ** 2, 0);
    const population = name === "DSTDEVP" || name === "DVARP";
    const divisor = nums.length - (population ? 0 : 1);
    if (divisor <= 0)
        return E.DIV0();
    const variance = spread / divisor;
    return name === "DSTDEV" || name === "DSTDEVP" ? Math.sqrt(variance) : variance;
}
/** DAYS360 counts each month as 30 days, using the US (NASD) convention. */
function days360(start, end) {
    const from = new Date(Math.round((start - 25569) * 86400000));
    const to = new Date(Math.round((end - 25569) * 86400000));
    const day = (date, cap) => {
        const value = date.getUTCDate();
        return cap && value === 31 ? 30 : value;
    };
    const startDay = day(from, true);
    const endDay = day(to, startDay >= 30);
    return (to.getUTCFullYear() - from.getUTCFullYear()) * 360 + (to.getUTCMonth() - from.getUTCMonth()) * 30 + endDay - startDay;
}
/** MMULT multiplies two matrices. The first range's width must equal the second range's height. */
function matrixProduct(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right))
        return E.VALUE();
    const leftWidth = rangeWidth(left);
    const rightWidth = rangeWidth(right);
    const leftRows = Math.ceil(left.length / leftWidth);
    const rightRows = Math.ceil(right.length / rightWidth);
    if (leftWidth !== rightRows)
        return E.VALUE();
    const out = [];
    for (let row = 0; row < leftRows; row += 1) {
        for (let col = 0; col < rightWidth; col += 1) {
            let sum = 0;
            for (let k = 0; k < leftWidth; k += 1) {
                const a = asNumber(left[row * leftWidth + k] ?? 0);
                const b = asNumber(right[k * rightWidth + col] ?? 0);
                if (a instanceof FormulaError)
                    return a;
                if (b instanceof FormulaError)
                    return b;
                sum += a * b;
            }
            out.push(sum);
        }
    }
    return withWidth(out, rightWidth);
}
/** FORECAST fits a straight line through the known pairs and reads it at x. */
function forecast(args) {
    const x = asNumber(args[0] ?? 0);
    if (x instanceof FormulaError)
        return x;
    const knownY = numbers(args.slice(1, 2));
    const knownX = numbers(args.slice(2, 3));
    const count = Math.min(knownY.length, knownX.length);
    if (count < 2)
        return E.VALUE();
    const xs = knownX.slice(0, count);
    const ys = knownY.slice(0, count);
    const meanX = xs.reduce((sum, item) => sum + item, 0) / count;
    const meanY = ys.reduce((sum, item) => sum + item, 0) / count;
    let across = 0;
    let square = 0;
    for (let i = 0; i < count; i += 1) {
        across += (xs[i] - meanX) * (ys[i] - meanY);
        square += (xs[i] - meanX) ** 2;
    }
    if (square === 0)
        return E.DIV0();
    const slope = across / square;
    return meanY + slope * (x - meanX);
}
/** XIRR finds the rate that makes the dated cash flows worth zero, counting the year as 365 days. */
function xirr(args) {
    const values = numbers(args.slice(0, 1));
    const dates = numbers(args.slice(1, 2));
    const guess = asNumber(args[2] ?? 0.1);
    if (guess instanceof FormulaError)
        return guess;
    const count = Math.min(values.length, dates.length);
    if (count < 2 || guess <= -1)
        return E.NUM();
    const flows = values.slice(0, count);
    const days = dates.slice(0, count);
    const first = days[0];
    const worth = (rate) => flows.reduce((sum, value, index) => sum + value / (1 + rate) ** ((days[index] - first) / 365), 0);
    let rate = guess;
    for (let step = 0; step < 50; step += 1) {
        const value = worth(rate);
        const slope = (worth(rate + 1e-6) - value) / 1e-6;
        if (!Number.isFinite(value))
            return E.NUM();
        if (Math.abs(value) < 1e-7)
            return rate;
        if (slope === 0)
            break;
        rate -= value / slope;
        if (rate <= -1)
            rate = -0.999999;
    }
    return Math.abs(worth(rate)) < 1e-4 ? rate : E.NUM();
}
/** MAKEARRAY builds a grid by calling the LAMBDA with each row and column number, both starting at 1. */
function makeArray(args, ctx) {
    const rows = asNumber(args[0] ?? 0);
    const cols = asNumber(args[1] ?? 0);
    const lambda = args[2];
    if (rows instanceof FormulaError)
        return rows;
    if (cols instanceof FormulaError)
        return cols;
    if (!isLambda(lambda) || lambda.params.length !== 2)
        return E.VALUE();
    const height = Math.max(1, Math.floor(rows));
    const width = Math.max(1, Math.floor(cols));
    const out = [];
    for (let row = 1; row <= height; row += 1) {
        for (let col = 1; col <= width; col += 1) {
            const value = applyLambda(lambda, [row, col], ctx);
            if (value instanceof FormulaError)
                return value;
            out.push(scalarPrimitive(value));
        }
    }
    return withWidth(out, width);
}
/** MAP calls the LAMBDA with the value at each position. Every range must have the same shape. */
function mapArray(args, ctx) {
    const lambda = args[args.length - 1];
    const ranges = args.slice(0, -1);
    if (!isLambda(lambda) || !ranges.length || lambda.params.length !== ranges.length)
        return E.VALUE();
    const first = ranges[0];
    if (!Array.isArray(first))
        return E.VALUE();
    const width = rangeWidth(first);
    if (ranges.some((range) => !Array.isArray(range) || range.length !== first.length))
        return E.VALUE();
    const out = [];
    for (let i = 0; i < first.length; i += 1) {
        const value = applyLambda(lambda, ranges.map((range) => range[i] ?? ""), ctx);
        if (value instanceof FormulaError)
            return value;
        out.push(scalarPrimitive(value));
    }
    return withWidth(out, width);
}
/** REDUCE folds the LAMBDA over the range. SCAN returns every step, including the start value. */
function foldArray(name, args, ctx) {
    const start = args[0] ?? "";
    const range = args[1];
    const lambda = args[2];
    if (!Array.isArray(range) || !isLambda(lambda) || lambda.params.length !== 2)
        return E.VALUE();
    let acc = start;
    const steps = [scalarPrimitive(start)];
    for (const item of range) {
        const next = applyLambda(lambda, [acc, item], ctx);
        if (next instanceof FormulaError)
            return next;
        acc = next;
        steps.push(scalarPrimitive(next));
    }
    if (name === "REDUCE")
        return acc;
    return withWidth(steps, 1);
}
/** BYROW calls the LAMBDA with each row, BYCOL with each column. The LAMBDA takes the whole row or column. */
function byAxis(name, args, ctx) {
    const range = args[0];
    const lambda = args[1];
    if (!Array.isArray(range) || !isLambda(lambda) || lambda.params.length !== 1)
        return E.VALUE();
    const width = rangeWidth(range);
    const height = Math.ceil(range.length / width);
    const across = name === "BYROW";
    const count = across ? height : width;
    const out = [];
    for (let i = 0; i < count; i += 1) {
        const slice = [];
        const length = across ? width : height;
        for (let j = 0; j < length; j += 1)
            slice.push(range[(across ? i : j) * width + (across ? j : i)] ?? "");
        const value = applyLambda(lambda, [withWidth(slice, across ? width : 1)], ctx);
        if (value instanceof FormulaError)
            return value;
        out.push(scalarPrimitive(value));
    }
    return withWidth(out, across ? 1 : count);
}
/** Excel's weekend codes. 1 is Saturday and Sunday, 11 is Sunday only, and 2 through 7 start the pair on each weekday. */
function weekendMask(code) {
    const masks = { 1: 65, 2: 96, 3: 48, 4: 24, 5: 12, 6: 6, 7: 3, 11: 64, 12: 32, 13: 16, 14: 8, 15: 4, 16: 2, 17: 1 };
    const mask = masks[Math.floor(code)];
    return mask === undefined ? E.NUM() : mask;
}
/** A bit set in the mask marks a weekend day. Bit 0 is Monday and bit 6 is Sunday. */
function isWeekend(serial, mask) {
    const weekday = new Date(Math.round((serial - 25569) * 86400000)).getUTCDay();
    const bit = weekday === 0 ? 6 : weekday - 1;
    return (mask & (1 << bit)) !== 0;
}
function workdayIntl(start, days, mask) {
    const step = days >= 0 ? 1 : -1;
    let left = Math.abs(Math.trunc(days));
    let day = Math.round(start);
    while (left > 0) {
        day += step;
        if (!isWeekend(day, mask))
            left -= 1;
    }
    return day;
}
function networkDaysIntl(start, end, mask) {
    const step = end >= start ? 1 : -1;
    let count = 0;
    for (let day = Math.round(start); step > 0 ? day <= end : day >= end; day += step) {
        if (!isWeekend(day, mask))
            count += step;
    }
    return count;
}
/**
 * Coupon dates run backward from maturity by whole periods. COUPDAYS is the length of the period holding
 * the settlement, COUPNUM counts the coupons still due, and the other two return the period's end dates.
 */
function coupon(name, settle, mature, frequency) {
    if (![1, 2, 4].includes(frequency))
        return E.NUM();
    if (mature <= settle)
        return E.NUM();
    const months = 12 / frequency;
    const end = new Date(Math.round((mature - 25569) * 86400000));
    const dates = [];
    for (let step = 0;; step += 1) {
        const serial = Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months * step, end.getUTCDate()) / 86400000 + 25569;
        dates.push(Math.round(serial));
        if (serial <= settle)
            break;
        if (step > 1200)
            return E.NUM();
    }
    const next = dates[dates.length - 2] ?? dates[0];
    const previous = dates[dates.length - 1];
    if (name === "COUPDAYS")
        return next - previous;
    if (name === "COUPDAYBS")
        return Math.round(settle) - previous;
    if (name === "COUPDAYSNC")
        return next - Math.round(settle);
    if (name === "COUPNUM")
        return dates.length - 1;
    if (name === "COUPNCD")
        return next;
    return previous;
}
/** SLN is straight line, SYD sums the years' digits, DB is declining balance, and DDB is double declining. */
function depreciation(name, args) {
    const cost = asNumber(args[0] ?? 0);
    const salvage = asNumber(args[1] ?? 0);
    const life = asNumber(args[2] ?? 0);
    if (cost instanceof FormulaError)
        return cost;
    if (salvage instanceof FormulaError)
        return salvage;
    if (life instanceof FormulaError)
        return life;
    if (life <= 0 || cost < 0)
        return E.NUM();
    if (name === "SLN")
        return (cost - salvage) / life;
    const period = asNumber(args[3] ?? 0);
    if (period instanceof FormulaError)
        return period;
    const year = Math.floor(period);
    if (year < 1 || year > life)
        return E.NUM();
    if (name === "SYD")
        return (cost - salvage) * (life - year + 1) / (life * (life + 1) / 2);
    if (name === "DB") {
        const months = args[4] === undefined ? 12 : asNumber(args[4]);
        if (months instanceof FormulaError)
            return months;
        if (months < 1 || months > 12)
            return E.NUM();
        const rate = Math.round((1 - (salvage / cost) ** (1 / life)) * 1000) / 1000;
        let book = cost;
        const charge = (which) => {
            const full = book * rate;
            const amount = which === 1 ? full * months / 12 : which === Math.floor(life) + 1 ? book * (12 - months) / 12 : full;
            book -= amount;
            return amount;
        };
        let value = 0;
        for (let which = 1; which <= year; which += 1)
            value = charge(which);
        return value;
    }
    const factor = args[4] === undefined ? 2 : asNumber(args[4]);
    if (factor instanceof FormulaError)
        return factor;
    if (factor <= 0)
        return E.NUM();
    let book = cost;
    let value = 0;
    for (let which = 1; which <= year; which += 1) {
        value = Math.min(book * factor / life, book - salvage);
        book -= value;
    }
    return value;
}
/** The straight line through the known pairs, shared by SLOPE, INTERCEPT, RSQ, STEYX, and the trend functions. */
function regression(name, ys, xs) {
    const count = Math.min(ys.length, xs.length);
    if (count < 2)
        return E.VALUE();
    const x = xs.slice(0, count);
    const y = ys.slice(0, count);
    const meanX = x.reduce((sum, item) => sum + item, 0) / count;
    const meanY = y.reduce((sum, item) => sum + item, 0) / count;
    let across = 0;
    let squareX = 0;
    let squareY = 0;
    for (let i = 0; i < count; i += 1) {
        across += (x[i] - meanX) * (y[i] - meanY);
        squareX += (x[i] - meanX) ** 2;
        squareY += (y[i] - meanY) ** 2;
    }
    if (squareX === 0)
        return E.DIV0();
    const slope = across / squareX;
    if (name === "SLOPE")
        return slope;
    if (name === "INTERCEPT")
        return meanY - slope * meanX;
    if (squareY === 0)
        return E.DIV0();
    if (name === "RSQ")
        return across ** 2 / (squareX * squareY);
    let residual = 0;
    for (let i = 0; i < count; i += 1)
        residual += (y[i] - (meanY + slope * (x[i] - meanX))) ** 2;
    return Math.sqrt(residual / (count - 2));
}
/** The fitted line at new x values. GROWTH and LOGEST fit the logarithms, so the known y must be positive. */
function trend(name, args) {
    const knownY = numbers(args.slice(0, 1));
    const knownX = args[1] === undefined ? knownY.map((_item, index) => index + 1) : numbers(args.slice(1, 2));
    const count = Math.min(knownY.length, knownX.length);
    if (count < 2)
        return E.VALUE();
    const log = name === "GROWTH" || name === "LOGEST";
    const y = knownY.slice(0, count);
    if (log && y.some((item) => item <= 0))
        return E.NUM();
    const fitted = log ? y.map((item) => Math.log(item)) : y;
    const fit = regression("SLOPE", fitted, knownX.slice(0, count));
    const base = regression("INTERCEPT", fitted, knownX.slice(0, count));
    if (typeof fit !== "number" || typeof base !== "number")
        return fit instanceof FormulaError ? fit : base;
    if (name === "LINEST")
        return withWidth([fit, base], 2);
    if (name === "LOGEST")
        return withWidth([Math.exp(fit), Math.exp(base)], 2);
    const probe = args[2] === undefined ? knownX.slice(0, count) : numbers(args.slice(2, 3));
    if (!probe.length)
        return E.VALUE();
    const out = probe.map((item) => (log ? Math.exp(base + fit * item) : base + fit * item));
    return out.length === 1 ? out[0] : withWidth(out, 1);
}
/** The remaining finance functions: scheduled growth, straight interest, discount securities, and variable decline. */
function financeMore(name, args) {
    if (name === "FVSCHEDULE") {
        const present = asNumber(args[0] ?? 0);
        if (present instanceof FormulaError)
            return present;
        const rates = numbers(args.slice(1, 2));
        return rates.reduce((grown, rate) => grown * (1 + rate), present);
    }
    const values = [];
    for (const arg of args) {
        const value = asNumber(arg ?? 0);
        if (value instanceof FormulaError)
            return value;
        values.push(value);
    }
    const at = (index) => values[index] ?? 0;
    if (name === "ISPMT") {
        const [rate, period, periods, present] = [at(0), at(1), at(2), at(3)];
        if (periods === 0)
            return E.DIV0();
        return present * rate * (period / periods - 1);
    }
    if (name === "VDB") {
        const [cost, salvage, life, start, end, factor] = [at(0), at(1), at(2), at(3), at(4), at(5) || 2];
        if (life <= 0 || factor <= 0 || start < 0 || end <= start || end > life)
            return E.NUM();
        const charge = (which) => {
            const book = cost * (1 - factor / life) ** (which - 1);
            return Math.min(book * factor / life, Math.max(0, book - salvage));
        };
        let total = 0;
        const first = Math.floor(start);
        const last = Math.ceil(end);
        for (let which = first + 1; which <= last; which += 1) {
            let piece = charge(which);
            if (which === first + 1)
                piece *= 1 - (start - first);
            if (which === last && end !== last)
                piece *= end - (last - 1);
            total += piece;
        }
        return total;
    }
    const [settlement, maturity, third, redemption] = [at(0), at(1), at(2), at(3)];
    const days = maturity - settlement;
    if (days <= 0)
        return E.NUM();
    if (name === "PRICEDISC")
        return redemption * (1 - third * days / 360);
    if (name === "YIELDDISC")
        return redemption === 0 ? E.DIV0() : (redemption - third) / third * (360 / days);
    if (name === "TBILLEQ")
        return (365 * third) / (360 - third * days);
    const modified = financeExtra("DURATION", [third, at(1), at(2), at(3), at(4), at(5)]);
    return typeof modified === "number" ? modified / (1 + third / at(4)) : modified;
}
/** Binomial, Poisson, exponential, lognormal, chi-square, t, and F distributions, plus the error function. */
function distFn(name, args) {
    if (name === "ERF" || name === "ERFC") {
        const lower = asNumber(args[0] ?? 0);
        if (lower instanceof FormulaError)
            return lower;
        const upper = args[1] === undefined ? undefined : asNumber(args[1]);
        if (upper instanceof FormulaError)
            return upper;
        const erf = (z) => {
            const t = 1 / (1 + 0.3275911 * Math.abs(z));
            const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
            const value = 1 - poly * Math.exp(-z * z);
            return z < 0 ? -value : value;
        };
        if (name === "ERFC")
            return 1 - erf(lower);
        return upper === undefined ? erf(lower) : erf(upper) - erf(lower);
    }
    if (name === "PERCENTRANK.INC")
        return statsFn("PERCENTRANK", args);
    if (name === "PERCENTRANK.EXC") {
        const nums = numbers(args.slice(0, 1)).sort((a, b) => a - b);
        const target = asNumber(args[1] ?? 0);
        if (target instanceof FormulaError)
            return target;
        if (nums.length < 2 || target <= nums[0] || target >= nums[nums.length - 1])
            return E.NA();
        const below = nums.filter((item) => item < target).length;
        const span = nums.find((item) => item >= target) - nums[below - 1];
        const fraction = span === 0 ? 0 : (target - nums[below - 1]) / span;
        return (below + fraction) / (nums.length + 1);
    }
    if (name === "CONFIDENCE.NORM") {
        const alpha = asNumber(args[0] ?? 0);
        const deviation = asNumber(args[1] ?? 0);
        const size = asNumber(args[2] ?? 0);
        if (alpha instanceof FormulaError)
            return alpha;
        if (deviation instanceof FormulaError)
            return deviation;
        if (size instanceof FormulaError)
            return size;
        if (alpha <= 0 || alpha >= 1 || deviation <= 0 || size < 1)
            return E.NUM();
        return normalInv(1 - alpha / 2) * deviation / Math.sqrt(size);
    }
    const x = asNumber(args[0] ?? 0);
    const second = asNumber(args[1] ?? 0);
    if (x instanceof FormulaError)
        return x;
    if (second instanceof FormulaError)
        return second;
    if (name === "BINOM.DIST") {
        const trials = asNumber(args[1] ?? 0);
        const probability = asNumber(args[2] ?? 0);
        const cumulative = asBool(args[3] ?? true);
        if (trials instanceof FormulaError)
            return trials;
        if (probability instanceof FormulaError)
            return probability;
        if (cumulative instanceof FormulaError)
            return cumulative;
        const successes = Math.floor(x);
        const count = Math.floor(trials);
        if (successes < 0 || count < 0 || successes > count || probability < 0 || probability > 1)
            return E.NUM();
        const term = (k) => binomial(count, k) * probability ** k * (1 - probability) ** (count - k);
        if (!cumulative)
            return term(successes);
        let total = 0;
        for (let k = 0; k <= successes; k += 1)
            total += term(k);
        return total;
    }
    if (name === "POISSON.DIST") {
        const cumulative = asBool(args[2] ?? true);
        if (cumulative instanceof FormulaError)
            return cumulative;
        const events = Math.floor(x);
        if (events < 0 || second <= 0)
            return E.NUM();
        const term = (k) => (Math.exp(-second) * second ** k) / factorial(k);
        if (!cumulative)
            return term(events);
        let total = 0;
        for (let k = 0; k <= events; k += 1)
            total += term(k);
        return total;
    }
    if (name === "EXPON.DIST") {
        const cumulative = asBool(args[2] ?? true);
        if (cumulative instanceof FormulaError)
            return cumulative;
        if (x < 0 || second <= 0)
            return E.NUM();
        return cumulative ? 1 - Math.exp(-second * x) : second * Math.exp(-second * x);
    }
    if (name === "LOGNORM.DIST") {
        const deviation = asNumber(args[2] ?? 1);
        const cumulative = asBool(args[3] ?? true);
        if (deviation instanceof FormulaError)
            return deviation;
        if (cumulative instanceof FormulaError)
            return cumulative;
        if (x <= 0 || deviation <= 0)
            return E.NUM();
        const z = (Math.log(x) - second) / deviation;
        return cumulative ? normalCdf(z) : Math.exp(-z * z / 2) / (x * deviation * Math.sqrt(2 * Math.PI));
    }
    const cumulative = asBool(args[2] ?? true);
    if (cumulative instanceof FormulaError)
        return cumulative;
    if (name === "CHISQ.DIST") {
        const freedom = Math.floor(second);
        if (x < 0 || freedom < 1)
            return E.NUM();
        return cumulative ? gammaP(freedom / 2, x / 2) : (x ** (freedom / 2 - 1) * Math.exp(-x / 2)) / (2 ** (freedom / 2) * gamma(freedom / 2));
    }
    if (name === "T.DIST") {
        const freedom = Math.floor(second);
        if (freedom < 1)
            return E.NUM();
        const density = gamma((freedom + 1) / 2) / (Math.sqrt(freedom * Math.PI) * gamma(freedom / 2)) * (1 + x * x / freedom) ** (-(freedom + 1) / 2);
        if (!cumulative)
            return density;
        const beta = regularizedBeta(freedom / (freedom + x * x), freedom / 2, 0.5);
        return x >= 0 ? 1 - beta / 2 : beta / 2;
    }
    const third = asNumber(args[2] ?? 0);
    if (third instanceof FormulaError)
        return third;
    const cumulativeF = asBool(args[3] ?? true);
    if (cumulativeF instanceof FormulaError)
        return cumulativeF;
    const d1 = Math.floor(second);
    const d2 = Math.floor(third);
    if (x < 0 || d1 < 1 || d2 < 1)
        return E.NUM();
    const ratio = (d1 * x) / (d1 * x + d2);
    if (!cumulativeF) {
        const factor = (d1 / d2) ** (d1 / 2) * x ** (d1 / 2 - 1) / beta(d1 / 2, d2 / 2);
        return factor / (1 + (d1 / d2) * x) ** ((d1 + d2) / 2);
    }
    return regularizedBeta(ratio, d1 / 2, d2 / 2);
}
/** Sums of products of two lists, the multinomial, the square root of pi, and a time read from text. */
function mathExtra(name, args) {
    if (name === "SQRTPI") {
        const value = asNumber(args[0] ?? 0);
        if (value instanceof FormulaError)
            return value;
        return value < 0 ? E.NUM() : Math.sqrt(value * Math.PI);
    }
    if (name === "TIMEVALUE")
        return timeText(asText(args[0] ?? "")) ?? E.VALUE();
    if (name === "MULTINOMIAL") {
        const nums = numbers(args);
        if (!nums.length || nums.some((item) => item < 0 || !Number.isInteger(item)))
            return E.NUM();
        const total = nums.reduce((sum, item) => sum + item, 0);
        let out = factorial(total);
        for (const item of nums)
            out /= factorial(item);
        return out;
    }
    const left = numbers(args.slice(0, 1));
    const right = numbers(args.slice(1, 2));
    const count = Math.min(left.length, right.length);
    if (!count)
        return E.VALUE();
    let total = 0;
    for (let i = 0; i < count; i += 1) {
        const a = left[i];
        const b = right[i];
        if (name === "SUMX2MY2")
            total += a * a - b * b;
        else if (name === "SUMX2PY2")
            total += a * a + b * b;
        else
            total += (a - b) ** 2;
    }
    return total;
}
/**
 * The rest of the common catalog: text-aware statistics, matrix algebra, the inverse distributions,
 * base and bit arithmetic, hyperbolic functions, and the sheet and formula lookups.
 */
function catalog(name, args, ctx) {
    if (name === "FORMULATEXT")
        return formulaText(ctx, args[0]);
    if (name === "ISREF")
        return rangeOrigin(args[0]) !== undefined || rangeAreas(args[0]).length > 0;
    if (name === "SHEET")
        return sheetNumber(ctx, args[0]);
    if (name === "SHEETS")
        return args[0] === undefined ? ctx.workbook.sheets.length : rangeOrigin(args[0]) ? 1 : E.VALUE();
    if (name === "HYPERLINK")
        return args.length > 1 ? args[1] ?? "" : args[0] ?? "";
    if (name === "RANDARRAY")
        return randomArray(args);
    if (name === "AGGREGATE")
        return aggregate(args);
    if (name === "MDETERM" || name === "MINVERSE")
        return matrixAlgebra(name, args[0]);
    if (name === "MIRR")
        return modifiedRate(args);
    if (name === "XNPV")
        return datedPresent(args);
    if (name === "TBILLYIELD" || name === "ACCRINTM" || name === "DOLLARDE" || name === "DOLLARFR")
        return financeRest(name, args);
    if (name === "DELTA" || name === "GESTEP") {
        const left = asNumber(args[0] ?? 0);
        const right = asNumber(args[1] ?? 0);
        if (left instanceof FormulaError)
            return left;
        if (right instanceof FormulaError)
            return right;
        return (name === "DELTA" ? left === right : left >= right) ? 1 : 0;
    }
    if (name === "AVERAGEA" || name === "MAXA" || name === "MINA" || name === "STDEVA" || name === "VARA")
        return textAware(name, args);
    if (name === "COVARIANCE.P" || name === "COVARIANCE.S")
        return covariance(name, args);
    if (name === "RANK.AVG" || name === "MODE.MULT")
        return rankMode(name, args);
    if (name === "STANDARDIZE" || name === "PHI" || name === "GAUSS" || name === "FISHER" || name === "FISHERINV")
        return normalExtra(name, args);
    if (name === "LOGNORM.INV" || name === "BINOM.INV" || name === "BINOM.DIST.RANGE")
        return distInverse(name, args);
    if (name === "T.INV" || name === "T.INV.2T" || name === "T.DIST.2T" || name === "T.DIST.RT" || name === "F.INV" || name === "F.INV.RT" || name === "F.DIST.RT" || name === "CHISQ.INV" || name === "CHISQ.INV.RT" || name === "CHISQ.DIST.RT")
        return distTail(name, args);
    if (name === "COMBINA" || name === "FACTDOUBLE" || name === "PERMUTATIONA" || name === "CEILING.MATH" || name === "FLOOR.MATH")
        return counting(name, args);
    if (name === "BASE" || name === "DECIMAL" || name === "ROMAN" || name === "ARABIC")
        return bases(name, args);
    if (name === "BITAND" || name === "BITOR" || name === "BITXOR" || name === "BITLSHIFT" || name === "BITRSHIFT")
        return bits(name, args);
    if (name === "GAMMA" || name === "GAMMALN" || name === "GAMMALN.PRECISE") {
        const value = asNumber(args[0] ?? 0);
        if (value instanceof FormulaError)
            return value;
        if (value <= 0 && Number.isInteger(value))
            return E.NUM();
        return name === "GAMMA" ? gamma(value) : logGamma(Math.abs(value));
    }
    const value = asNumber(args[0] ?? 0);
    if (value instanceof FormulaError)
        return value;
    if (name === "SINH")
        return Math.sinh(value);
    if (name === "COSH")
        return Math.cosh(value);
    if (name === "TANH")
        return Math.tanh(value);
    if (name === "ASINH")
        return Math.asinh(value);
    if (name === "ACOSH")
        return value < 1 ? E.NUM() : Math.acosh(value);
    if (name === "ATANH")
        return value <= -1 || value >= 1 ? E.NUM() : Math.atanh(value);
    if (name === "SEC")
        return Math.cos(value) === 0 ? E.DIV0() : 1 / Math.cos(value);
    if (name === "CSC")
        return Math.sin(value) === 0 ? E.DIV0() : 1 / Math.sin(value);
    return Math.tan(value) === 0 ? E.DIV0() : 1 / Math.tan(value);
}
/** AVERAGEA and its family count text as zero, unlike the versions that skip it. */
function textAware(name, args) {
    const values = flatten(args).map((item) => (typeof item === "number" ? item : typeof item === "boolean" ? Number(item) : 0));
    if (!values.length)
        return E.VALUE();
    if (name === "MAXA")
        return Math.max(...values);
    if (name === "MINA")
        return Math.min(...values);
    const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
    if (name === "AVERAGEA")
        return mean;
    const square = values.reduce((sum, item) => sum + (item - mean) ** 2, 0);
    if (values.length < 2)
        return E.DIV0();
    const spread = square / (values.length - 1);
    return name === "STDEVA" ? Math.sqrt(spread) : spread;
}
function covariance(name, args) {
    const left = numbers(args.slice(0, 1));
    const right = numbers(args.slice(1, 2));
    const count = Math.min(left.length, right.length);
    const divisor = count - (name === "COVARIANCE.S" ? 1 : 0);
    if (divisor <= 0)
        return E.DIV0();
    const meanX = left.slice(0, count).reduce((sum, item) => sum + item, 0) / count;
    const meanY = right.slice(0, count).reduce((sum, item) => sum + item, 0) / count;
    let total = 0;
    for (let i = 0; i < count; i += 1)
        total += (left[i] - meanX) * (right[i] - meanY);
    return total / divisor;
}
/** RANK.AVG splits a tie, MODE.MULT lists every value that appears most often. */
function rankMode(name, args) {
    if (name === "RANK.AVG") {
        const target = asNumber(args[0] ?? 0);
        if (target instanceof FormulaError)
            return target;
        const nums = numbers(args.slice(1, 2));
        const order = asNumber(args[2] ?? 0);
        if (order instanceof FormulaError)
            return order;
        const same = nums.filter((item) => item === target).length;
        if (!same)
            return E.NA();
        const ahead = nums.filter((item) => (order === 0 ? item > target : item < target)).length;
        return ahead + (same + 1) / 2;
    }
    const nums = numbers(args);
    const counts = new Map();
    for (const item of nums)
        counts.set(item, (counts.get(item) ?? 0) + 1);
    const most = Math.max(0, ...counts.values());
    if (most < 2)
        return E.NA();
    return withWidth([...counts].filter(([, count]) => count === most).map(([value]) => value), 1);
}
function normalExtra(name, args) {
    const value = asNumber(args[0] ?? 0);
    if (value instanceof FormulaError)
        return value;
    if (name === "PHI")
        return Math.exp(-value * value / 2) / Math.sqrt(2 * Math.PI);
    if (name === "GAUSS")
        return normalCdf(value) - 0.5;
    if (name === "FISHER")
        return value <= -1 || value >= 1 ? E.NUM() : Math.atanh(value);
    if (name === "FISHERINV")
        return Math.tanh(value);
    const mean = asNumber(args[1] ?? 0);
    const deviation = asNumber(args[2] ?? 1);
    if (mean instanceof FormulaError)
        return mean;
    if (deviation instanceof FormulaError)
        return deviation;
    return deviation === 0 ? E.DIV0() : (value - mean) / deviation;
}
function distInverse(name, args) {
    if (name === "BINOM.DIST.RANGE") {
        const trials = asNumber(args[0] ?? 0);
        const probability = asNumber(args[1] ?? 0);
        const from = asNumber(args[2] ?? 0);
        const to = args[3] === undefined ? from : asNumber(args[3]);
        if (trials instanceof FormulaError)
            return trials;
        if (probability instanceof FormulaError)
            return probability;
        if (from instanceof FormulaError)
            return from;
        if (to instanceof FormulaError)
            return to;
        let total = 0;
        for (let k = Math.floor(from); k <= Math.floor(to); k += 1) {
            const term = distFn("BINOM.DIST", [k, trials, probability, false]);
            if (term instanceof FormulaError)
                return term;
            total += typeof term === "number" ? term : 0;
        }
        return total;
    }
    if (name === "BINOM.INV") {
        const trials = asNumber(args[0] ?? 0);
        const probability = asNumber(args[1] ?? 0);
        const alpha = asNumber(args[2] ?? 0);
        if (trials instanceof FormulaError)
            return trials;
        if (probability instanceof FormulaError)
            return probability;
        if (alpha instanceof FormulaError)
            return alpha;
        if (alpha < 0 || alpha > 1)
            return E.NUM();
        for (let k = 0; k <= Math.floor(trials); k += 1) {
            const cumulative = distFn("BINOM.DIST", [k, trials, probability, true]);
            if (cumulative instanceof FormulaError)
                return cumulative;
            if (typeof cumulative === "number" && cumulative >= alpha)
                return k;
        }
        return E.NUM();
    }
    const probability = asNumber(args[0] ?? 0);
    const mean = asNumber(args[1] ?? 0);
    const deviation = asNumber(args[2] ?? 1);
    if (probability instanceof FormulaError)
        return probability;
    if (mean instanceof FormulaError)
        return mean;
    if (deviation instanceof FormulaError)
        return deviation;
    if (probability <= 0 || probability >= 1 || deviation <= 0)
        return E.NUM();
    return Math.exp(mean + deviation * normalInv(probability));
}
/** The one-tailed and right-tailed forms, and the inverses found by bisection. */
function distTail(name, args) {
    if (name === "T.INV.2T" || name === "F.INV.RT" || name === "CHISQ.INV.RT") {
        const probability = asNumber(args[0] ?? 0);
        if (probability instanceof FormulaError)
            return probability;
        // T.INV turns a left-tail probability into a two-tailed one, so the two-tailed inverse must not go through it.
        if (name === "T.INV.2T")
            return distTail("T.INV", [1 - probability / 2, ...args.slice(1)]);
        const base = name === "F.INV.RT" ? "F.INV" : "CHISQ.INV";
        return distTail(base, [1 - probability, ...args.slice(1)]);
    }
    if (name === "T.DIST.RT" || name === "T.DIST.2T") {
        const value = asNumber(args[0] ?? 0);
        const freedom = asNumber(args[1] ?? 0);
        if (value instanceof FormulaError)
            return value;
        if (freedom instanceof FormulaError)
            return freedom;
        const upper = distFn("T.DIST", [Math.abs(value), freedom, true]);
        if (typeof upper !== "number")
            return upper;
        return name === "T.DIST.RT" ? 1 - upper : 2 * (1 - upper);
    }
    if (name === "F.DIST.RT" || name === "CHISQ.DIST.RT") {
        const value = distFn(name === "F.DIST.RT" ? "F.DIST" : "CHISQ.DIST", args);
        return typeof value === "number" ? 1 - value : value;
    }
    const probability = asNumber(args[0] ?? 0);
    const freedom = asNumber(args[1] ?? 0);
    if (probability instanceof FormulaError)
        return probability;
    if (freedom instanceof FormulaError)
        return freedom;
    if (probability <= 0 || probability >= 1 || freedom < 1)
        return E.NUM();
    const target = name === "T.INV" ? (probability + 1) / 2 : probability;
    const third = name === "F.INV" ? asNumber(args[2] ?? 1) : 1;
    if (third instanceof FormulaError)
        return third;
    let low = 0;
    let high = 1;
    const probe = (point) => {
        const value = name === "T.INV" ? distFn("T.DIST", [point, freedom, true]) : name === "F.INV" ? distFn("F.DIST", [point, freedom, third, true]) : distFn("CHISQ.DIST", [point, freedom, true]);
        return typeof value === "number" ? value : E.NUM();
    };
    while (probe(high) < target)
        high *= 2;
    for (let step = 0; step < 60; step += 1) {
        const mid = (low + high) / 2;
        const value = probe(mid);
        if (value instanceof FormulaError)
            return value;
        if (value < target)
            low = mid;
        else
            high = mid;
    }
    return name === "T.INV" && probability < 0.5 ? -(low + high) / 2 : (low + high) / 2;
}
/**
 * The aggregations GROUPBY and PIVOTBY accept by bare name. A name with no entry here is not an
 * eta-reduced function, so it stays a plain name and the call fails.
 */
const GROUP_AGGREGATES = {
    SUM: (cells) => cells.reduce((sum, cell) => sum + (typeof cell === "number" ? cell : 0), 0),
    AVERAGE: (cells) => average(cells),
    COUNT: (cells) => cells.filter((cell) => typeof cell === "number").length,
    COUNTA: (cells) => cells.filter((cell) => cell !== "").length,
    MIN: (cells) => {
        const nums = cells.filter((cell) => typeof cell === "number");
        return nums.length ? Math.min(...nums) : 0;
    },
    MAX: (cells) => {
        const nums = cells.filter((cell) => typeof cell === "number");
        return nums.length ? Math.max(...nums) : 0;
    },
    PRODUCT: (cells) => cells.reduce((product, cell) => product * (typeof cell === "number" ? cell : 1), 1),
    MEDIAN: (cells) => {
        const nums = cells.filter((cell) => typeof cell === "number").sort((a, b) => a - b);
        if (!nums.length)
            return E.NUM();
        const mid = Math.floor(nums.length / 2);
        return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    },
    "STDEV.S": (cells) => stdev(cells, false),
    "STDEV.P": (cells) => stdev(cells, true),
    "VAR.S": (cells) => variance(cells, false),
    "VAR.P": (cells) => variance(cells, true),
    "MODE.SNGL": (cells) => modeOf(cells.filter((cell) => typeof cell === "number")),
};
/**
 * The function argument is one reducer, or a row of them stacked by HSTACK. A second row stacked
 * underneath with VSTACK replaces the headers, one label per reducer.
 */
function groupReducers(fn, ctx) {
    if (isLambda(fn)) {
        if (fn.params.length < 1 || fn.params.length > 2)
            return E.VALUE();
        return [{ label: "", reduce: (cells, all) => applyLambda(fn, fn.params.length === 2 ? [withWidth(cells, 1), withWidth(all, 1)] : [withWidth(cells, 1)], ctx) }];
    }
    if (!Array.isArray(fn)) {
        const single = groupReducer(fn, "");
        return single instanceof FormulaError ? single : [single];
    }
    const width = rangeWidth(fn);
    const rows = Math.ceil(fn.length / width);
    if (rows > 2)
        return E.VALUE();
    const reducers = [];
    for (let col = 0; col < width; col += 1) {
        const label = rows === 2 ? scalarPrimitive(fn[width + col] ?? "") : "";
        if (rows === 2 && typeof label !== "string")
            return E.VALUE();
        const reducer = groupReducer(fn[col], String(label));
        if (reducer instanceof FormulaError)
            return reducer;
        reducers.push(reducer);
    }
    return reducers;
}
/** A bare name maps to a built-in aggregation. PERCENTOF compares the group with everything. */
function groupReducer(fn, label) {
    const named = isPending(fn) ? fn : isPendingFunction(fn) ? { name: fn.fn } : undefined;
    if (!named)
        return E.VALUE();
    fn = named;
    if (fn.name === "PERCENTOF") {
        return { label: label || "PERCENTOF", reduce: (cells, all) => percentOf(cells, all) };
    }
    const aggregate = GROUP_AGGREGATES[fn.name];
    if (!aggregate)
        return E.NAME();
    return { label: label || fn.name, reduce: (cells) => aggregate(cells) };
}
/** PERCENTOF inside a grouping: the group's numbers over all the numbers, which is what the totals show. */
function percentOf(part, whole) {
    const total = whole.reduce((sum, cell) => sum + (typeof cell === "number" ? cell : 0), 0);
    if (total === 0)
        return E.DIV0();
    return part.reduce((sum, cell) => sum + (typeof cell === "number" ? cell : 0), 0) / total;
}
/** Reads an optional numeric argument, treating a blank cell as "not given". */
function groupOption(value) {
    if (value === undefined || isOmitted(value) || value === "")
        return undefined;
    const number = asNumber(value);
    return number instanceof FormulaError ? number : number;
}
/**
 * GROUPBY summarizes values by one or more row fields. PIVOTBY adds column fields, so the summary
 * spreads across columns as well. The function argument is a bare name such as SUM, or a LAMBDA.
 */
function groupBy(name, args, ctx) {
    const pivoting = name === "PIVOTBY";
    const rowFields = args[0];
    const colFields = pivoting ? args[1] : undefined;
    const data = pivoting ? args[2] : args[1];
    if (!Array.isArray(rowFields) || !Array.isArray(data))
        return E.VALUE();
    if (pivoting && !Array.isArray(colFields))
        return E.VALUE();
    const reducers = groupReducers(pivoting ? args[3] : args[2], ctx);
    if (reducers instanceof FormulaError)
        return reducers;
    if (!reducers.length)
        return E.VALUE();
    const rowWidth = rangeWidth(rowFields);
    const colWidth = Array.isArray(colFields) ? rangeWidth(colFields) : 0;
    const dataWidth = rangeWidth(data);
    const height = Math.ceil(rowFields.length / rowWidth);
    if (Math.ceil(data.length / dataWidth) !== height)
        return E.VALUE();
    if (Array.isArray(colFields) && Math.ceil(colFields.length / colWidth) !== height)
        return E.VALUE();
    const optionAt = pivoting ? 4 : 3;
    const headers = groupOption(args[optionAt]);
    const rowDepth = groupOption(args[optionAt + 1]);
    const rowSort = args[optionAt + 2];
    const colDepth = pivoting ? groupOption(args[optionAt + 3]) : undefined;
    const colSort = pivoting ? args[optionAt + 4] : undefined;
    const filter = pivoting ? args[optionAt + 6] : args[optionAt + 4];
    if (headers instanceof FormulaError)
        return headers;
    if (rowDepth instanceof FormulaError)
        return rowDepth;
    if (colDepth instanceof FormulaError)
        return colDepth;
    // A header row is detected when the first row is text and the second is a number, unless told otherwise.
    const headerRow = headers === undefined ? looksLikeHeader(rowFields, rowWidth, data, dataWidth) : headers === 1 || headers === 3;
    if (headerRow && height < 2)
        return E.VALUE();
    const showHeaders = headers === 3 || headers === 2 || (headers === undefined && reducers.length > 1);
    const bodyStart = headerRow ? 1 : 0;
    const keep = rowMask(filter, height);
    if (keep instanceof FormulaError)
        return keep;
    const body = [...Array(height - bodyStart).keys()].map((row) => row + bodyStart).filter((row) => keep[row]);
    const rowKeys = body.map((row) => fieldKey(rowFields, rowWidth, row));
    const colKeys = body.map((row) => (Array.isArray(colFields) ? fieldKey(colFields, colWidth, row) : []));
    const sortIndex = groupOption(rowSort);
    if (sortIndex instanceof FormulaError)
        return sortIndex;
    const rowGroups = uniqueKeys(rowKeys);
    const colGroups = uniqueKeys(colKeys);
    const subtotalDepth = (depth, fields) => {
        const levels = depth === undefined ? 1 : Math.trunc(Math.abs(depth));
        if (levels > fields)
            return E.VALUE();
        return levels;
    };
    const rowLevels = rowDepth === undefined ? 1 : subtotalDepth(rowDepth, rowWidth);
    const colLevels = pivoting ? subtotalDepth(typeof colDepth === "number" ? colDepth : undefined, colWidth) : 0;
    if (rowLevels instanceof FormulaError)
        return rowLevels;
    if (colLevels instanceof FormulaError)
        return colLevels;
    const rowTotalsFirst = typeof rowDepth === "number" && rowDepth < 0;
    const colTotalsFirst = typeof colDepth === "number" && colDepth < 0;
    /** Every value column of the rows and columns whose keys start with the prefix. */
    const collect = (rowPrefix, colPrefix, column) => {
        const cells = [];
        for (let i = 0; i < body.length; i += 1) {
            if (!keyStartsWith(rowKeys[i], rowPrefix) || !keyStartsWith(colKeys[i], colPrefix))
                continue;
            const row = body[i];
            cells.push(data[row * dataWidth + column] ?? "");
        }
        return cells;
    };
    const columns = [...Array(dataWidth).keys()];
    const valueHeaders = headerRow ? columns.map((column) => data[column] ?? "") : columns.map(() => "");
    const rowHeader = headerRow ? [...Array(rowWidth).keys()].map((column) => rowFields[column] ?? "") : [...Array(rowWidth).keys()].map(() => "");
    const colHeader = Array.isArray(colFields) && headerRow ? [...Array(colWidth).keys()].map((column) => colFields[column] ?? "") : [...Array(colWidth).keys()].map(() => "");
    /** The column groups, with a grand total column appended when column totals are on. */
    const colTargets = colGroups.length ? colGroups.map((key) => key) : [[]];
    if (pivoting && colLevels > 0)
        colTargets.push([]);
    /** One summary row: the row fields, then one cell per column group, value column, and reducer. */
    const summarize = (label, rowPrefix) => {
        const cells = [...pad(label, rowWidth)];
        for (const colKey of colTargets) {
            for (const column of columns) {
                const all = collect([], colKey, column);
                const cellsInGroup = collect(rowPrefix, colKey, column);
                for (const reducer of reducers) {
                    const value = reducer.reduce(cellsInGroup, all);
                    cells.push(value instanceof FormulaError ? value.code : scalarPrimitive(value));
                }
            }
        }
        return cells;
    };
    const grandRow = rowLevels > 0 ? summarize(["总计"], []) : undefined;
    // Detail rows sit at the full key. Each shallower level adds one subtotal row around the rows it covers.
    const dataRows = [];
    const emit = (level, prefix) => {
        const matches = rowGroups.filter((key) => keyStartsWith(key, prefix));
        if (!matches.length)
            return;
        if (level >= rowWidth) {
            for (const key of matches)
                dataRows.push(summarize(key, key));
            return;
        }
        const subtotal = rowLevels > rowWidth - level ? summarize([...prefix, "总计"], prefix) : undefined;
        if (subtotal && rowTotalsFirst)
            dataRows.push(subtotal);
        for (const next of uniqueKeys(matches.map((key) => key.slice(0, level + 1))))
            emit(level + 1, next);
        if (subtotal && !rowTotalsFirst)
            dataRows.push(subtotal);
    };
    if (rowTotalsFirst && grandRow)
        dataRows.push(grandRow);
    emit(0, []);
    if (!rowTotalsFirst && grandRow)
        dataRows.push(grandRow);
    const outWidth = (dataRows[0] ?? grandRow ?? []).length || rowWidth;
    // Sorting reorders the detail rows. The grand total stays at its own end.
    if (sortIndex !== undefined && sortIndex !== 0 && rowLevels <= 1) {
        const column = Math.min(Math.abs(Math.trunc(sortIndex)) - 1, outWidth - 1);
        const direction = sortIndex < 0 ? -1 : 1;
        const total = grandRow ? dataRows.pop() : undefined;
        dataRows.sort((left, right) => direction * compareCells(left[column] ?? "", right[column] ?? ""));
        if (total) {
            if (rowTotalsFirst)
                dataRows.unshift(total);
            else
                dataRows.push(total);
        }
    }
    const headerRows = [];
    if (showHeaders) {
        if (colWidth > 0) {
            for (let level = 0; level < colWidth; level += 1) {
                const line = [...Array(rowWidth).keys()].map(() => "");
                for (const colKey of colTargets) {
                    const span = dataWidth * reducers.length;
                    const label = colKey.length === 0 ? (level === 0 ? "总计" : "") : colKey[level] ?? "";
                    line.push(label, ...[...Array(span - 1).keys()].map(() => ""));
                }
                headerRows.push(line);
            }
        }
        const names = [...(headers === 2 ? [...Array(rowWidth).keys()].map((column) => `列${column + 1}`) : rowHeader)];
        for (const colKey of colTargets) {
            const totalColumn = pivoting && colKey.length === 0 && colGroups.length > 0;
            for (const column of columns) {
                for (const reducer of reducers) {
                    const label = reducers.length > 1 ? reducer.label : valueHeaders[column] ?? "";
                    names.push(totalColumn && label === "" ? "总计" : label);
                }
            }
        }
        headerRows.push(names);
    }
    const table = [...headerRows, ...dataRows];
    if (!table.length)
        return withWidth([""], 1);
    return withWidth(table.flatMap((line) => pad(line, outWidth)), outWidth);
}
/** A blank first row of text over numbers is a header row. */
function looksLikeHeader(fields, fieldWidth, data, dataWidth) {
    if (Math.ceil(fields.length / fieldWidth) < 2)
        return false;
    const text = fields.slice(0, fieldWidth).some((cell) => typeof cell === "string" && cell !== "");
    const numeric = data.slice(0, dataWidth).every((cell) => typeof cell === "number");
    return text && !numeric;
}
/** The filter argument keeps a row when its cell is true. It has to cover every source row. */
function rowMask(filter, height) {
    if (filter === undefined || isOmitted(filter))
        return [...Array(height).keys()].map(() => true);
    const cells = Array.isArray(filter) ? filter : [scalarPrimitive(filter)];
    if (cells.length !== height)
        return E.VALUE();
    return cells.map((cell) => cell === true || cell === 1);
}
/** One source row's field values, in column order. */
function fieldKey(table, width, row) {
    return [...Array(width).keys()].map((column) => table[row * width + column] ?? "");
}
/**
 * Orders group keys by one column of the result. The index counts from 1, and a negative index sorts
 * descending. Columns past the key fall back to the first column, which keeps the default A-Z order.
 */
function sortGroups(keys, index, value) {
    if (index === undefined || index === 0)
        return keys;
    const column = Math.min(Math.abs(Math.trunc(index)) - 1, value(keys[0] ?? []).length - 1);
    const direction = index < 0 ? -1 : 1;
    return [...keys].sort((left, right) => direction * compareCells(value(left)[column] ?? "", value(right)[column] ?? ""));
}
/** Numbers compare numerically and everything else as text, matching the default GROUPBY order. */
function compareCells(left, right) {
    if (typeof left === "number" && typeof right === "number")
        return left - right;
    return String(left).localeCompare(String(right));
}
/** Field lists in first-seen order, compared cell by cell so 1 and "1" stay apart. */
function uniqueKeys(keys) {
    const out = [];
    for (const key of keys) {
        if (!out.some((found) => sameKey(found, key)))
            out.push(key);
    }
    return out;
}
function sameKey(left, right) {
    return left.length === right.length && left.every((cell, index) => cell === right[index]);
}
function keyStartsWith(key, prefix) {
    return prefix.every((cell, index) => key[index] === cell);
}
/** Extends a row with blanks so every row of the summary has the same width. */
function pad(line, width) {
    return [...line, ...[...Array(Math.max(0, width - line.length)).keys()].map(() => "")];
}
/**
 * The long tail of the catalog: the remaining distributions, the interest and maturity securities,
 * complex numbers, and the Bessel functions.
 */
function extended(name, args, ctx) {
    if (name === "AREAS") {
        const areas = rangeAreas(args[0] ?? "");
        if (areas.length)
            return areas.length;
        return rangeOrigin(args[0]) ? 1 : E.VALUE();
    }
    if (name === "ENCODEURL")
        return encodeURIComponent(asText(args[0] ?? ""));
    if (name === "CELL")
        return cellInfo(name, args, ctx);
    if (name === "BAHTTEXT")
        return bahtText(args);
    if (name === "SERIESSUM")
        return seriesSum(args);
    if (name === "INTRATE" || name === "RECEIVED" || name === "PRICEMAT" || name === "YIELDMAT")
        return maturity(name, args);
    if (name === "COMPLEX" || (name.startsWith("IM") && name !== "IMAGE"))
        return complex(name, args);
    if (name.startsWith("BESSEL"))
        return bessel(name, args);
    if (name === "PROB" || name === "CHISQ.TEST" || name === "Z.TEST")
        return tests(name, args);
    if (name === "ACOT" || name === "ACOTH" || name === "SECH" || name === "CSCH" || name === "COTH")
        return hyperbolic(name, args);
    if (name === "T.INV.2T" || name === "F.INV.RT" || name === "CHISQ.INV.RT")
        return distTail(name, args);
    if (name === "CONFIDENCE.T" || name === "GAMMA.INV" || name === "BETA.INV")
        return distSolve(name, args);
    if (name === "GAMMA.DIST" || name === "WEIBULL.DIST" || name === "HYPGEOM.DIST" || name === "NEGBINOM.DIST" || name === "BETA.DIST")
        return distMore(name, args);
    if (name === "GROUPBY" || name === "PIVOTBY")
        return groupBy(name, args, ctx);
    return compat(name, args, helpers);
}
function hyperbolic(name, args) {
    const value = asNumber(args[0] ?? 0);
    if (value instanceof FormulaError)
        return value;
    if (name === "ACOT")
        return Math.atan2(1, value);
    if (name === "SECH")
        return 1 / Math.cosh(value);
    if (name === "CSCH")
        return value === 0 ? E.DIV0() : 1 / Math.sinh(value);
    if (name === "COTH")
        return value === 0 ? E.DIV0() : 1 / Math.tanh(value);
    if (Math.abs(value) <= 1)
        return E.NUM();
    return Math.log((value + 1) / (value - 1)) / 2;
}
/** GAMMA.DIST, WEIBULL, the hypergeometric and negative binomial, and the beta distribution. */
function distMore(name, args) {
    const x = asNumber(args[0] ?? 0);
    const second = asNumber(args[1] ?? 0);
    if (x instanceof FormulaError)
        return x;
    if (second instanceof FormulaError)
        return second;
    if (name === "GAMMA.DIST") {
        const scale = asNumber(args[2] ?? 1);
        const cumulative = asBool(args[3] ?? true);
        if (scale instanceof FormulaError)
            return scale;
        if (cumulative instanceof FormulaError)
            return cumulative;
        if (x < 0 || second <= 0 || scale <= 0)
            return E.NUM();
        const z = x / scale;
        return cumulative ? gammaP(second, z) : (z ** (second - 1) * Math.exp(-z)) / (scale * gamma(second));
    }
    if (name === "WEIBULL.DIST") {
        const scale = asNumber(args[2] ?? 1);
        const cumulative = asBool(args[3] ?? true);
        if (scale instanceof FormulaError)
            return scale;
        if (cumulative instanceof FormulaError)
            return cumulative;
        if (x < 0 || second <= 0 || scale <= 0)
            return E.NUM();
        const ratio = (x / scale) ** second;
        return cumulative ? 1 - Math.exp(-ratio) : (second / scale) * (x / scale) ** (second - 1) * Math.exp(-ratio);
    }
    if (name === "HYPGEOM.DIST") {
        const population = asNumber(args[2] ?? 0);
        const sample = asNumber(args[3] ?? 0);
        if (population instanceof FormulaError)
            return population;
        if (sample instanceof FormulaError)
            return sample;
        const draw = Math.floor(x);
        const n = Math.floor(sample);
        const N = Math.floor(population);
        const K = Math.floor(second);
        if (draw < 0 || n < 0 || K < 0 || N < 1 || K > N || n > N)
            return E.NUM();
        return (binomial(K, draw) * binomial(N - K, n - draw)) / binomial(N, n);
    }
    if (name === "NEGBINOM.DIST") {
        const probability = asNumber(args[2] ?? 0);
        const cumulative = asBool(args[3] ?? true);
        if (probability instanceof FormulaError)
            return probability;
        if (cumulative instanceof FormulaError)
            return cumulative;
        const failures = Math.floor(x);
        const target = Math.floor(second);
        if (failures < 0 || target < 1 || probability <= 0 || probability > 1)
            return E.NUM();
        const term = (k) => binomial(k + target - 1, k) * probability ** target * (1 - probability) ** k;
        if (!cumulative)
            return term(failures);
        let total = 0;
        for (let k = 0; k <= failures; k += 1)
            total += term(k);
        return total;
    }
    const beta2 = asNumber(args[2] ?? 0);
    const cumulative = asBool(args[3] ?? true);
    if (beta2 instanceof FormulaError)
        return beta2;
    if (cumulative instanceof FormulaError)
        return cumulative;
    if (x < 0 || x > 1 || second <= 0 || beta2 <= 0)
        return E.NUM();
    if (!cumulative)
        return (x ** (second - 1) * (1 - x) ** (beta2 - 1)) / beta(second, beta2);
    return regularizedBeta(x, second, beta2);
}
/** CONFIDENCE.T and GAMMA.INV, both found by bisection over a distribution we already have. */
function distSolve(name, args) {
    if (name === "CONFIDENCE.T") {
        const alpha = asNumber(args[0] ?? 0);
        const deviation = asNumber(args[1] ?? 0);
        const size = asNumber(args[2] ?? 0);
        if (alpha instanceof FormulaError)
            return alpha;
        if (deviation instanceof FormulaError)
            return deviation;
        if (size instanceof FormulaError)
            return size;
        if (alpha <= 0 || alpha >= 1 || deviation <= 0 || size < 2)
            return E.NUM();
        const critical = distTail("T.INV", [1 - alpha / 2, size - 1]);
        return typeof critical === "number" ? critical * deviation / Math.sqrt(size) : critical;
    }
    if (name === "BETA.INV") {
        const probability = asNumber(args[0] ?? 0);
        const alpha = asNumber(args[1] ?? 0);
        const beta = asNumber(args[2] ?? 0);
        if (probability instanceof FormulaError)
            return probability;
        if (alpha instanceof FormulaError)
            return alpha;
        if (beta instanceof FormulaError)
            return beta;
        if (probability <= 0 || probability >= 1 || alpha <= 0 || beta <= 0)
            return E.NUM();
        let low = 0;
        let high = 1;
        for (let step = 0; step < 60; step += 1) {
            const mid = (low + high) / 2;
            const value = distMore("BETA.DIST", [mid, alpha, beta, true]);
            if (value instanceof FormulaError)
                return value;
            if (value < probability)
                low = mid;
            else
                high = mid;
        }
        return (low + high) / 2;
    }
    const probability = asNumber(args[0] ?? 0);
    const shape = asNumber(args[1] ?? 0);
    const scale = asNumber(args[2] ?? 1);
    if (probability instanceof FormulaError)
        return probability;
    if (shape instanceof FormulaError)
        return shape;
    if (scale instanceof FormulaError)
        return scale;
    if (probability <= 0 || probability >= 1 || shape <= 0 || scale <= 0)
        return E.NUM();
    let low = 0;
    let high = scale;
    while (distMore("GAMMA.DIST", [high, shape, scale, true]) < probability)
        high *= 2;
    for (let step = 0; step < 60; step += 1) {
        const mid = (low + high) / 2;
        const value = distMore("GAMMA.DIST", [mid, shape, scale, true]);
        if (value instanceof FormulaError)
            return value;
        if (value < probability)
            low = mid;
        else
            high = mid;
    }
    return (low + high) / 2;
}
/** PROB sums the probabilities between two limits. The two tests compare an observed spread with the expected one. */
function tests(name, args) {
    if (name === "Z.TEST") {
        const data = numbers(args.slice(0, 1));
        const mean = asNumber(args[1] ?? 0);
        if (mean instanceof FormulaError)
            return mean;
        if (data.length < 2)
            return E.NA();
        const sigma = args[2] === undefined ? stdev(args.slice(0, 1), false) : asNumber(args[2]);
        if (typeof sigma !== "number")
            return sigma;
        if (sigma === 0)
            return E.DIV0();
        const sample = data.reduce((sum, item) => sum + item, 0) / data.length;
        return 1 - normalCdf((sample - mean) / (sigma / Math.sqrt(data.length)));
    }
    if (name === "CHISQ.TEST") {
        const actual = numbers(args.slice(0, 1));
        const expected = numbers(args.slice(1, 2));
        const count = Math.min(actual.length, expected.length);
        if (!count || expected.slice(0, count).some((item) => item === 0))
            return E.DIV0();
        let stat = 0;
        for (let i = 0; i < count; i += 1)
            stat += (actual[i] - expected[i]) ** 2 / expected[i];
        const tail = distFn("CHISQ.DIST", [stat, count - 1, true]);
        return typeof tail === "number" ? 1 - tail : tail;
    }
    const values = numbers(args.slice(0, 1));
    const probabilities = numbers(args.slice(1, 2));
    const lower = asNumber(args[2] ?? 0);
    const upper = args[3] === undefined ? lower : asNumber(args[3]);
    if (lower instanceof FormulaError)
        return lower;
    if (upper instanceof FormulaError)
        return upper;
    const count = Math.min(values.length, probabilities.length);
    if (!count)
        return E.VALUE();
    const total = probabilities.slice(0, count).reduce((sum, item) => sum + item, 0);
    if (Math.abs(total - 1) > 1e-6 || probabilities.slice(0, count).some((item) => item < 0))
        return E.NUM();
    let sum = 0;
    for (let i = 0; i < count; i += 1)
        if (values[i] >= lower && values[i] <= upper)
            sum += probabilities[i];
    return sum;
}
/** Interest rate, amount received, and the price and yield of a security that pays at maturity. */
function maturity(name, args) {
    const values = [];
    for (const arg of args) {
        const value = asNumber(arg ?? 0);
        if (value instanceof FormulaError)
            return value;
        values.push(value);
    }
    const at = (index) => values[index] ?? 0;
    const [settlement, mature] = [at(0), at(1)];
    const days = mature - settlement;
    if (days <= 0)
        return E.NUM();
    const year = yearFrac(settlement, mature, 0);
    if (typeof year !== "number" || year === 0)
        return E.NUM();
    if (name === "INTRATE")
        return at(2) === 0 ? E.DIV0() : (at(3) - at(2)) / at(2) / year;
    if (name === "RECEIVED")
        return at(2) / (1 - at(3) * year);
    const span = (from, to) => {
        const fraction = yearFrac(from, to, 0);
        return typeof fraction === "number" ? fraction : E.NUM();
    };
    const fromIssue = span(at(2), mature);
    const accrued = span(at(2), settlement);
    if (typeof fromIssue !== "number")
        return fromIssue;
    if (typeof accrued !== "number")
        return accrued;
    if (name === "PRICEMAT")
        return (100 + at(4) * fromIssue) / (1 + at(3) * year) - at(4) * accrued;
    const price = at(4);
    const redemption = 100 + at(3) * fromIssue;
    const paid = price + at(3) * accrued;
    return paid === 0 ? E.DIV0() : (redemption - paid) / paid / year;
}
function parseComplex(text) {
    const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)?(?:e[+-]?\d+)?)[ij]$/i.exec(text.replace(/\s/g, ""));
    if (!match) {
        const real = Number(text);
        return Number.isFinite(real) ? { real, imag: 0 } : undefined;
    }
    const real = match[1] === undefined || match[1] === "" || match[1] === "+" || match[1] === "-" ? 0 : Number(match[1]);
    const imagText = match[2] ?? "1";
    const imag = imagText === "" || imagText === "+" ? 1 : imagText === "-" ? -1 : Number(imagText);
    return { real, imag };
}
function formatComplex(value) {
    if (value.imag === 0)
        return String(value.real);
    const imag = Math.abs(value.imag) === 1 ? "" : String(Math.abs(value.imag));
    const sign = value.imag < 0 ? "-" : "+";
    return value.real === 0 ? `${value.imag < 0 ? "-" : ""}${imag}i` : `${value.real}${sign}${imag}i`;
}
/** Complex arithmetic. Every function reads and writes the text form Excel uses, such as "3+4i". */
function complex(name, args) {
    if (name === "COMPLEX") {
        const real = asNumber(args[0] ?? 0);
        const imag = asNumber(args[1] ?? 0);
        if (real instanceof FormulaError)
            return real;
        if (imag instanceof FormulaError)
            return imag;
        return formatComplex({ real, imag });
    }
    const values = args.map((arg) => parseComplex(asText(arg ?? "0")));
    if (values.some((item) => item === undefined))
        return E.NUM();
    const [first, second] = values;
    if (name === "IMSIN" || name === "IMCOS" || name === "IMTAN" || name === "IMCOT" || name === "IMCSC" || name === "IMSEC" || name === "IMSINH" || name === "IMCOSH" || name === "IMCSCH" || name === "IMSECH")
        return compat(name, args, helpers);
    if (name === "IMREAL")
        return first.real;
    if (name === "IMAGINARY")
        return first.imag;
    if (name === "IMABS")
        return Math.hypot(first.real, first.imag);
    if (name === "IMARGUMENT")
        return first.real === 0 && first.imag === 0 ? E.DIV0() : Math.atan2(first.imag, first.real);
    if (name === "IMCONJUGATE")
        return formatComplex({ real: first.real, imag: -first.imag });
    if (name === "IMSQRT") {
        const magnitude = Math.sqrt(Math.hypot(first.real, first.imag));
        const angle = Math.atan2(first.imag, first.real) / 2;
        return formatComplex({ real: magnitude * Math.cos(angle), imag: magnitude * Math.sin(angle) });
    }
    if (name === "IMEXP" || name === "IMLN" || name === "IMLOG10" || name === "IMLOG2") {
        const magnitude = Math.hypot(first.real, first.imag);
        const angle = Math.atan2(first.imag, first.real);
        if (name === "IMEXP")
            return formatComplex({ real: Math.exp(first.real) * Math.cos(first.imag), imag: Math.exp(first.real) * Math.sin(first.imag) });
        if (magnitude === 0)
            return E.NUM();
        const scale = name === "IMLOG10" ? Math.LN10 : name === "IMLOG2" ? Math.LN2 : 1;
        return formatComplex({ real: Math.log(magnitude) / scale, imag: angle / scale });
    }
    if (name === "IMPOWER") {
        const power = asNumber(args[1] ?? 0);
        if (power instanceof FormulaError)
            return power;
        const magnitude = Math.hypot(first.real, first.imag) ** power;
        const angle = Math.atan2(first.imag, first.real) * power;
        return formatComplex({ real: magnitude * Math.cos(angle), imag: magnitude * Math.sin(angle) });
    }
    if (!second)
        return E.VALUE();
    if (name === "IMSUM")
        return formatComplex({ real: first.real + second.real, imag: first.imag + second.imag });
    if (name === "IMSUB")
        return formatComplex({ real: first.real - second.real, imag: first.imag - second.imag });
    if (name === "IMPRODUCT")
        return formatComplex({ real: first.real * second.real - first.imag * second.imag, imag: first.real * second.imag + first.imag * second.real });
    const denominator = second.real ** 2 + second.imag ** 2;
    if (denominator === 0)
        return E.NUM();
    return formatComplex({ real: (first.real * second.real + first.imag * second.imag) / denominator, imag: (first.imag * second.real - first.real * second.imag) / denominator });
}
/** Bessel functions of the first and second kind, and the modified ones, for integer order. */
function bessel(name, args) {
    const x = asNumber(args[0] ?? 0);
    const order = asNumber(args[1] ?? 0);
    if (x instanceof FormulaError)
        return x;
    if (order instanceof FormulaError)
        return order;
    const n = Math.floor(order);
    if (n < 0 || !Number.isInteger(order))
        return E.NUM();
    const modified = name === "BESSELI" || name === "BESSELK";
    const rising = (sign) => {
        const half = Math.abs(x) / 2;
        let term = half ** n / factorial(n);
        let sum = term;
        for (let k = 1; k < 80; k += 1) {
            term *= sign * (half * half) / (k * (k + n));
            sum += term;
            if (Math.abs(term) < 1e-15 * Math.abs(sum))
                break;
        }
        return sum;
    };
    if (name === "BESSELJ")
        return (x < 0 && n % 2 ? -1 : 1) * rising(-1);
    if (name === "BESSELI")
        return rising(1);
    if (x <= 0)
        return E.NUM();
    if (n !== 0)
        return E.NUM();
    const euler = 0.5772156649015329;
    const half = x / 2;
    const base = rising(modified ? 1 : -1);
    const scale = modified ? 1 : 2 / Math.PI;
    let piece = 1;
    let sum = (modified ? -1 : 1) * scale * (Math.log(half) + euler) * base;
    for (let k = 1; k < 40; k += 1) {
        piece *= (modified ? 1 : -1) * (half * half) / (k * k);
        let harmonic = 0;
        for (let i = 1; i <= k; i += 1)
            harmonic += 1 / i;
        sum += (modified ? 1 : -1) * scale * piece * harmonic;
    }
    return sum;
}
/** A power series with coefficients taken from a range, stepping the exponent by a fixed amount. */
function seriesSum(args) {
    const x = asNumber(args[0] ?? 0);
    const start = asNumber(args[1] ?? 0);
    const step = asNumber(args[2] ?? 0);
    if (x instanceof FormulaError)
        return x;
    if (start instanceof FormulaError)
        return start;
    if (step instanceof FormulaError)
        return step;
    const coefficients = numbers(args.slice(3, 4));
    if (!coefficients.length)
        return E.VALUE();
    return coefficients.reduce((sum, coefficient, index) => sum + coefficient * x ** (start + index * step), 0);
}
const BAHT_ONES = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const BAHT_PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
/** Spells a number in Thai baht, the one currency Excel has a spelling function for. */
function bahtText(args) {
    const value = asNumber(args[0] ?? 0);
    if (value instanceof FormulaError)
        return value;
    const rounded = Math.round(Math.abs(value) * 100);
    const baht = Math.floor(rounded / 100);
    const satang = rounded % 100;
    const group = (amount) => {
        const digits = String(amount).padStart(6, "0").slice(-6).split("").map(Number);
        return digits.map((digit, index) => {
            const place = 5 - index;
            if (digit === 0)
                return "";
            if (place === 0 && digit === 1 && amount > 1)
                return "เอ็ด";
            if (place === 1 && digit === 2)
                return "ยี่สิบ";
            if (place === 1 && digit === 1)
                return "สิบ";
            return `${BAHT_ONES[digit]}${BAHT_PLACES[place]}`;
        }).join("");
    };
    const millions = Math.floor(baht / 1_000_000);
    const rest = baht % 1_000_000;
    const words = `${millions ? `${group(millions)}ล้าน` : ""}${rest ? group(rest) : ""}` || "ศูนย์";
    const body = `${value < 0 ? "ลบ" : ""}${words}บาท`;
    return satang ? `${body}${group(satang)}สตางค์` : `${body}ถ้วน`;
}
/** CELL reads one fact about a reference: its address, row, column, or whether it holds a formula. */
function cellInfo(name, args, ctx) {
    const kind = asText(args[0] ?? "address").toLowerCase();
    const origin = rangeOrigin(args[1]) ?? { sheetIndex: ctx.sheetIndex, r1: ctx.row, c1: ctx.col, r2: ctx.row, c2: ctx.col };
    const sheet = ctx.workbook.sheets[origin.sheetIndex];
    if (kind === "address")
        return `$${columnName(origin.c1)}$${origin.r1 + 1}`;
    if (kind === "row")
        return origin.r1 + 1;
    if (kind === "col")
        return origin.c1 + 1;
    if (kind === "contents")
        return sheet?.cells[origin.r1]?.[origin.c1]?.value ?? "";
    if (kind === "type") {
        const value = sheet?.cells[origin.r1]?.[origin.c1]?.value ?? "";
        return value === "" ? "b" : Number.isFinite(Number(value)) ? "v" : "l";
    }
    if (kind === "filename" || kind === "sheet")
        return sheet?.name ?? "";
    return E.VALUE();
}
function counting(name, args) {
    if (name === "CEILING.MATH" || name === "FLOOR.MATH") {
        const value = asNumber(args[0] ?? 0);
        const step = asNumber(args[1] ?? 1);
        const mode = asNumber(args[2] ?? 0);
        if (value instanceof FormulaError)
            return value;
        if (step instanceof FormulaError)
            return step;
        if (mode instanceof FormulaError)
            return mode;
        const size = Math.abs(step) || 1;
        const toward = name === "CEILING.MATH" ? (value < 0 && mode !== 0 ? Math.floor(value / size) : Math.ceil(value / size)) : (value < 0 && mode !== 0 ? Math.ceil(value / size) : Math.floor(value / size));
        return toward * size;
    }
    const n = asNumber(args[0] ?? 0);
    if (n instanceof FormulaError)
        return n;
    if (name === "FACTDOUBLE") {
        if (n < 0 || !Number.isInteger(n))
            return E.NUM();
        let out = 1;
        for (let i = Math.floor(n); i > 1; i -= 2)
            out *= i;
        return out;
    }
    const k = asNumber(args[1] ?? 0);
    if (k instanceof FormulaError)
        return k;
    if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0)
        return E.NUM();
    if (name === "PERMUTATIONA")
        return n ** k;
    return binomial(Math.floor(n) + Math.floor(k) - 1, Math.floor(k));
}
function bases(name, args) {
    if (name === "ROMAN") {
        const value = asNumber(args[0] ?? 0);
        if (value instanceof FormulaError)
            return value;
        if (value < 1 || value > 3999 || !Number.isInteger(value))
            return E.VALUE();
        const glyphs = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
        let rest = Math.floor(value);
        let out = "";
        for (const [amount, glyph] of glyphs)
            while (rest >= amount) {
                out += glyph;
                rest -= amount;
            }
        return out;
    }
    if (name === "ARABIC") {
        const text = asText(args[0] ?? "").trim().toUpperCase();
        const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        let total = 0;
        for (let i = 0; i < text.length; i += 1) {
            const current = values[text[i]];
            const next = values[text[i + 1] ?? ""] ?? 0;
            if (current === undefined)
                return E.VALUE();
            total += current < next ? -current : current;
        }
        return total;
    }
    if (name === "BASE") {
        const value = asNumber(args[0] ?? 0);
        const radix = asNumber(args[1] ?? 10);
        const places = asNumber(args[2] ?? 0);
        if (value instanceof FormulaError)
            return value;
        if (radix instanceof FormulaError)
            return radix;
        if (places instanceof FormulaError)
            return places;
        if (value < 0 || !Number.isInteger(value) || radix < 2 || radix > 36)
            return E.NUM();
        const out = Math.floor(value).toString(Math.floor(radix)).toUpperCase();
        return places > out.length ? out.padStart(Math.floor(places), "0") : out;
    }
    const text = asText(args[0] ?? "").trim();
    const radix = asNumber(args[1] ?? 10);
    if (radix instanceof FormulaError)
        return radix;
    if (radix < 2 || radix > 36)
        return E.NUM();
    const digits = text.toUpperCase();
    if ([...digits].some((char) => parseInt(char, Math.floor(radix)) !== parseInt(char, Math.floor(radix)) || parseInt(char, 36) >= radix))
        return E.NUM();
    return parseInt(digits, Math.floor(radix));
}
const BIT_LIMIT = 2 ** 48;
function bits(name, args) {
    const left = asNumber(args[0] ?? 0);
    const right = asNumber(args[1] ?? 0);
    if (left instanceof FormulaError)
        return left;
    if (right instanceof FormulaError)
        return right;
    if (!Number.isInteger(left) || !Number.isInteger(right) || left < 0 || left >= BIT_LIMIT)
        return E.NUM();
    if (name === "BITLSHIFT")
        return right < 0 ? bits("BITRSHIFT", [left, -right]) : left * 2 ** right >= BIT_LIMIT ? E.NUM() : left * 2 ** right;
    if (name === "BITRSHIFT")
        return right < 0 ? bits("BITLSHIFT", [left, -right]) : Math.floor(left / 2 ** right);
    if (right < 0 || right >= BIT_LIMIT)
        return E.NUM();
    if (name === "BITAND")
        return left & right;
    if (name === "BITOR")
        return left | right;
    return left ^ right;
}
function matrixAlgebra(name, value) {
    if (!Array.isArray(value))
        return E.VALUE();
    const width = rangeWidth(value);
    const height = Math.ceil(value.length / width);
    if (width !== height)
        return E.VALUE();
    const grid = Array.from({ length: width }, (_, row) => value.slice(row * width, row * width + width).map((cell) => asNumber(cell)));
    for (const row of grid)
        for (const cell of row)
            if (cell instanceof FormulaError)
                return cell;
    const matrix = grid.map((row) => row);
    if (name === "MDETERM")
        return determinant(matrix);
    const inverse = invert(matrix);
    if (inverse instanceof FormulaError)
        return inverse;
    return withWidth(inverse.flat(), width);
}
function determinant(matrix) {
    const size = matrix.length;
    if (size === 1)
        return matrix[0][0];
    const rows = matrix.map((row) => [...row]);
    let sign = 1;
    for (let col = 0; col < size; col += 1) {
        let pivot = rows.slice(col).findIndex((row) => row[col] !== 0);
        if (pivot < 0)
            return 0;
        pivot += col;
        if (pivot !== col) {
            [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
            sign = -sign;
        }
        for (let row = col + 1; row < size; row += 1) {
            const factor = rows[row][col] / rows[col][col];
            for (let k = col; k < size; k += 1)
                rows[row][k] -= factor * rows[col][k];
        }
    }
    return sign * rows.reduce((product, row, index) => product * row[index], 1);
}
function invert(matrix) {
    const size = matrix.length;
    const rows = matrix.map((row, index) => [...row, ...Array.from({ length: size }, (_, col) => (col === index ? 1 : 0))]);
    for (let col = 0; col < size; col += 1) {
        let pivot = rows.slice(col).reduce((best, row, offset) => (Math.abs(row[col]) > Math.abs(rows[best][col]) ? col + offset : best), col);
        if (rows[pivot][col] === 0)
            return E.NUM();
        [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
        const scale = rows[col][col];
        rows[col] = rows[col].map((cell) => cell / scale);
        for (let row = 0; row < size; row += 1) {
            if (row === col)
                continue;
            const factor = rows[row][col];
            rows[row] = rows[row].map((cell, index) => cell - factor * rows[col][index]);
        }
    }
    return rows.map((row) => row.slice(size));
}
/** MIRR discounts the outflows at the finance rate and compounds the inflows at the reinvestment rate. */
function modifiedRate(args) {
    const flows = numbers(args.slice(0, 1));
    const finance = asNumber(args[1] ?? 0);
    const reinvest = asNumber(args[2] ?? 0);
    if (finance instanceof FormulaError)
        return finance;
    if (reinvest instanceof FormulaError)
        return reinvest;
    if (finance <= -1 || reinvest <= -1 || flows.length < 2)
        return E.NUM();
    let negative = 0;
    let positive = 0;
    flows.forEach((flow, index) => {
        if (flow < 0)
            negative += flow / (1 + finance) ** index;
        else
            positive += flow * (1 + reinvest) ** (flows.length - 1 - index);
    });
    if (negative === 0 || positive === 0)
        return E.DIV0();
    return (positive / -negative) ** (1 / (flows.length - 1)) - 1;
}
/** XNPV discounts each amount by the fraction of a year since the first date. */
function datedPresent(args) {
    const rate = asNumber(args[0] ?? 0);
    if (rate instanceof FormulaError)
        return rate;
    if (rate <= -1)
        return E.NUM();
    const amounts = numbers(args.slice(1, 2));
    const dates = numbers(args.slice(2, 3));
    const count = Math.min(amounts.length, dates.length);
    if (count < 2)
        return E.VALUE();
    const first = dates[0];
    let total = 0;
    for (let i = 0; i < count; i += 1)
        total += amounts[i] / (1 + rate) ** ((dates[i] - first) / 365);
    return total;
}
function financeRest(name, args) {
    if (name === "DOLLARDE" || name === "DOLLARFR") {
        const value = asNumber(args[0] ?? 0);
        const fraction = asNumber(args[1] ?? 0);
        if (value instanceof FormulaError)
            return value;
        if (fraction instanceof FormulaError)
            return fraction;
        const base = Math.floor(Math.abs(fraction));
        if (base < 1)
            return E.NUM();
        const sign = value < 0 ? -1 : 1;
        const whole = Math.trunc(Math.abs(value));
        const rest = Math.abs(value) - whole;
        return name === "DOLLARDE" ? sign * (whole + rest * 100 / base) : sign * (whole + rest * base / 100);
    }
    const settlement = asNumber(args[0] ?? 0);
    const maturity = asNumber(args[1] ?? 0);
    const third = asNumber(args[2] ?? 0);
    if (settlement instanceof FormulaError)
        return settlement;
    if (maturity instanceof FormulaError)
        return maturity;
    if (third instanceof FormulaError)
        return third;
    const days = maturity - settlement;
    if (days <= 0)
        return E.NUM();
    if (name === "TBILLYIELD")
        return third === 0 ? E.DIV0() : (100 - third) / third * (360 / days);
    const par = asNumber(args[3] ?? 0);
    if (par instanceof FormulaError)
        return par;
    return par * third * days / 365;
}
function aggregate(args) {
    const fn = asNumber(args[0] ?? 0);
    const option = asNumber(args[1] ?? 0);
    if (fn instanceof FormulaError)
        return fn;
    if (option instanceof FormulaError)
        return option;
    const code = Math.floor(fn);
    const handler = SUBTOTALS[code];
    if (!handler)
        return E.VALUE();
    const skipHidden = option === 1 || option === 3 || option === 5 || option === 7;
    const skipErrors = option >= 2 && option <= 7;
    const cleaned = args.slice(2).map((arg) => {
        if (!Array.isArray(arg))
            return arg instanceof FormulaError && skipErrors ? [] : arg;
        const kept = arg.filter((item, index) => {
            const flags = arg;
            if (skipHidden && (flags.hidden?.[index] ?? false))
                return false;
            if (flags.subtotals?.[index] ?? false)
                return false;
            return !(skipErrors && typeof item === "string" && item.startsWith("#"));
        });
        return tagRange(kept, rangeWidth(arg), [], []);
    });
    return handler(cleaned);
}
function randomArray(args) {
    const rows = asNumber(args[0] ?? 1);
    const cols = asNumber(args[1] ?? 1);
    const min = asNumber(args[2] ?? 0);
    const max = asNumber(args[3] ?? 1);
    const whole = asBool(args[4] ?? false);
    if (rows instanceof FormulaError)
        return rows;
    if (cols instanceof FormulaError)
        return cols;
    if (min instanceof FormulaError)
        return min;
    if (max instanceof FormulaError)
        return max;
    if (whole instanceof FormulaError)
        return whole;
    if (rows < 1 || cols < 1)
        return E.VALUE();
    const out = [];
    for (let i = 0; i < Math.floor(rows) * Math.floor(cols); i += 1) {
        const value = min + Math.random() * (max - min);
        out.push(whole ? Math.floor(value) : value);
    }
    return out.length === 1 ? out[0] : withWidth(out, Math.floor(cols));
}
/** FORMULATEXT reads the formula stored on the cell, with its leading equals sign. */
function formulaText(ctx, value) {
    const origin = rangeOrigin(value);
    if (!origin)
        return E.NA();
    const formula = ctx.workbook.sheets[origin.sheetIndex]?.cells[origin.r1]?.[origin.c1]?.formula;
    return formula ? `=${formula}` : E.NA();
}
function sheetNumber(ctx, value) {
    if (value === undefined)
        return ctx.sheetIndex + 1;
    const origin = rangeOrigin(value);
    if (origin)
        return origin.sheetIndex + 1;
    const name = asText(value).toUpperCase();
    const index = ctx.workbook.sheets.findIndex((sheet) => sheet.name.toUpperCase() === name);
    return index < 0 ? E.NA() : index + 1;
}
/** ISFORMULA looks at the cell a reference points at, not at the value it holds. */
function cellHasFormula(ctx, value) {
    const origin = rangeOrigin(value);
    if (!origin)
        return false;
    return Boolean(ctx.workbook.sheets[origin.sheetIndex]?.cells[origin.r1]?.[origin.c1]?.formula);
}
function factorial(n) {
    let out = 1;
    for (let i = 2; i <= n; i += 1)
        out *= i;
    return out;
}
function binomial(n, k) {
    let out = 1;
    for (let i = 1; i <= k; i += 1)
        out = (out * (n - k + i)) / i;
    return out;
}
/** Lanczos approximation of the gamma function, accurate enough for the distribution densities. */
function gamma(z) {
    const p = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    if (z < 0.5)
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    let x = 0.9999999999998099;
    for (let i = 0; i < p.length; i += 1)
        x += p[i] / (z + i);
    const t = z + p.length - 1.5;
    return Math.sqrt(2 * Math.PI) * t ** (z - 0.5) * Math.exp(-t) * x;
}
function beta(a, b) {
    return (gamma(a) * gamma(b)) / gamma(a + b);
}
/** The lower regularized gamma, by its series. Used by the chi-square distribution. */
function gammaP(shape, x) {
    if (x <= 0)
        return 0;
    let term = 1 / shape;
    let sum = term;
    for (let n = 1; n < 200; n += 1) {
        term *= x / (shape + n);
        sum += term;
        if (Math.abs(term) < 1e-12 * Math.abs(sum))
            break;
    }
    return sum * Math.exp(-x + shape * Math.log(x) - logGamma(shape));
}
function logGamma(z) {
    const p = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
    let x = 0.9999999999998099;
    const shifted = z < 0.5 ? 1 - z : z;
    for (let i = 0; i < p.length; i += 1)
        x += p[i] / (shifted + i);
    const t = shifted + p.length - 1.5;
    const value = 0.5 * Math.log(2 * Math.PI) + (shifted - 0.5) * Math.log(t) - t + Math.log(x);
    return z < 0.5 ? Math.log(Math.PI / Math.sin(Math.PI * z)) - value : value;
}
/**
 * The regularized incomplete beta, by its power series. The series converges slowly past the
 * symmetry point, so anything above it is computed as one minus the complementary value.
 */
function regularizedBeta(x, a, b) {
    if (x <= 0)
        return 0;
    if (x >= 1)
        return 1;
    if (x > (a + 1) / (a + b + 2))
        return 1 - regularizedBeta(1 - x, b, a);
    let term = 1 / a;
    let sum = term;
    for (let n = 1; n < 400; n += 1) {
        term *= x * (a + b + n - 1) / (a + n);
        sum += term;
        if (Math.abs(term) < 1e-14 * Math.abs(sum))
            break;
    }
    return Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b)) * sum;
}
function logBeta(a, b) {
    return logGamma(a) + logGamma(b) - logGamma(a + b);
}
/** The standard normal density and distribution, and the inverse through a rational approximation. */
function normalDist(name, args) {
    if (name === "NORM.S.DIST" || name === "NORMSDIST") {
        const z = asNumber(args[0] ?? 0);
        if (z instanceof FormulaError)
            return z;
        const cumulative = name === "NORMSDIST" || asBool(args[1] ?? true);
        if (cumulative instanceof FormulaError)
            return cumulative;
        return cumulative ? normalCdf(z) : Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
    }
    if (name === "NORMSINV" || name === "NORM.S.INV") {
        const p = asNumber(args[0] ?? 0);
        if (p instanceof FormulaError)
            return p;
        if (p <= 0 || p >= 1)
            return E.NUM();
        return normalInv(p);
    }
    const x = asNumber(args[0] ?? 0);
    const mean = asNumber(args[1] ?? 0);
    const deviation = asNumber(args[2] ?? 1);
    if (x instanceof FormulaError)
        return x;
    if (mean instanceof FormulaError)
        return mean;
    if (deviation instanceof FormulaError)
        return deviation;
    if (deviation <= 0)
        return E.NUM();
    const z = (x - mean) / deviation;
    if (name === "NORM.INV") {
        if (x <= 0 || x >= 1)
            return E.NUM();
        return mean + deviation * normalInv(x);
    }
    const cumulative = asBool(args[3] ?? true);
    if (cumulative instanceof FormulaError)
        return cumulative;
    return cumulative ? normalCdf(z) : Math.exp(-z * z / 2) / (deviation * Math.sqrt(2 * Math.PI));
}
/** Abramowitz and Stegun's approximation of the standard normal distribution. */
function normalCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const tail = poly * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
    return z >= 0 ? 1 - tail : tail;
}
/** Peter Acklam's rational approximation of the inverse standard normal distribution. */
function normalInv(p) {
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137143, 3.754408661907416];
    const low = 0.02425;
    const high = 1 - low;
    let q;
    if (p < low) {
        const t = Math.sqrt(-2 * Math.log(p));
        q = (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
    }
    else if (p > high) {
        const t = Math.sqrt(-2 * Math.log(1 - p));
        q = -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
    }
    else {
        const t = p - 0.5;
        const r = t * t;
        q = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    const err = normalCdf(q) - p;
    return q - err / (Math.exp(-q * q / 2) / Math.sqrt(2 * Math.PI));
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
/** MAXIFS and MINIFS share SUMIFS' argument order: the values first, then range and criterion pairs. */
function extremeIf(name, args) {
    const values = Array.isArray(args[0]) ? args[0] : [args[0] ?? ""];
    const rows = values.length;
    const matched = [];
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
        if (ok)
            matched.push(row);
    }
    const nums = matched.map((row) => asNumber(values[row] ?? "")).filter((item) => typeof item === "number");
    if (!nums.length)
        return 0;
    return name === "MAXIFS" ? Math.max(...nums) : Math.min(...nums);
}
function gcdLcm(name, args) {
    const nums = numbers(args).map((item) => Math.trunc(Math.abs(item)));
    if (!nums.length)
        return E.VALUE();
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const value = nums.reduce((acc, item) => gcd(acc, item));
    if (name === "GCD")
        return value;
    return nums.reduce((acc, item) => (item === 0 ? 0 : acc / gcd(acc, item) * item), 1);
}
/** EVEN and ODD round away from zero to the next even or odd integer. */
function evenOdd(value, odd) {
    const sign = value < 0 ? -1 : 1;
    const magnitude = Math.ceil(Math.abs(value));
    const wanted = odd ? 1 : 0;
    return sign * (magnitude + (magnitude % 2 === wanted ? 0 : 1));
}
/** Week of the year. System 1 starts weeks on Sunday, 2 on Monday. */
function weekNumber(serial, system) {
    const day = new Date(Math.round((serial - 25569) * 86400000));
    const start = Date.UTC(day.getUTCFullYear(), 0, 1);
    const firstWeekday = new Date(start).getUTCDay();
    const offset = system === 2 ? (firstWeekday + 6) % 7 : firstWeekday;
    const days = Math.round((day.getTime() - start) / 86400000);
    return Math.floor((days + offset) / 7) + 1;
}
/** ISO week number, where weeks start on Monday and week 1 holds the first Thursday. */
function isoWeekNumber(serial) {
    const day = new Date(Math.round((serial - 25569) * 86400000));
    const thursday = new Date(day.getTime());
    thursday.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7));
    const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
    firstThursday.setUTCDate(4 - ((firstThursday.getUTCDay() + 6) % 7) + 3);
    return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 86400000 / 7);
}
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
            return compare(cell, criterionValue(op[2] ?? ""), op[1]) === true;
        if (probe.includes("*") || probe.includes("?")) {
            return new RegExp(`^${wildcardPattern(probe)}$`, "i").test(String(cell));
        }
    }
    return compare(cell, probe ?? "", "=") === true;
}
/** The number, date, or time a criterion names, so ">2026-01-15" compares dates rather than text. */
function criterionValue(text) {
    const date = dateText(text) ?? timeText(text);
    if (date !== undefined)
        return date;
    const value = coerceCellText(text);
    // A criterion built with & carries the serial as text, rounded the way a cell shows it.
    if (typeof value === "string" && /^[+-]?\d*\.?\d+(?:e[+-]?\d+)?$/i.test(value.trim()))
        return Math.round(Number(value) * 1e10) / 1e10;
    return value;
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
function tagRange(values, width, hidden, subtotals, origin) {
    Object.defineProperty(values, "width", { value: Math.max(1, width), enumerable: false });
    Object.defineProperty(values, "hidden", { value: hidden, enumerable: false });
    Object.defineProperty(values, "subtotals", { value: subtotals, enumerable: false });
    if (origin)
        Object.defineProperty(values, "origin", { value: origin, enumerable: false });
    return values;
}
function rangeAreas(value) {
    if (!Array.isArray(value))
        return [];
    return value.areas ?? [];
}
/** Joins ranges listed with commas. Overlapping cells count once in a sum, but each range stays its own area. */
function unionRanges(parts) {
    const bad = parts.find((part) => part instanceof FormulaError);
    if (bad instanceof FormulaError)
        return bad;
    const areas = parts.flatMap((part) => {
        const nested = rangeAreas(part);
        return nested.length ? nested : [part];
    });
    const out = [];
    const hidden = [];
    const subtotals = [];
    const seen = new Set();
    for (const area of areas) {
        if (Array.isArray(area)) {
            const flags = area;
            const origin = flags.origin;
            const width = origin ? origin.c2 - origin.c1 + 1 : rangeWidth(area);
            area.forEach((item, index) => {
                // A cell that sits in two of the ranges counts once, which is what SUM does with an overlap.
                if (origin) {
                    const key = `${origin.sheetIndex}:${origin.r1 + Math.floor(index / width)}:${origin.c1 + (index % width)}`;
                    if (seen.has(key))
                        return;
                    seen.add(key);
                }
                out.push(item);
                hidden.push(flags.hidden?.[index] ?? false);
                subtotals.push(flags.subtotals?.[index] ?? false);
            });
        }
        else if (isPending(area))
            return E.NAME();
        else if (isLambda(area) || isOmitted(area))
            out.push("");
        else if (area instanceof FormulaError)
            out.push(area.code);
        else
            out.push(area);
    }
    const joined = tagRange(out, 1, hidden, subtotals);
    Object.defineProperty(joined, "areas", { value: areas, enumerable: false });
    return joined;
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
/** ROW of a range lists every row number, top to bottom. A single cell stays one number. */
function rowNumbers(value, ctx) {
    const origin = rangeOrigin(value);
    if (!origin || origin.r1 === origin.r2)
        return rowOf(value, ctx) + 1;
    const out = [];
    for (let row = origin.r1; row <= origin.r2; row += 1)
        out.push(row + 1);
    return out;
}
/** COLUMN of a range lists every column number, left to right. A single cell stays one number. */
function columnNumbers(value, ctx) {
    const origin = rangeOrigin(value);
    if (!origin || origin.c1 === origin.c2)
        return columnOf(value, ctx) + 1;
    const out = [];
    for (let col = origin.c1; col <= origin.c2; col += 1)
        out.push(col + 1);
    return withWidth(out, out.length);
}
function rowOf(value, ctx) {
    const origin = rangeOrigin(value);
    if (origin)
        return origin.r1;
    const parsed = value === undefined ? undefined : parseA1(asText(value));
    return parsed?.row ?? ctx.row;
}
function columnOf(value, ctx) {
    const origin = rangeOrigin(value);
    if (origin)
        return origin.c1;
    const parsed = value === undefined ? undefined : parseA1(asText(value));
    return parsed?.col ?? ctx.col;
}
function rowsOf(value) {
    const origin = rangeOrigin(value);
    if (origin)
        return origin.r2 - origin.r1 + 1;
    return Array.isArray(value) ? Math.ceil(value.length / rangeWidth(value)) : 1;
}
function columnsOf(value) {
    const origin = rangeOrigin(value);
    if (origin)
        return origin.c2 - origin.c1 + 1;
    return Array.isArray(value) ? rangeWidth(value) : 1;
}
/** The cells two ranges share. Nothing in common is a null error. */
function intersectRanges(workbook, left, right) {
    if (left instanceof FormulaError)
        return left;
    if (right instanceof FormulaError)
        return right;
    const a = rangeOrigin(left);
    const b = rangeOrigin(right);
    if (!a || !b || a.sheetIndex !== b.sheetIndex)
        return E.VALUE();
    const r1 = Math.max(a.r1, b.r1);
    const r2 = Math.min(a.r2, b.r2);
    const c1 = Math.max(a.c1, b.c1);
    const c2 = Math.min(a.c2, b.c2);
    if (r1 > r2 || c1 > c2)
        return E.NULL();
    return readRange(workbook, a.sheetIndex, { row: r1, col: c1 }, { row: r2, col: c2 });
}
function rangeOrigin(value) {
    if (!Array.isArray(value))
        return undefined;
    return value.origin;
}
/** A1 column letters for a zero-based column. */
function columnName(col) {
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
function offsetRange(ctx, args) {
    const origin = rangeOrigin(args[0]);
    if (!origin)
        return E.VALUE();
    const rows = asNumber(args[1] ?? 0);
    const cols = asNumber(args[2] ?? 0);
    const height = args[3] === undefined ? origin.r2 - origin.r1 + 1 : asNumber(args[3]);
    const width = args[4] === undefined ? origin.c2 - origin.c1 + 1 : asNumber(args[4]);
    if (rows instanceof FormulaError)
        return rows;
    if (cols instanceof FormulaError)
        return cols;
    if (height instanceof FormulaError)
        return height;
    if (width instanceof FormulaError)
        return width;
    if (height < 1 || width < 1)
        return E.REF();
    const r1 = origin.r1 + Math.trunc(rows);
    const c1 = origin.c1 + Math.trunc(cols);
    if (r1 < 0 || c1 < 0)
        return E.REF();
    const values = readRange(ctx.workbook, origin.sheetIndex, { row: r1, col: c1 }, { row: r1 + Math.trunc(height) - 1, col: c1 + Math.trunc(width) - 1 });
    return values.length === 1 ? values[0] ?? "" : values;
}
/** INDIRECT reads whatever range the text names, on the current sheet unless the text names one. */
function indirectRange(ctx, args) {
    const text = asText(args[0] ?? "").trim();
    // The second argument picks the address style. Anything but FALSE is A1.
    const a1 = args[1] === undefined ? true : asBool(args[1]);
    if (a1 instanceof FormulaError)
        return a1;
    const bang = text.lastIndexOf("!");
    const sheetName = bang < 0 ? undefined : text.slice(0, bang).replace(/^'|'$/g, "").replace(/''/g, "'");
    const body = bang < 0 ? text : text.slice(bang + 1);
    const span = a1 ? spanFromA1(body) : spanFromR1C1(body, ctx);
    if (!span)
        return E.REF();
    const sheetIndex = sheetName === undefined ? ctx.sheetIndex : findSheet(ctx.workbook, sheetName);
    if (sheetIndex < 0)
        return E.REF();
    const values = readRange(ctx.workbook, sheetIndex, span.start, span.end);
    return values.length === 1 ? values[0] ?? "" : values;
}
/** `A1`, `A1:B2`, `A:A`, and `1:1` from a text. A bare letter is not a column here. */
function spanFromA1(body) {
    const [startText, endText] = body.split(":");
    const ranged = endText !== undefined;
    const start = cornerFromA1(startText ?? "", ranged);
    const end = cornerFromA1((endText ?? startText) ?? "", ranged);
    if (!start || !end || start.whole !== end.whole)
        return undefined;
    return { start, end };
}
function cornerFromA1(ref, ranged) {
    const cell = parseA1(ref);
    if (cell)
        return cell;
    if (/^\$?\d+$/.test(ref)) {
        const row = Number(ref.replace("$", "")) - 1;
        if (row < 0 || row > 1048575)
            return undefined;
        return { row, col: 0, whole: "row" };
    }
    if (!ranged)
        return undefined;
    const col = columnNumber(ref.replace(/^\$/, "").toUpperCase());
    if (col == null || !/^\$?[A-Z]{1,3}$/.test(ref.toUpperCase()))
        return undefined;
    return { row: 0, col, whole: "col" };
}
/** `R2C3` and `R[1]C[-1]`, including a range of them, counted from the cell holding the formula. */
function spanFromR1C1(body, ctx) {
    const [startText, endText] = body.split(":");
    const start = parseR1C1(startText ?? "", ctx);
    const end = parseR1C1((endText ?? startText) ?? "", ctx);
    if (!start || !end || start.row < 0 || end.row < 0)
        return undefined;
    return { start, end };
}
function scalar(value) {
    if (isPending(value))
        return E.NAME();
    if (isLambda(value))
        return E.VALUE();
    if (isOmitted(value))
        return "";
    if (Array.isArray(value) && value.length === 1)
        return scalar(value[0] ?? "");
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
    const split = name.indexOf("2");
    const [from, to] = [name.slice(0, split), name.slice(split + 1)];
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
import { compat } from "./compat.js";
const helpers = {
    flatten, numbers, asNumber, asText, asBool, withWidth, rangeWidth, rangeOrigin, variance, stdev,
    distFn, distMore, distTail, distInverse, distSolve, normalDist, covariance, tests, coupon, yearFrac,
    regression, normalInv, parseComplex, formatComplex,
};
export function setFormula(cell, formula) {
    const body = formula.startsWith("=") ? formula.slice(1) : formula;
    cell.formula = body;
}
