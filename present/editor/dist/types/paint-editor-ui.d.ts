import type { Paint } from "@sliiu/present-core";
export type PaintKindUi = "none" | "solid" | "linear" | "radial" | "image" | "pattern";
export interface PaintEditorConfig {
    getPaint: () => Paint | undefined;
    apply: (next: Paint | undefined) => void;
    modes: PaintKindUi[];
    fallbackSolid: string;
    /** 首次选图写入的默认 alpha；幻灯片背景用 0.55，形状填充用 1（省略）。 */
    newImageAlpha?: number;
    onTypeChange?: () => void;
    /** 取色 / 数字连续输入的起止，调用方据此收成一步撤销。 */
    onGestureStart?: () => void;
    onGestureEnd?: () => void;
    /** 纯色色块与另一侧同槽控件在拖动中互相同步。 */
    liveSlot?: string;
}
/** 共享填充/背景 paint 编辑器 UI（inspector + Format Background 对话框复用）。 */
export declare function appendPaintEditor(doc: Document, wrap: HTMLElement, cfg: PaintEditorConfig): void;
