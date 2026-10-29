import type { OleObjectShape } from "@sliiu/present-core";
/** Full-bleed package preview (not icon mode). */
export declare function oleUsesPackagePreview(s: OleObjectShape): boolean;
/** Canvas / export path: package preview or icon tile + filename. */
export declare function drawOleCanvas(ctx: CanvasRenderingContext2D, s: OleObjectShape): void;
/** SVG preview path — package preview via image / PDF embed, else icon placeholder. */
export declare function renderOleSvg(container: SVGGElement, s: OleObjectShape): void;
