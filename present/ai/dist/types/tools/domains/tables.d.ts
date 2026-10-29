export declare const tableTools: (import("...js").ToolDef<{
    slideIdx: number;
    rows: number;
    cols: number;
    data?: string[][] | undefined;
    bbox?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | undefined;
    headerRow?: boolean | undefined;
    headerFill?: string | undefined;
    headerColor?: string | undefined;
    cellFill?: string | undefined;
    cellColor?: string | undefined;
    borderColor?: string | undefined;
    fontFamily?: string | undefined;
    fontSize?: number | undefined;
    name?: string | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    tableShapeId: string;
    afterRow: number;
}> | import("...js").ToolDef<{
    slideIdx: number;
    tableShapeId: string;
    rowIdx: number;
}> | import("...js").ToolDef<{
    slideIdx: number;
    tableShapeId: string;
    afterCol: number;
}> | import("...js").ToolDef<{
    slideIdx: number;
    tableShapeId: string;
    colIdx: number;
}> | import("...js").ToolDef<{
    slideIdx: number;
    tableShapeId: string;
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}> | import("...js").ToolDef<{
    slideIdx: number;
    tableShapeId: string;
    row: number;
    col: number;
}>)[];
