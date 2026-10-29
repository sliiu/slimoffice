import type { Presentation } from "@sliiu/present-core";
export type PresentationViewMode = "normal" | "sorter" | "outline" | "reading" | "notesPage";
export interface PresentationViewHost {
    el: HTMLElement;
    refresh(): void;
    destroy(): void;
    setSpellcheck?: (on: boolean) => void;
}
export declare function mountSlideSorterView(host: HTMLElement, opts: {
    pres: Presentation;
    getCurrentIndex: () => number;
    onSelect: (idx: number) => void;
    onMoveSlide?: (from: number, to: number) => void;
}): PresentationViewHost;
export declare function mountOutlineView(host: HTMLElement, opts: {
    pres: Presentation;
    currentIndex: number;
    onSelect: (idx: number) => void;
}): PresentationViewHost;
/** Notes Page：单页幻灯片缩略图 + 下方可编辑备注（打印备注页布局）。 */
export declare function mountNotesPageView(host: HTMLElement, opts: {
    pres: Presentation;
    /** 编辑器当前页。刷新时读这个，不能用进入备注页时的快照。 */
    getCurrentIndex: () => number;
    spellcheck?: boolean;
    onSelect: (idx: number) => void;
    getNotes: (idx: number) => string;
    onNotesChange: (idx: number, notes: string | undefined) => void;
}): PresentationViewHost;
