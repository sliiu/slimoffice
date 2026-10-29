import type { Shape, ShapeEffect } from "@sliiu/present-core";
/** 收集 shape 上应写出的效果列表（effects 优先，shadow 兜底）。 */
export declare function collectShapeEffectsForWrite(s: Shape): ShapeEffect[];
/** `<a:effectLst>…</a:effectLst>`；无效果时返回空字符串。 */
export declare function effectsToXml(effects: ShapeEffect[]): string;
