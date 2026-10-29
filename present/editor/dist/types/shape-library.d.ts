import type { Rect } from "@sliiu/present-core";
export type ShapeCategory = "lines" | "rect" | "basic" | "arrows" | "flowchart" | "starsBanners" | "callouts";
export type ShapeGeom = {
    kind: "rect";
    rx?: number;
    ry?: number;
} | {
    kind: "ellipse";
} | {
    kind: "line";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    arrow?: "none" | "head" | "tail" | "both";
} | {
    kind: "polygon";
    points: Array<[number, number]>;
} | {
    kind: "path";
    d: string;
    fillRule?: "nonzero" | "evenodd";
};
export interface ShapeLibraryEntry {
    id: string;
    category: ShapeCategory;
    labelKey: string;
    fallback: string;
    geom: (bbox: Rect) => ShapeGeom;
    icon: string;
}
export declare const SHAPE_LIBRARY: ShapeLibraryEntry[];
export declare const SHAPE_BY_ID: Record<string, ShapeLibraryEntry>;
export declare const CATEGORY_ORDER: ShapeCategory[];
export declare function entriesByCategory(c: ShapeCategory): ShapeLibraryEntry[];
