import type { SheetCell, Workbook } from "@sliiu/sheet-core";
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
export declare function formatResult(value: FormulaValue): string;
export declare function setFormula(cell: SheetCell, formula: string): void;
