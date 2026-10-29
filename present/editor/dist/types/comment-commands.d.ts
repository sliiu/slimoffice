import type { DeckComment, Presentation } from "@sliiu/present-core";
import type { EditCommand } from "@sliiu/present-core";
export declare function genCommentId(): string;
/** 收集批注及其所有后代 id（用于级联删除）。 */
export declare function commentSubtreeIds(comments: DeckComment[] | undefined, rootId: string): Set<string>;
export declare class AddCommentCmd implements EditCommand {
    private readonly comment;
    readonly label: string;
    constructor(comment: DeckComment);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class EditCommentCmd implements EditCommand {
    private readonly commentId;
    private readonly nextText;
    private readonly prevText;
    readonly label: string;
    constructor(commentId: string, nextText: string, prevText: string);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class ResolveCommentCmd implements EditCommand {
    private readonly commentId;
    private readonly resolved;
    private readonly prevResolved;
    readonly label: string;
    constructor(commentId: string, resolved: boolean, prevResolved: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class SetCommentAnchorCmd implements EditCommand {
    private readonly commentId;
    private readonly next;
    private readonly prev;
    readonly label = "Move comment pin";
    constructor(commentId: string, next: {
        x: number;
        y: number;
    }, prev: {
        x?: number;
        y?: number;
    });
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class ResolveSlideCommentsCmd implements EditCommand {
    private readonly slideIndex;
    private readonly resolved;
    readonly label: string;
    private snapshots;
    constructor(slideIndex: number, resolved: boolean);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
export declare class DeleteCommentCmd implements EditCommand {
    private readonly commentId;
    readonly label = "Delete comment";
    private readonly snapshots;
    constructor(commentId: string, snapshot: DeckComment, allComments?: DeckComment[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
