import type { Workbook } from "@sliiu/sheet-core";
/** Minimal BIFF8 reader: values, shared strings, booleans, formula cached values. */
export declare function parseXls(input: ArrayBuffer | Uint8Array): Workbook;
