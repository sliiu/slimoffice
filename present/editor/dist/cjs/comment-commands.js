"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteCommentCmd = exports.ResolveSlideCommentsCmd = exports.SetCommentAnchorCmd = exports.ResolveCommentCmd = exports.EditCommentCmd = exports.AddCommentCmd = void 0;
exports.genCommentId = genCommentId;
exports.commentSubtreeIds = commentSubtreeIds;
function genCommentId() {
    return `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
/** 收集批注及其所有后代 id（用于级联删除）。 */
function commentSubtreeIds(comments, rootId) {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const c of comments ?? []) {
            if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
                ids.add(c.id);
                changed = true;
            }
        }
    }
    return ids;
}
class AddCommentCmd {
    comment;
    label;
    constructor(comment) {
        this.comment = comment;
        this.label = `Add comment on slide ${comment.slideIndex + 1}`;
    }
    apply(pres) {
        if (!pres.comments)
            pres.comments = [];
        pres.comments.push({ ...this.comment });
    }
    revert(pres) {
        if (!pres.comments)
            return;
        pres.comments = pres.comments.filter((c) => c.id !== this.comment.id);
        if (!pres.comments.length)
            pres.comments = undefined;
    }
}
exports.AddCommentCmd = AddCommentCmd;
class EditCommentCmd {
    commentId;
    nextText;
    prevText;
    label;
    constructor(commentId, nextText, prevText) {
        this.commentId = commentId;
        this.nextText = nextText;
        this.prevText = prevText;
        this.label = "Edit comment";
    }
    apply(pres) {
        const c = pres.comments?.find((x) => x.id === this.commentId);
        if (c)
            c.text = this.nextText;
    }
    revert(pres) {
        const c = pres.comments?.find((x) => x.id === this.commentId);
        if (c)
            c.text = this.prevText;
    }
}
exports.EditCommentCmd = EditCommentCmd;
class ResolveCommentCmd {
    commentId;
    resolved;
    prevResolved;
    label;
    constructor(commentId, resolved, prevResolved) {
        this.commentId = commentId;
        this.resolved = resolved;
        this.prevResolved = prevResolved;
        this.label = resolved ? "Resolve comment" : "Reopen comment";
    }
    apply(pres) {
        const c = pres.comments?.find((x) => x.id === this.commentId);
        if (c)
            c.resolved = this.resolved;
    }
    revert(pres) {
        const c = pres.comments?.find((x) => x.id === this.commentId);
        if (c)
            c.resolved = this.prevResolved;
    }
}
exports.ResolveCommentCmd = ResolveCommentCmd;
class SetCommentAnchorCmd {
    commentId;
    next;
    prev;
    label = "Move comment pin";
    constructor(commentId, next, prev) {
        this.commentId = commentId;
        this.next = next;
        this.prev = prev;
    }
    apply(pres) {
        const c = pres.comments?.find((x) => x.id === this.commentId);
        if (!c)
            return;
        c.x = this.next.x;
        c.y = this.next.y;
    }
    revert(pres) {
        const c = pres.comments?.find((x) => x.id === this.commentId);
        if (!c)
            return;
        if (this.prev.x === undefined)
            delete c.x;
        else
            c.x = this.prev.x;
        if (this.prev.y === undefined)
            delete c.y;
        else
            c.y = this.prev.y;
    }
}
exports.SetCommentAnchorCmd = SetCommentAnchorCmd;
class ResolveSlideCommentsCmd {
    slideIndex;
    resolved;
    label;
    snapshots = [];
    constructor(slideIndex, resolved) {
        this.slideIndex = slideIndex;
        this.resolved = resolved;
        this.label = resolved ? "Resolve all comments on slide" : "Reopen all comments on slide";
    }
    apply(pres) {
        this.snapshots = [];
        for (const c of pres.comments ?? []) {
            if (c.slideIndex !== this.slideIndex)
                continue;
            const prev = !!c.resolved;
            if (prev === this.resolved)
                continue;
            this.snapshots.push({ id: c.id, prevResolved: prev });
            c.resolved = this.resolved;
        }
    }
    revert(pres) {
        for (const s of this.snapshots) {
            const c = pres.comments?.find((x) => x.id === s.id);
            if (c)
                c.resolved = s.prevResolved;
        }
    }
}
exports.ResolveSlideCommentsCmd = ResolveSlideCommentsCmd;
class DeleteCommentCmd {
    commentId;
    label = "Delete comment";
    snapshots;
    constructor(commentId, snapshot, allComments) {
        this.commentId = commentId;
        const ids = commentSubtreeIds(allComments, commentId);
        this.snapshots = (allComments ?? [snapshot])
            .filter((c) => ids.has(c.id))
            .map((c) => ({ ...c }));
        if (!this.snapshots.some((c) => c.id === commentId)) {
            this.snapshots.unshift({ ...snapshot });
        }
    }
    apply(pres) {
        if (!pres.comments)
            return;
        const ids = new Set(this.snapshots.map((c) => c.id));
        pres.comments = pres.comments.filter((c) => !ids.has(c.id));
        if (!pres.comments.length)
            pres.comments = undefined;
    }
    revert(pres) {
        if (!pres.comments)
            pres.comments = [];
        for (const c of this.snapshots)
            pres.comments.push({ ...c });
    }
}
exports.DeleteCommentCmd = DeleteCommentCmd;
