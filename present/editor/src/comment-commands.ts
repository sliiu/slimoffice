import type { DeckComment, Presentation } from "@ppt/core";
import type { EditCommand } from "@ppt/core";

export function genCommentId(): string {
  return `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 收集批注及其所有后代 id（用于级联删除）。 */
export function commentSubtreeIds(comments: DeckComment[] | undefined, rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
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

export class AddCommentCmd implements EditCommand {
  readonly label: string;
  constructor(private readonly comment: DeckComment) {
    this.label = `Add comment on slide ${comment.slideIndex + 1}`;
  }
  apply(pres: Presentation): void {
    if (!pres.comments) pres.comments = [];
    pres.comments.push({ ...this.comment });
  }
  revert(pres: Presentation): void {
    if (!pres.comments) return;
    pres.comments = pres.comments.filter((c) => c.id !== this.comment.id);
    if (!pres.comments.length) pres.comments = undefined;
  }
}

export class EditCommentCmd implements EditCommand {
  readonly label: string;
  constructor(
    private readonly commentId: string,
    private readonly nextText: string,
    private readonly prevText: string,
  ) {
    this.label = "Edit comment";
  }
  apply(pres: Presentation): void {
    const c = pres.comments?.find((x) => x.id === this.commentId);
    if (c) c.text = this.nextText;
  }
  revert(pres: Presentation): void {
    const c = pres.comments?.find((x) => x.id === this.commentId);
    if (c) c.text = this.prevText;
  }
}

export class ResolveCommentCmd implements EditCommand {
  readonly label: string;
  constructor(
    private readonly commentId: string,
    private readonly resolved: boolean,
    private readonly prevResolved: boolean,
  ) {
    this.label = resolved ? "Resolve comment" : "Reopen comment";
  }
  apply(pres: Presentation): void {
    const c = pres.comments?.find((x) => x.id === this.commentId);
    if (c) c.resolved = this.resolved;
  }
  revert(pres: Presentation): void {
    const c = pres.comments?.find((x) => x.id === this.commentId);
    if (c) c.resolved = this.prevResolved;
  }
}

export class SetCommentAnchorCmd implements EditCommand {
  readonly label = "Move comment pin";
  constructor(
    private readonly commentId: string,
    private readonly next: { x: number; y: number },
    private readonly prev: { x?: number; y?: number },
  ) {}
  apply(pres: Presentation): void {
    const c = pres.comments?.find((x) => x.id === this.commentId);
    if (!c) return;
    c.x = this.next.x;
    c.y = this.next.y;
  }
  revert(pres: Presentation): void {
    const c = pres.comments?.find((x) => x.id === this.commentId);
    if (!c) return;
    if (this.prev.x === undefined) delete c.x;
    else c.x = this.prev.x;
    if (this.prev.y === undefined) delete c.y;
    else c.y = this.prev.y;
  }
}

export class ResolveSlideCommentsCmd implements EditCommand {
  readonly label: string;
  private snapshots: Array<{ id: string; prevResolved: boolean }> = [];

  constructor(
    private readonly slideIndex: number,
    private readonly resolved: boolean,
  ) {
    this.label = resolved ? "Resolve all comments on slide" : "Reopen all comments on slide";
  }

  apply(pres: Presentation): void {
    this.snapshots = [];
    for (const c of pres.comments ?? []) {
      if (c.slideIndex !== this.slideIndex) continue;
      const prev = !!c.resolved;
      if (prev === this.resolved) continue;
      this.snapshots.push({ id: c.id, prevResolved: prev });
      c.resolved = this.resolved;
    }
  }

  revert(pres: Presentation): void {
    for (const s of this.snapshots) {
      const c = pres.comments?.find((x) => x.id === s.id);
      if (c) c.resolved = s.prevResolved;
    }
  }
}

export class DeleteCommentCmd implements EditCommand {
  readonly label = "Delete comment";
  private readonly snapshots: DeckComment[];

  constructor(
    private readonly commentId: string,
    snapshot: DeckComment,
    allComments?: DeckComment[],
  ) {
    const ids = commentSubtreeIds(allComments, commentId);
    this.snapshots = (allComments ?? [snapshot])
      .filter((c) => ids.has(c.id))
      .map((c) => ({ ...c }));
    if (!this.snapshots.some((c) => c.id === commentId)) {
      this.snapshots.unshift({ ...snapshot });
    }
  }

  apply(pres: Presentation): void {
    if (!pres.comments) return;
    const ids = new Set(this.snapshots.map((c) => c.id));
    pres.comments = pres.comments.filter((c) => !ids.has(c.id));
    if (!pres.comments.length) pres.comments = undefined;
  }

  revert(pres: Presentation): void {
    if (!pres.comments) pres.comments = [];
    for (const c of this.snapshots) pres.comments.push({ ...c });
  }
}
