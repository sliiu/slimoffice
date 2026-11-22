import type { SheetCell, Worksheet } from "@sliiu/sheet-core";
export interface StyleBook {
    xml: string;
    indexFor(cell: SheetCell): string | undefined;
}
/** Build or extend styles.xml so edited fonts/fills/numFmts round-trip. */
export declare function styleBook(stylesXml: string | undefined, sheets: Worksheet[]): StyleBook;
export declare function sheetFrameXml(sheet: Worksheet): string;
export declare function autoFilterXml(sheet: Worksheet): string;
export declare function pageSetupXml(sheet: Worksheet): string;
export declare function conditionalFormattingXml(sheet: Worksheet): string;
