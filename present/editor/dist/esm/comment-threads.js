/** Build a forest of comment threads (roots only; replies nested by parentId). */
export function buildCommentThreadForest(comments) {
    const byParent = new Map();
    for (const c of comments) {
        const key = c.parentId ?? "";
        if (!byParent.has(key))
            byParent.set(key, []);
        byParent.get(key).push(c);
    }
    const sortByTime = (arr) => arr.sort((a, b) => a.createdAt - b.createdAt);
    const walk = (parentKey) => sortByTime(byParent.get(parentKey) ?? []).map((comment) => ({
        comment,
        replies: walk(comment.id),
    }));
    return walk("");
}
export function countThreadReplies(node) {
    let n = 0;
    const walk = (n0) => {
        for (const child of n0.replies) {
            n += 1;
            walk(child);
        }
    };
    walk(node);
    return n;
}
export function collectThreadComments(node) {
    const out = [node.comment];
    for (const child of node.replies)
        out.push(...collectThreadComments(child));
    return out;
}
/** True when every ancestor id is in visibleIds. */
export function isAncestorChainVisible(parentId, visibleIds, byId) {
    let cur = parentId;
    while (cur) {
        if (!visibleIds.has(cur))
            return false;
        cur = byId.get(cur)?.parentId;
    }
    return true;
}
export function authorInitials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length)
        return "?";
    if (parts.length === 1)
        return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
export function authorHue(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++)
        h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h % 360;
}
