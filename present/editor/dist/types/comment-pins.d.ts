import type { DeckComment } from "@sliiu/present-core";
export declare function defaultCommentAnchor(size: {
    width: number;
    height: number;
}, ordinalOnSlide: number): {
    x: number;
    y: number;
};
export interface CommentPinsHandle {
    refresh(): void;
    destroy(): void;
}
export declare function mountCommentPins(opts: {
    stage: HTMLElement;
    slideW: number;
    slideH: number;
    getComments: () => DeckComment[];
    getSlideIndex: () => number;
    getVisible?: () => boolean;
    getSelectedId?: () => string | null;
    screenToStage: (clientX: number, clientY: number) => {
        x: number;
        y: number;
    };
    onSelect?: (commentId: string) => void;
    onMove?: (commentId: string, x: number, y: number) => void;
}): CommentPinsHandle;
