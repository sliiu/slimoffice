import type { Workbook, Worksheet } from "@sliiu/sheet-core";
import { type StyleBook } from "./styles.js";
/**
 * Puts edited cells back into one worksheet.
 * A formula cell is left untouched until its shown value changes. New text goes to the shared-string table.
 */
export declare function applySheetEdits(sheetXml: string, sheet: Worksheet, shared: SharedStrings, styles: StyleBook): {
    xml: string;
    shared: SharedStrings;
};
export interface SharedStrings {
    items: string[];
    indexOf(value: string): number;
}
export declare function readSharedStrings(xml: string | undefined): SharedStrings;
export declare function writeSharedStrings(shared: SharedStrings): string;
/** Workbook sheet names in file order, from workbook.xml. */
export declare function sheetPaths(workbookXml: string, partNames: string[]): string[];
export declare function applyWorkbookEdits(parts: Map<string, Uint8Array>, workbook: Workbook, decode: (bytes: Uint8Array) => string, encode: (text: string) => Uint8Array): void;
