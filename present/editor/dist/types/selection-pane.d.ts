import type { CommandStack, Slide } from "@sliiu/present-core";
import type { Selection } from "./selection.js";
export interface SelectionPaneHandle {
    el: HTMLElement;
    refresh(): void;
    destroy(): void;
}
export declare function mountSelectionPane(opts: {
    doc: Document;
    getSlide: () => Slide | undefined;
    currentSlide: () => number;
    selection: Selection;
    stack: CommandStack;
    onSelectShape: (id: string) => void;
}): SelectionPaneHandle;
