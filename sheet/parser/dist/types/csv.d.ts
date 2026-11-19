import type { Workbook } from "@sliiu/sheet-core";
export interface CsvOptions {
    delimiter?: string;
    name?: string;
}
/** Read CSV / TSV text into a one-sheet workbook. */
export declare function parseCsv(input: string | Uint8Array | ArrayBuffer, options?: CsvOptions): Workbook;
/** Write a workbook's first sheet as CSV text. */
export declare function writeCsv(workbook: Workbook, delimiter?: string): string;
