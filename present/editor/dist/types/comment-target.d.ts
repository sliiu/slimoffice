import type { Shape, ShapeKind, Slide } from "@sliiu/present-core";
export interface CommentShapeCaption {
    kind: ShapeKind;
    /** 文本框里的正文。有正文时卡片只显示这一行。 */
    text?: string;
    /** 没有正文时用形状名称，前面再加类型。 */
    name?: string;
}
/** 点在形状上时，批注记下的那个形状。装饰层（dec_）不算。 */
export declare function shapeAtPoint(slide: Slide, x: number, y: number): Shape | undefined;
/** 卡片和新建对话框上的那一行：有正文就用正文，否则是「类型 · 名称」。 */
export declare function commentShapeLabel(shape: Shape): string;
/** 卡片上用来认出这个形状的材料：正文优先，否则用名称。 */
export declare function commentShapeCaption(shape: Shape): CommentShapeCaption;
