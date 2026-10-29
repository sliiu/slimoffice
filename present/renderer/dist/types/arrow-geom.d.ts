import type { ArrowKind } from "@sliiu/present-core";
export declare function arrowSize(spec: {
    w?: "sm" | "med" | "lg";
    len?: "sm" | "med" | "lg";
}): {
    w: number;
    l: number;
};
export declare function arrowPathD(kind: ArrowKind, w: number, l: number, side: "start" | "end"): string;
export declare function arrowRefX(kind: ArrowKind, side: "start" | "end", l: number): number;
