import type { DeckComment } from "@ppt/core";

export interface CommentThreadNode {
  comment: DeckComment;
  replies: CommentThreadNode[];
}

/** Build a forest of comment threads (roots only; replies nested by parentId). */
export function buildCommentThreadForest(comments: DeckComment[]): CommentThreadNode[] {
  const byParent = new Map<string, DeckComment[]>();
  for (const c of comments) {
    const key = c.parentId ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const sortByTime = (arr: DeckComment[]) => arr.sort((a, b) => a.createdAt - b.createdAt);
  const walk = (parentKey: string): CommentThreadNode[] =>
    sortByTime(byParent.get(parentKey) ?? []).map((comment) => ({
      comment,
      replies: walk(comment.id),
    }));
  return walk("");
}

export function countThreadReplies(node: CommentThreadNode): number {
  let n = 0;
  const walk = (n0: CommentThreadNode): void => {
    for (const child of n0.replies) {
      n += 1;
      walk(child);
    }
  };
  walk(node);
  return n;
}

export function collectThreadComments(node: CommentThreadNode): DeckComment[] {
  const out: DeckComment[] = [node.comment];
  for (const child of node.replies) out.push(...collectThreadComments(child));
  return out;
}

/** True when every ancestor id is in visibleIds. */
export function isAncestorChainVisible(
  parentId: string | undefined,
  visibleIds: Set<string>,
  byId: Map<string, DeckComment>,
): boolean {
  let cur = parentId;
  while (cur) {
    if (!visibleIds.has(cur)) return false;
    cur = byId.get(cur)?.parentId;
  }
  return true;
}

export function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function authorHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
