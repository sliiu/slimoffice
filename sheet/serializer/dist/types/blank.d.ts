import type { SheetCell, Workbook } from "@sliiu/sheet-core";
/** A one-sheet workbook, empty or filled. It can be opened again. */
export declare function blankWorkbook(name?: string, cells?: SheetCell[][]): {
    bytes: Uint8Array;
    workbook: Workbook;
};
