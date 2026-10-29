"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMetaTagFromArchive = loadMetaTagFromArchive;
exports.loadCommentMetaFromArchive = loadCommentMetaFromArchive;
exports.loadCommentAuthors = loadCommentAuthors;
exports.loadSlideComments = loadSlideComments;
exports.linkImportedCommentThreads = linkImportedCommentThreads;
const core_1 = require("@sliiu/present-core");
const fflate_1 = require("fflate");
const parts_1 = require("./parts");
const xml_1 = require("./xml");
const units_1 = require("./units");
const slide_like_1 = require("./slide-like");
const modern_comments_1 = require("./modern-comments");
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
function loadMetaTagFromArchive(archive, presRels, tagName) {
    const path = (0, slide_like_1.followFirstRelByType)(presRels, TYPE_TAGS);
    if (!path)
        return undefined;
    const bytes = archive.files.get(path);
    if (!bytes)
        return undefined;
    const xml = (0, fflate_1.strFromU8)(bytes);
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
function loadCommentMetaFromArchive(archive, presRels) {
    return loadMetaTagFromArchive(archive, presRels, core_1.COMMENT_META_TAG);
}
const TYPE_COMMENT_AUTHORS = "/commentAuthors";
const TYPE_COMMENTS = "/comments";
function loadCommentAuthors(archive, presRels) {
    const path = (0, slide_like_1.followFirstRelByType)(presRels, TYPE_COMMENT_AUTHORS);
    const byId = new Map();
    if (!path)
        return { byId };
    const xml = (0, parts_1.loadXmlPart)(archive, path);
    if (!xml)
        return { byId };
    const lst = (0, xml_1.findByLocalName)(xml, "cmAuthorLst");
    for (const node of (0, xml_1.findAllByLocalName)(lst, "cmAuthor")) {
        const id = Number((0, xml_1.attr)(node, "id"));
        const name = (0, xml_1.attr)(node, "name");
        if (Number.isFinite(id) && name)
            byId.set(id, name);
    }
    return { byId };
}
function loadSlideComments(archive, slideRels, authors, slideIndex, modernAuthors) {
    const modern = (0, modern_comments_1.loadModernSlideComments)(archive, slideRels, modernAuthors ?? { byId: new Map() }, slideIndex);
    if (modern.comments.length || modern.commentsModern)
        return modern;
    const commentsPartPath = (0, slide_like_1.followFirstRelByType)(slideRels, TYPE_COMMENTS);
    if (!commentsPartPath)
        return { comments: [] };
    const xml = (0, parts_1.loadXmlPart)(archive, commentsPartPath);
    if (!xml)
        return { comments: [], commentsPartPath };
    const lst = (0, xml_1.findByLocalName)(xml, "cmLst");
    const comments = [];
    for (const node of (0, xml_1.findAllByLocalName)(lst, "cm")) {
        const authorId = Number((0, xml_1.attr)(node, "authorId"));
        const idx = Number((0, xml_1.attr)(node, "idx"));
        const dt = (0, xml_1.attr)(node, "dt");
        const pos = (0, xml_1.findByLocalName)(node, "pos");
        const textNode = (0, xml_1.findByLocalName)(node, "text");
        const text = textNode ? String(textNode["#text"] ?? "").trim() : "";
        if (!text)
            continue;
        const x = pos ? (0, units_1.emuToPx)((0, xml_1.attr)(pos, "x") ?? "0") : undefined;
        const y = pos ? (0, units_1.emuToPx)((0, xml_1.attr)(pos, "y") ?? "0") : undefined;
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
function linkImportedCommentThreads(comments) {
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
