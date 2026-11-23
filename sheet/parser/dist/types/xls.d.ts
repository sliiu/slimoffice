import type { Workbook } from "@sliiu/sheet-core";
/** Minimal BIFF8 reader: values, shared strings, booleans, formula cached values. */
export declare function parseXls(input: ArrayBuffer | Uint8Array): Workbook;
/** One stream inside a compound file, found by the tail of its name. */
export interface CompoundStream {
    name: string;
    bytes: Uint8Array;
}
/** Reads a named stream out of an OLE compound file. Names match by their lower-cased tail. */
export declare function readCompoundStream(bytes: Uint8Array, wanted: string): CompoundStream | undefined;
