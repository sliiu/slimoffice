export declare const embedTools: (import("...js").ToolDef<Record<string, never>> | import("...js").ToolDef<{
    slideIdx: number;
    fileName: string;
    embedSrc: string;
    bbox?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | undefined;
    showAsIcon?: boolean | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeId: string;
    fileName: string;
    embedSrc: string;
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeId: string;
    showAsIcon: boolean;
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeId: string;
    glbSrc: string;
    objectName?: string | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    presetId: string;
    objectName?: string | undefined;
    bbox?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    url: string;
    bbox?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | undefined;
    allowFullscreen?: boolean | undefined;
}>)[];
