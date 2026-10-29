import type { MessageKey } from "./i18n.js";
export interface ScreenRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
export type FormatSubject = "text" | "shape" | "line" | "image" | "icon" | "table" | "other";
export type LineArrowEnds = "none" | "head" | "tail" | "both";
export type FormatBarMode = {
    kind: "hidden";
} | {
    kind: "text";
} | {
    kind: "shape";
    align: boolean;
    distribute: boolean;
} | {
    kind: "line";
} | {
    kind: "image";
} | {
    kind: "icon";
} | {
    kind: "table";
};
/** 选中对象落到哪一套格式条。单元格是文字；表格是带 tableMeta 的编组。 */
export declare function formatSubject(shape: {
    kind: string;
    descr?: string;
    tableMeta?: unknown;
    smartArtMeta?: unknown;
    cellMeta?: unknown;
}): FormatSubject;
export declare function selectionFormatMode(input: {
    view: string;
    background: boolean;
    dragging: boolean;
    /** 行内文本编辑中。盖过形状类型，先改字。 */
    editingText: boolean;
    subjects: readonly FormatSubject[];
}): FormatBarMode;
/**
 * 按选区在可视画布里还能看见的那一段摆放。优先放在上方；上方出了画布就改到下方。
 * 整条留在画布内，放大后不会盖到缩略图列、顶栏或属性栏。选区完全离开画布则不放。
 * 条比画布宽时贴着画布左缘，避免盖住左侧幻灯片列。
 */
export declare function formatBarPosition(input: {
    anchor: ScreenRect;
    view: ScreenRect;
    bar: {
        w: number;
        h: number;
    };
    viewport: {
        w: number;
        h: number;
    };
    gap?: number;
    margin?: number;
    /** 默认上方；below 时优先下方，下方出了画布再改到上方。 */
    prefer?: "above" | "below";
}): {
    left: number;
    top: number;
} | null;
export interface SelectionFormatView {
    mode: FormatBarMode;
    anchor: ScreenRect | null;
    view: ScreenRect | null;
    viewport: {
        w: number;
        h: number;
    };
    fontSize?: number;
    bold: boolean;
    textColor: string;
    align?: "start" | "middle" | "end" | "justify";
    bullet: boolean;
    fill: string;
    stroke: string;
    strokeWidth: number;
    arrows: LineArrowEnds;
    /** 当前选中可以裁剪。视频、图片填充在自己的格式条上也会露出这颗按钮。 */
    croppable: boolean;
    cropping: boolean;
    /** 当前这一张图片、视频或图标。放大、缩小、旋转、翻转只对这一个。 */
    arrangeable: boolean;
}
export interface SelectionFormatActions {
    label: (key: MessageKey) => string;
    /** 连续输入开始 / 结束，供调用方把一次拖动或一次打字收成一步撤销。 */
    liveStart: () => void;
    liveEnd: () => void;
    applyFontSize: (px: number) => void;
    toggleBold: () => void;
    applyTextColor: (hex: string) => void;
    applyAlign: (align: "start" | "middle") => void;
    toggleBullet: () => void;
    applyFill: (hex: string) => void;
    applyStroke: (hex: string) => void;
    applyStrokeWidth: (px: number) => void;
    applyArrows: (mode: LineArrowEnds) => void;
    replaceImage: () => void;
    replaceIcon: () => void;
    crop: () => void;
    zoom: (factor: number) => void;
    rotateQuarter: () => void;
    flip: (axis: "h" | "v") => void;
    table: (op: "addRow" | "removeRow" | "addCol" | "removeCol") => void;
    align: (mode: "left" | "centerH" | "right" | "top" | "centerV" | "bottom") => void;
    distribute: (axis: "h" | "v") => void;
}
export interface SelectionFormatBar {
    el: HTMLElement;
    sync: (state: SelectionFormatView) => void;
    destroy: () => void;
}
export declare function mountSelectionFormatBar(doc: Document, actions: SelectionFormatActions): SelectionFormatBar;
/** 相对当前外框放大。再点一次按同一比例再变一档。 */
export declare const FORMAT_BAR_ZOOM_IN = 1.1;
/** 相对当前外框缩小。边短于 8 则不再缩。 */
export declare const FORMAT_BAR_ZOOM_OUT = 0.9;
/** 外框按比例变，中心留在原地。缩到比最小边还小则不动。 */
export declare function scaleRectAboutCenter(rect: {
    x: number;
    y: number;
    w: number;
    h: number;
}, factor: number): {
    x: number;
    y: number;
    w: number;
    h: number;
} | null;
