import type { Model3DShape } from "@sliiu/present-core";
export declare function model3DDisplaySrc(s: Model3DShape, onReady?: () => void): string | undefined;
export declare function drawModel3DCanvas(ctx: CanvasRenderingContext2D, s: Model3DShape, onReady?: () => void): void;
export declare function renderModel3DSvg(container: SVGGElement, s: Model3DShape, onReady?: () => void): void;
