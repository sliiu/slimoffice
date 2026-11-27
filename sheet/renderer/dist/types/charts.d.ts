import type { SheetPivot, Worksheet } from "@sliiu/sheet-core";
export declare function renderCharts(sheet: Worksheet): HTMLElement;
/** The distinct values of the column the slicer's field names, in the order they appear. */
export declare function slicerValues(sheet: Worksheet, slicer: {
    field: string;
}): string[];
export interface PivotSummary {
    /** Column-field values. Empty when the pivot has no column field. */
    columns: string[];
    rows: {
        label: string;
        values: number[];
    }[];
    /** One total per column, taken over every row. Empty when there is nothing to add up. */
    totals: number[];
}
/** Reduces the first value field by row field, and by column field when one is set. */
export declare function summarizePivot(pivot: SheetPivot): PivotSummary;
export declare function numbersFromRange(sheet: Worksheet, range: string): number[];
