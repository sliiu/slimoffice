export declare const fontTools: (import("../index.js").ToolDef<Record<string, never>> | import("../index.js").ToolDef<{
    families?: string[] | undefined;
    faces?: {
        family: string;
        src: string;
        weight?: number | undefined;
        style?: "italic" | "normal" | undefined;
        format?: "embedded-opentype" | "opentype" | "truetype" | "woff" | "woff2" | undefined;
    }[] | undefined;
    remove?: string[] | undefined;
    usedOnly?: boolean | undefined;
    skipExisting?: boolean | undefined;
    saveSubsetFonts?: boolean | undefined;
}>)[];
