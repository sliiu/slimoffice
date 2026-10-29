import { COMMENT_META_TAG } from "@sliiu/present-core";
import { strFromU8 } from "fflate";
import { loadXmlPart } from "./parts.js";
import { findAllByLocalName, findByLocalName, attr } from "./xml.js";
import { emuToPx } from "./units.js";
import { followFirstRelByType } from "./slide-like.js";
import { loadModernSlideComments } from "./modern-comments.js";
const TYPE_TAGS = "/tags";
function unescapeXmlAttr(s) {
    return s
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}
/** 从 presentation tags part 读取指定 SlimPPT 侧车键（绕过超大 tagLst 的常规解析限制）。 */
export function loadMetaTagFromArchive(archive, presRels, tagName) {
    const path = followFirstRelByType(presRels, TYPE_TAGS);
    if (!path)
        return undefined;
    const bytes = archive.files.get(path);
    if (!bytes)
        return undefined;
    const xml = strFromU8(bytes);
    const needle = `name="${tagName}" val="`;
    const i = xml.indexOf(needle);
    if (i < 0)
        return undefined;
    const start = i + needle.length;
    const end = xml.indexOf('"/>', start);
    if (end < 0)
        return undefined;
    return unescapeXmlAttr(xml.slice(start, end));
}
/** 从 presentation tags part 读取 SlimPPT 批注元数据。 */
export function loadCommentMetaFromArchive(archive, presRels) {
    return loadMetaTagFromArchive(archive, presRels, COMMENT_META_TAG);
}
const TYPE_COMMENT_AUTHORS = "/commentAuthors";
const TYPE_COMMENTS = "/comments";
export function loadCommentAuthors(archive, presRels) {
    const path = followFirstRelByType(presRels, TYPE_COMMENT_AUTHORS);
    const byId = new Map();
    if (!path)
        return { byId };
    const xml = loadXmlPart(archive, path);
    if (!xml)
        return { byId };
    const lst = findByLocalName(xml, "cmAuthorLst");
    for (const node of findAllByLocalName(lst, "cmAuthor")) {
        const id = Number(attr(node, "id"));
        const name = attr(node, "name");
        if (Number.isFinite(id) && name)
            byId.set(id, name);
    }
    return { byId };
}
export function loadSlideComments(archive, slideRels, authors, slideIndex, modernAuthors) {
    const modern = loadModernSlideComments(archive, slideRels, modernAuthors ?? { byId: new Map() }, slideIndex);
    if (modern.comments.length || modern.commentsModern)
        return modern;
    const commentsPartPath = followFirstRelByType(slideRels, TYPE_COMMENTS);
    if (!commentsPartPath)
        return { comments: [] };
    const xml = loadXmlPart(archive, commentsPartPath);
    if (!xml)
        return { comments: [], commentsPartPath };
    const lst = findByLocalName(xml, "cmLst");
    const comments = [];
    for (const node of findAllByLocalName(lst, "cm")) {
        const authorId = Number(attr(node, "authorId"));
        const idx = Number(attr(node, "idx"));
        const dt = attr(node, "dt");
        const pos = findByLocalName(node, "pos");
        const textNode = findByLocalName(node, "text");
        const text = textNode ? String(textNode["#text"] ?? "").trim() : "";
        if (!text)
            continue;
        const x = pos ? emuToPx(attr(pos, "x") ?? "0") : undefined;
        const y = pos ? emuToPx(attr(pos, "y") ?? "0") : undefined;
        const author = authors.byId.get(authorId) ?? `Author ${authorId}`;
        const createdAt = dt ? Date.parse(dt) : Date.now();
        comments.push({
            id: `cmt_${slideIndex}_${authorId}_${idx}`,
            slideIndex,
            author,
            text,
            createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
            x,
            y,
        });
    }
    return { comments, commentsPartPath, commentsModern: false };
}
const MAX_REPLY_GAP_MS = 7 * 24 * 60 * 60 * 1000;
const ANCHOR_NEAR_PX = 80;
function anchorsNear(a, b) {
    if (a.x == null || a.y == null || b.x == null || b.y == null)
        return true;
    return Math.hypot(a.x - b.x, a.y - b.y) <= ANCHOR_NEAR_PX;
}
/** 将 classic cmLst 扁平批注按作者 + 锚点邻近 + 时间链重建 parentId 线程。 */
export function linkImportedCommentThreads(comments) {
    const bySlide = new Map();
    for (const c of comments) {
        const list = bySlide.get(c.slideIndex) ?? [];
        list.push(c);
        bySlide.set(c.slideIndex, list);
    }
    for (const list of bySlide.values()) {
        list.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
        let prev;
        for (const c of list) {
            if (prev &&
                prev.author === c.author &&
                c.createdAt - prev.createdAt <= MAX_REPLY_GAP_MS &&
                anchorsNear(prev, c)) {
                c.parentId = prev.id;
            }
            prev = c;
        }
    }
}
