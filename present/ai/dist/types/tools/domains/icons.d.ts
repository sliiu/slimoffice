/** Every lucide id in the shipped build, kebab-case, curated ids first. */
export declare function allIconIds(): string[];
export declare function searchIconIds(query: string, limit?: number): string[];
export declare const iconTools: (import("../index.js").ToolDef<{
    query: string;
    limit?: number | undefined;
}> | import("../index.js").ToolDef<{
    slideIdx: number;
    icon: string;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    color?: string | undefined;
    strokeWidth?: number | undefined;
    name?: string | undefined;
}> | import("../index.js").ToolDef<{
    slideIdx: number;
    shapeId: string;
    icon: string;
    color?: string | undefined;
}>)[];
