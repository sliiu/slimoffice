import type { Paint, Shape, Slide, TextShape } from "@sliiu/present-core";
/** 工具返回里省略 data: / 超长 URL，避免下一轮请求体爆炸。 */
export declare function elideUrlForSummary(src: string): string;
export declare function paintSummary(p: Paint | undefined): {
    kind: string;
    color?: string;
    alpha?: number;
    src?: string;
    fit?: string;
} | undefined;
export declare function textStyleSummary(t: TextShape): {
    color?: string;
    fontSize?: number;
    fontWeight?: number | string;
    italic?: boolean;
};
export declare function findShapeDeep(slide: Slide, id: string): Shape | undefined;
export declare function shapeSummary(s: Shape, depth?: number): Record<string, unknown>;
export declare function slideSummary(slide: Slide, idx: number): Record<string, unknown>;
