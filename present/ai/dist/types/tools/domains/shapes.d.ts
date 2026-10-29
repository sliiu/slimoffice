export declare const shapeTools: (import("...js").ToolDef<{
    slideIdx: number;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    text: string;
    fontFamily?: string | undefined;
    fontSize?: number | undefined;
    fontWeight?: number | undefined;
    italic?: boolean | undefined;
    color?: string | undefined;
    align?: "end" | "justify" | "middle" | "start" | undefined;
    vAlign?: "bottom" | "middle" | "top" | undefined;
    fillColor?: string | undefined;
    name?: string | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    preset: string;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    fill?: {
        kind: "solid";
        color: string;
        alpha?: number | undefined;
    } | {
        kind: "linear";
        angle: number;
        stops: {
            offset: number;
            color: string;
            alpha?: number | undefined;
        }[];
    } | {
        kind: "radial";
        stops: {
            offset: number;
            color: string;
            alpha?: number | undefined;
        }[];
    } | {
        kind: "none";
    } | undefined;
    stroke?: {
        color?: string | undefined;
        alpha?: number | undefined;
        width?: number | undefined;
        dashPreset?: "dash" | "dashDot" | "dot" | "lgDash" | "lgDashDot" | "lgDashDotDot" | "solid" | "sysDash" | "sysDashDot" | "sysDashDotDot" | "sysDot" | undefined;
        cap?: "butt" | "round" | "square" | undefined;
        join?: "bevel" | "miter" | "round" | undefined;
        headEnd?: "arrow" | "diamond" | "none" | "oval" | "stealth" | "triangle" | undefined;
        tailEnd?: "arrow" | "diamond" | "none" | "oval" | "stealth" | "triangle" | undefined;
    } | undefined;
    opacity?: number | undefined;
    rotation?: number | undefined;
    name?: string | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color?: string | undefined;
    width?: number | undefined;
    dashPreset?: "dash" | "dashDot" | "dot" | "lgDash" | "lgDashDot" | "lgDashDotDot" | "solid" | "sysDash" | "sysDashDot" | "sysDashDotDot" | "sysDot" | undefined;
    headArrow?: "arrow" | "diamond" | "none" | "oval" | "stealth" | "triangle" | undefined;
    tailArrow?: "arrow" | "diamond" | "none" | "oval" | "stealth" | "triangle" | undefined;
    name?: string | undefined;
}> | import("...js").ToolDef<{
    slideIdx: number;
    src: string;
    bbox?: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | undefined;
    autoplay?: boolean | undefined;
    loop?: boolean | undefined;
    name?: string | undefined;
}> | import("...js").ToolDef<{
    sourceSlideIdx: number;
    sourceShapeId: string;
    targetSlideIdx: number;
    targetShapeId: string;
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeIds: string[];
}> | import("...js").ToolDef<{
    slideIdx: number;
    shapeId: string;
}> | import("...js").ToolDef<{
    category?: "arrows" | "basic" | "callouts" | "flowchart" | "lines" | "rect" | "starsBanners" | undefined;
}>)[];
