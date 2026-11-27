import type { Worksheet } from "@sliiu/sheet-core";
/** Minimal chart/table/shape fragments written beside sheetData. */
export declare function drawingFragments(sheet: Worksheet, sheetIndex: number, dxfForFormat?: (format: string) => number): {
    sheetExtras: string;
    parts: Map<string, string>;
    contentTypes: string[];
    rels: string[];
    workbookRels: string[];
    pivotCacheRefs: string[];
};
