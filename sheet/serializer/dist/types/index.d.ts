import type { Workbook } from "@sliiu/sheet-core";
/** Writes the original parts back. Nothing is rebuilt, so an unread part stays byte for byte. */
export declare function writeXlsx(workbook: Workbook): Uint8Array;
