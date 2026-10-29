/** presentation tags part 中 SlimPPT 批注元数据键名。 */
export const COMMENT_META_TAG = "SlimPPT.Comments.v1";
export function commentMetaKey(c) {
    return {
        slideIndex: c.slideIndex,
        author: c.author,
        createdAt: c.createdAt,
        text: c.text,
    };
}
function keysEqual(a, b) {
    return (a.slideIndex === b.slideIndex &&
        a.author === b.author &&
        a.createdAt === b.createdAt &&
        a.text === b.text);
}
function findCommentByKey(comments, key) {
    return comments.find((c) => keysEqual(commentMetaKey(c), key));
}
/** 序列化 resolved / parentId（OOXML classic cmLst 不支持的字段）。 */
export function buildCommentMeta(comments) {
    if (!comments?.length)
        return undefined;
    const byId = new Map(comments.map((c) => [c.id, c]));
    const entries = [];
    for (const c of comments) {
        if (!c.resolved && !c.parentId && !c.shapeId)
            continue;
        const entry = { ...commentMetaKey(c) };
        if (c.resolved)
            entry.resolved = true;
        if (c.shapeId)
            entry.shapeId = c.shapeId;
        if (c.parentId) {
            const parent = byId.get(c.parentId);
            if (parent)
                entry.parent = commentMetaKey(parent);
        }
        entries.push(entry);
    }
    if (!entries.length)
        return undefined;
    const payload = { v: 1, entries };
    return JSON.stringify(payload);
}
/** 从 tags 侧车恢复 resolved / parentId（按稳定键匹配批注；已解决且未写出 cm 的批注会重建）。 */
export function applyCommentMeta(comments, raw) {
    if (!raw?.trim())
        return;
    try {
        const meta = JSON.parse(raw);
        if (meta.v !== 1 || !Array.isArray(meta.entries))
            return;
        for (const e of meta.entries) {
            if (!e.resolved)
                continue;
            if (findCommentByKey(comments, e))
                continue;
            comments.push({
                id: `cmt_meta_${e.slideIndex}_${e.createdAt}`,
                slideIndex: e.slideIndex,
                author: e.author,
                text: e.text,
                createdAt: e.createdAt,
                resolved: true,
                ...(e.shapeId ? { shapeId: e.shapeId } : {}),
            });
        }
        for (const e of meta.entries) {
            const c = findCommentByKey(comments, e);
            if (!c)
                continue;
            if (e.resolved)
                c.resolved = true;
            if (e.shapeId)
                c.shapeId = e.shapeId;
            if (e.parent) {
                const parent = findCommentByKey(comments, e.parent);
                if (parent)
                    c.parentId = parent.id;
            }
        }
    }
    catch {
        // ignore corrupt sidecar
    }
}
