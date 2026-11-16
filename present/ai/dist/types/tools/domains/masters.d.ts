export declare const masterTools: (import("../index.js").ToolDef<Record<string, never>> | import("../index.js").ToolDef<{
    shapeId: string;
    patch: {
        bbox?: {
            x: number;
            y: number;
            w: number;
            h: number;
        } | undefined;
        fillColor?: string | undefined;
        textStyle?: {
            fontFamily?: string | undefined;
            fontSize?: number | undefined;
            fontWeight?: number | undefined;
            italic?: boolean | undefined;
            underline?: boolean | undefined;
            color?: string | undefined;
        } | undefined;
    };
}> | import("../index.js").ToolDef<{
    masterId: string;
}>)[];
