import type { Workbook } from "@sliiu/sheet-core";
export type XlsxOpenErrorCode = "LEGACY_XLS" | "ENCRYPTED_XLSX";
export declare class XlsxOpenError extends Error {
    readonly code: XlsxOpenErrorCode;
    constructor(code: XlsxOpenErrorCode);
}
/** Reads a .xlsx into sheets of shown values. Formulas are kept as text and not evaluated. */
export declare function parseXlsx(input: ArrayBuffer | Uint8Array | Blob): Promise<Workbook>;
