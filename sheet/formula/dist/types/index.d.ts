import type { ConsolidateFunc, SheetCell, SheetConsolidation, Workbook } from "@sliiu/sheet-core";
export type FormulaPrimitive = number | string | boolean;
type Token = {
    kind: "num";
    value: number;
} | {
    kind: "str";
    value: string;
} | {
    kind: "id";
    value: string;
} | {
    kind: "ref";
    value: string;
} | {
    kind: "op";
    value: string;
} | {
    kind: "lp";
} | {
    kind: "rp";
} | {
    kind: "comma";
} | {
    kind: "colon";
} | {
    kind: "bang";
} | {
    kind: "lb";
} | {
    kind: "rb";
} | {
    kind: "semi";
};
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
export declare class FormulaError {
    readonly code: string;
    constructor(code: string);
    toString(): string;
}
export declare const E: {
    DIV0: () => FormulaError;
    VALUE: () => FormulaError;
    REF: () => FormulaError;
    NA: () => FormulaError;
    NAME: () => FormulaError;
    NUM: () => FormulaError;
};
export interface EvalContext {
    workbook: Workbook;
    sheetIndex: number;
    row: number;
    col: number;
}
/** Recalculate every formula cell. Display results go into `value`; `formula` stays. */
export declare function recalculate(workbook: Workbook): void;
export declare function evaluate(input: string, ctx: EvalContext): FormulaValue;
export interface ConsolidateSpec {
    func?: ConsolidateFunc;
    sources: string[];
    dest: string;
    topRow?: boolean;
    leftCol?: boolean;
    links?: boolean;
}
/** Combine the source ranges into the destination sheet. Stores the definition so it reads back. */
export declare function consolidateRanges(workbook: Workbook, spec: ConsolidateSpec): SheetConsolidation;
export declare function formatResult(value: FormulaValue): string;
/** The position a value came from, when it is a range. Lets OFFSET and INDIRECT move it. */
export interface RangeOrigin {
    sheetIndex: number;
    r1: number;
    c1: number;
    r2: number;
    c2: number;
}
export { formatNumber } from "./format.js";
export declare function setFormula(cell: SheetCell, formula: string): void;
