import type { PathShape, Rect } from "@sliiu/present-core";
export type InkMode = "pen" | "highlighter" | "eraser";
export interface InkPoint {
    x: number;
    y: number;
}
export declare function isInkShapeId(id: string): boolean;
export declare function pointsToSvgPath(points: readonly InkPoint[]): string;
export declare function bboxFromPoints(points: readonly InkPoint[], pad: number): Rect;
export declare function inkStrokeStyle(mode: "pen" | "highlighter", penColor: string, penWidth: number): {
    color: string;
    alpha: number;
    width: number;
};
export declare function buildInkPathShape(points: readonly InkPoint[], mode: "pen" | "highlighter", penColor?: string, penWidth?: number): PathShape | null;
/** Hit-test ink path shapes (top-most first). */
export declare function hitInkShapeAt(shapes: readonly {
    id: string;
    kind: string;
    bbox: Rect;
    d?: string;
}[], pt: InkPoint, radius: number): string | null;
