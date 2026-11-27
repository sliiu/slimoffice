import type { SheetCell } from "@sliiu/sheet-core";
/** Style fields copied onto a cell. Empty means the cell keeps its value only. */
export type CellLook = Pick<SheetCell, "bold" | "italic" | "underline" | "strike" | "font" | "fontSize" | "color" | "fill" | "numFmt" | "align" | "valign" | "wrap" | "indent" | "border">;
/** The fill, font color, and number format a differential style carries, from one `dxfs` entry. */
export interface DxfLook {
    fill?: string;
    color?: string;
    numFmt?: string;
}
export interface StyleBook {
    looks: CellLook[];
    /** Named style per `cellXfs` index, when the cell uses one. */
    names: (string | undefined)[];
    /** One entry per `dxfs` child, so a `cfRule` can find its fill by `dxfId`. */
    dxfs: DxfLook[];
}
/** One look per `cellXfs` entry. Index 0 is the sheet default and is usually empty. Theme colors resolve against the workbook palette. */
export declare function readCellStyles(stylesXml: string | undefined, themeColors?: string[]): StyleBook;
export declare function hasLook(look: CellLook | undefined): boolean;
