import type { CommandStack, Paint, Presentation, Slide } from "@sliiu/present-core";
import { type AlignMode, type EditTarget } from "./commands.js";
import { type Selection } from "./selection.js";
import type { LayoutListEntry } from "./slide-layout-utils.js";
export interface InspectorOptions {
    selection: Selection;
    stack: CommandStack;
    pres: Presentation;
    currentSlide: () => number;
    getActiveSlide?: () => Slide | undefined;
    getBackgroundTarget?: () => EditTarget;
    getMediaEl?: (shapeId: string) => HTMLMediaElement | null;
    listLayouts?: () => LayoutListEntry[];
    applyLayout?: (entry: LayoutListEntry) => void;
    listThemeVariants?: () => Array<{
        id: string;
        label: string;
        swatch: string;
    }>;
    applyThemeVariant?: (id: string) => void;
    openThemeGallery?: () => void;
    bringFront?: () => void;
    sendBack?: () => void;
    bringForward?: () => void;
    sendBackward?: () => void;
    alignSelection?: (mode: AlignMode) => void;
    distributeSelection?: (axis: "h" | "v") => void;
    /** 连续取色时先改画面。返回 true 表示已接手，不要再 execute。 */
    previewFill?: (shapeId: string, paint: Paint | undefined) => boolean;
    previewTextColor?: (shapeId: string, color: string) => boolean;
    /** 松手时把预览收成一条命令。 */
    commitLivePreview?: () => void;
    /** 正在编辑文字且框住了字符时，样式只改这段。 */
    editingTextRanges?: (shapeId: string) => import("./text-char-style.js").TextCharRange[] | undefined;
    /** 属性栏改裁剪前，先结束舞台上还没落库的裁剪。 */
    settleCropSession?: () => void;
}
export interface InspectorHandle {
    el: HTMLDivElement;
    refresh(): void;
    destroy(): void;
}
export declare function mountInspector(parent: HTMLElement, opts: InspectorOptions): InspectorHandle;
