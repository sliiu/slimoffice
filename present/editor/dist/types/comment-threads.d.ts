import type { DeckComment } from "@sliiu/present-core";
export interface CommentThreadNode {
    comment: DeckComment;
    replies: CommentThreadNode[];
}
/** Build a forest of comment threads (roots only; replies nested by parentId). */
export declare function buildCommentThreadForest(comments: DeckComment[]): CommentThreadNode[];
export declare function countThreadReplies(node: CommentThreadNode): number;
export declare function collectThreadComments(node: CommentThreadNode): DeckComment[];
/** True when every ancestor id is in visibleIds. */
export declare function isAncestorChainVisible(parentId: string | undefined, visibleIds: Set<string>, byId: Map<string, DeckComment>): boolean;
export declare function authorInitials(name: string): string;
export declare function authorHue(name: string): number;
