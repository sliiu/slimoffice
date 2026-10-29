import type { HyperlinkRef, Shape, TextRun } from "@sliiu/present-core";
/**
 * 按与渲染层相同的换行 / 对齐 / 边距，命中文字框内某个 run。
 * 竖排堆叠走列布局；`vert`/`vert270`/`bodyRot` 先把点逆旋转到布局坐标系。
 */
export declare function hitTestTextRunAt(shape: Shape, x: number, y: number): TextRun | undefined;
export declare function runLinkAt(shape: Shape, x: number, y: number, slot: "hyperlink" | "hoverLink"): HyperlinkRef | undefined;
