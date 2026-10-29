"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadModernAuthors = loadModernAuthors;
exports.loadModernSlideComments = loadModernSlideComments;
exports.modernAuthorsPartPath = modernAuthorsPartPath;
const parts_1 = require("./parts");
const xml_1 = require("./xml");
const units_1 = require("./units");
const slide_like_1 = require("./slide-like");
const TYPE_MODERN_AUTHORS = "/2018/10/relationships/authors";
const TYPE_MODERN_COMMENTS = "/2018/10/relationships/comments";
function loadModernAuthors(archive, presRels) {
    const path = (0, slide_like_1.followFirstRelByType)(presRels, TYPE_MODERN_AUTHORS);
    const byId = new Map();
    if (!path)
        return { byId };
    const xml = (0, parts_1.loadXmlPart)(archive, path);
    if (!xml)
        return { byId };
    const lst = (0, xml_1.findByLocalName)(xml, "authorLst");
    for (const node of (0, xml_1.findAllByLocalName)(lst, "author")) {
        const id = (0, xml_1.attr)(node, "id");
        const name = (0, xml_1.attr)(node, "name");
        if (id && name)
            byId.set(id, name);
    }
    return { byId };
}
function textFromTxBody(node) {
    const parts = [];
    const walk = (n) => {
        if (!n || typeof n !== "object")
            return;
        const rec = n;
        for (const [k, v] of Object.entries(rec)) {
            if (k === "t" || k.endsWith(":t")) {
                const t = v["#text"] ?? (typeof v === "string" ? v : "");
                if (t)
                    parts.push(t);
            }
            else if (v && typeof v === "object") {
                if (Array.isArray(v))
                    for (const item of v)
                        walk(item);
                else
                    walk(v);
            }
        }
    };
    walk(node);
    return parts.join("\n").trim();
}
function parseModernCommentNode(node, authors, slideIndex, parentId) {
    const out = [];
    const modernId = (0, xml_1.attr)(node, "id");
    const authorId = (0, xml_1.attr)(node, "authorId");
    const created = (0, xml_1.attr)(node, "created");
    const status = (0, xml_1.attr)(node, "status");
    const pos = (0, xml_1.findByLocalName)(node, "pos");
    const txBody = (0, xml_1.findByLocalName)(node, "txBody");
    const text = textFromTxBody(txBody);
    if (!text)
        return out;
    const author = (authorId && authors.byId.get(authorId)) || `Author ${authorId ?? "?"}`;
    const createdAt = created ? Date.parse(created) : Date.now();
    const x = pos ? (0, units_1.emuToPx)((0, xml_1.attr)(pos, "x") ?? "0") : undefined;
    const y = pos ? (0, units_1.emuToPx)((0, xml_1.attr)(pos, "y") ?? "0") : undefined;
    const id = modernId ? `cmt_m_${modernId}` : `cmt_${slideIndex}_${out.length}`;
    const comment = {
        id,
        modernId,
        slideIndex,
        author,
        text,
        createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
        x,
        y,
        parentId,
        resolved: status === "resolved" || status === "closed",
    };
    out.push(comment);
    const replyLst = (0, xml_1.findByLocalName)(node, "replyLst");
    for (const reply of (0, xml_1.findAllByLocalName)(replyLst, "reply")) {
        out.push(...parseModernCommentNode(reply, authors, slideIndex, id));
    }
    return out;
}
function loadModernSlideComments(archive, slideRels, authors, slideIndex) {
    const commentsPartPath = (0, slide_like_1.followFirstRelByType)(slideRels, TYPE_MODERN_COMMENTS);
    if (!commentsPartPath)
        return { comments: [], commentsModern: false };
    const xml = (0, parts_1.loadXmlPart)(archive, commentsPartPath);
    if (!xml)
        return { comments: [], commentsPartPath, commentsModern: true };
    const raw = JSON.stringify(xml);
    if (!raw.includes("powerpoint/2018/8/main") && !raw.includes("authorId")) {
        return { comments: [], commentsPartPath, commentsModern: false };
    }
    const lst = (0, xml_1.findByLocalName)(xml, "cmLst");
    const comments = [];
    for (const node of (0, xml_1.findAllByLocalName)(lst, "cm")) {
        comments.push(...parseModernCommentNode(node, authors, slideIndex));
    }
    return { comments, commentsPartPath, commentsModern: true };
}
function modernAuthorsPartPath(_archive, presRels) {
    return (0, slide_like_1.followFirstRelByType)(presRels, TYPE_MODERN_AUTHORS);
}
