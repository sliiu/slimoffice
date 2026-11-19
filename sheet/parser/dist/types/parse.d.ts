import type { Workbook } from "@sliiu/sheet-core";
export type XlsxOpenErrorCode = "LEGACY_XLS" | "ENCRYPTED_XLSX" | "WRONG_PASSWORD";
export declare class XlsxOpenError extends Error {
    readonly code: XlsxOpenErrorCode;
    constructor(code: XlsxOpenErrorCode);
}
export interface ParseXlsxOptions {
    /** Password for Agile-encrypted workbooks. */
    password?: string;
}
/** Reads a .xlsx into sheets. Formula cells keep `formula` and show the cached value until recalculate. */
export declare function parseXlsx(input: ArrayBuffer | Uint8Array | Blob, options?: ParseXlsxOptions): Promise<Workbook>;
