import type { SheetCell } from "@sliiu/sheet-core";
/** Style fields copied onto a cell. Empty means the cell keeps its value only. */
export type CellLook = Pick<SheetCell, "bold" | "italic" | "underline" | "strike" | "font" | "fontSize" | "color" | "fill" | "numFmt" | "align" | "valign" | "wrap" | "indent" | "border">;
export interface StyleBook {
    looks: CellLook[];
    /** Named style per `cellXfs` index, when the cell uses one. */
    names: (string | undefined)[];
}
/** One look per `cellXfs` entry. Index 0 is the sheet default and is usually empty. Theme colors resolve against the workbook palette. */
export declare function readCellStyles(stylesXml: string | undefined, themeColors?: string[]): StyleBook;
export declare function hasLook(look: CellLook | undefined): boolean;
