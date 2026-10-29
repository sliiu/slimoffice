import type { Rect, Shape, SmartArtItem, SmartArtLayoutKind, TextShape } from "@sliiu/present-core";
export declare function paragraphText(p: TextShape["paragraphs"][number]): string;
/** 从文本框段落提取 SmartArt 条目（保留 level → lvl）。 */
export declare function itemsFromTextShape(text: TextShape): SmartArtItem[];
/** 根据段落层级 / 数量推断默认 SmartArt 版式。 */
export declare function inferSmartArtLayout(text: TextShape): SmartArtLayoutKind;
export declare function convertTextShapeToSmartArt(text: TextShape, layout?: SmartArtLayoutKind): Shape;
export declare function defaultSmartArtItems(layout: SmartArtLayoutKind): SmartArtItem[];
export declare function createSmartArtGroup(opts: {
    id: string;
    layout: SmartArtLayoutKind;
    items: SmartArtItem[];
    bbox: Rect;
}): Shape;
