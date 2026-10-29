import type { TextShape } from "@sliiu/present-core";
export declare function scaleTextShapeForAutofit(s: TextShape, scale: number): TextShape;
/**
 * normAutofit 文本溢出时返回缩小后的派生 shape；不溢出（或非 normAutofit）原样返回。
 * measureTotalH 由调用方注入（svg / canvas 后端的段落排版逻辑不同但签名一致）。
 */
export declare function autofitTextShape(s: TextShape, innerH: number, measureTotalH: (shape: TextShape) => number): TextShape;
