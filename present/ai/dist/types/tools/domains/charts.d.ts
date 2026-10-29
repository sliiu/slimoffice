export declare const chartTools: (import("...js").ToolDef<{
    slideIdx: number;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    type: "area" | "bar" | "bubble" | "column" | "doughnut" | "line" | "pie" | "radar" | "scatter" | "stock" | "surface";
    title?: string | undefined;
    legend?: boolean | undefined;
    colors?: string[] | undefined;
    showValues?: boolean | undefined;
    categories?: string[] | undefined;
    series?: {
        name?: string | undefined;
        values: number[];
        color?: string | undefined;
    }[] | undefined;
    scatterPoints?: {
        name?: string | undefined;
        points: {
            x: number;
            y: number;
        }[];
        color?: string | undefined;
    }[] | undefined;
    stacked?: boolean | undefined;
    smooth?: boolean | undefined;
    markers?: boolean | undefined;
    holeRatio?: number | undefined;
    dataLabels?: {
        showVal?: boolean | undefined;
        showCatName?: boolean | undefined;
        showSerName?: boolean | undefined;
        showPercent?: boolean | undefined;
        position?: string | undefined;
        numFmt?: string | undefined;
    } | undefined;
    name?: string | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeId: string;
    categories?: string[] | undefined;
    series?: {
        name?: string | undefined;
        values: number[];
        color?: string | undefined;
    }[] | undefined;
    scatterPoints?: {
        name?: string | undefined;
        points: {
            x: number;
            y: number;
        }[];
        color?: string | undefined;
    }[] | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeId: string;
    title?: string | undefined;
    legend?: boolean | undefined;
    colors?: string[] | undefined;
    showValues?: boolean | undefined;
    varyColors?: boolean | undefined;
    dataLabels?: {
        showVal?: boolean | undefined;
        showCatName?: boolean | undefined;
        showSerName?: boolean | undefined;
        showPercent?: boolean | undefined;
        position?: string | undefined;
        numFmt?: string | undefined;
    } | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeId: string;
    type: "area" | "bar" | "bubble" | "column" | "doughnut" | "line" | "pie" | "radar" | "scatter" | "stock" | "surface";
    stacked?: boolean | undefined;
    smooth?: boolean | undefined;
    markers?: boolean | undefined;
    holeRatio?: number | undefined;
}>)[];
