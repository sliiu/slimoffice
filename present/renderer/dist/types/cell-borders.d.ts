import type { Rect, Stroke, TableCellBorders, TextShape } from "@sliiu/present-core";
export declare function cellHasPerSideBorders(s: TextShape): boolean;
export declare function cellBorderSegments(bbox: Rect, borders: TableCellBorders): Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke: Stroke;
}>;
