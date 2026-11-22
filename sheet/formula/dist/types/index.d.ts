import type { ConsolidateFunc, SheetCell, SheetConsolidation, Workbook } from "@sliiu/sheet-core";
export type FormulaPrimitive = number | string | boolean;
export type FormulaValue = FormulaPrimitive | FormulaError | FormulaPrimitive[];
export declare class FormulaError {
    readonly code: string;
    constructor(code: string);
    toString(): string;
}
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
export { formatNumber } from "./format.js";
export declare function setFormula(cell: SheetCell, formula: string): void;
