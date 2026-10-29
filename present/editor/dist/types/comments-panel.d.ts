import type { CommandStack, DeckComment, Presentation } from "@sliiu/present-core";
import { buildCommentThreadForest, collectThreadComments, countThreadReplies } from "./comment-threads.js";
/** 批注卡片上的交办状态。宿主在跑的时候改它，不打开助手。 */
export interface CommentAssignUi {
    /** 卡片上写「处理中」，停止时调用 stop。 */
    running(stop: () => void): void;
    /** 助手正忙，这条没有发送。 */
    busy(): void;
    /** 没改成。留在卡片上，刷新页面后消失。 */
    failed(): void;
    /** 处理中结束：改成了，或已经停下。 */
    clear(): void;
}
export interface CommentsPanelHandle {
    refresh(): void;
    destroy(): void;
    scrollToComment(commentId: string): void;
    syncSelectionHighlight(): void;
    /** 这条批注刚提交且正文里有 @ai。 */
    noteAssign(commentId: string): void;
}
export declare function mountCommentsPanel(host: HTMLElement, opts: {
    pres: Presentation;
    stack: CommandStack;
    getSlideIndex: () => number;
    getAuthor: () => string;
    getSelectedId?: () => string | null;
    onJumpToSlide: (idx: number) => void;
    onNewComment?: () => void;
    onSelect?: (commentId: string, silent?: boolean) => void;
    onFocusShape?: (slideIndex: number, shapeId: string) => void;
    /** 提交的正文里带 @ai 时，把这条批注交给宿主。状态写回这张卡片。 */
    onAssignAi?: (comment: DeckComment, ui: CommentAssignUi) => void;
}): CommentsPanelHandle;
export { buildCommentThreadForest, collectThreadComments, countThreadReplies };
