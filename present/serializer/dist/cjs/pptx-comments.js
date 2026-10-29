"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CT_COMMENT_AUTHORS = exports.CT_COMMENTS = exports.REL_TYPE_COMMENT_AUTHORS = exports.REL_TYPE_COMMENTS = void 0;
exports.exportableComments = exportableComments;
exports.slideCommentsForExport = slideCommentsForExport;
exports.commentsSnapshotForSlide = commentsSnapshotForSlide;
exports.buildCommentAuthors = buildCommentAuthors;
exports.renderCommentAuthorsXml = renderCommentAuthorsXml;
exports.renderCommentsXml = renderCommentsXml;
const xml_util_1 = require("./xml-util");
exports.REL_TYPE_COMMENTS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
exports.REL_TYPE_COMMENT_AUTHORS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/commentAuthors";
exports.CT_COMMENTS = "application/vnd.openxmlformats-officedocument.presentationml.comments+xml";
exports.CT_COMMENT_AUTHORS = "application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml";
const PML = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
function authorInitials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length)
        return "?";
    return parts
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2);
}
/** 导出到 OOXML 时跳过已解决批注（classic cmLst 无 resolved 字段）。 */
function exportableComments(comments) {
    return (comments ?? []).filter((c) => !c.resolved);
}
function slideCommentsForExport(comments, slideIndex, modern) {
    const list = modern ? (comments ?? []) : exportableComments(comments);
    return list.filter((c) => c.slideIndex === slideIndex);
}
function commentsSnapshotForSlide(comments, slideIndex, modern) {
    return JSON.stringify(slideCommentsForExport(comments, slideIndex, !!modern));
}
function buildCommentAuthors(comments) {
    const order = [];
    const counts = new Map();
    for (const c of comments) {
        if (!counts.has(c.author)) {
            order.push(c.author);
            counts.set(c.author, 0);
        }
        counts.set(c.author, (counts.get(c.author) ?? 0) + 1);
    }
    const authorIdByName = new Map();
    const authors = order.map((name, id) => {
        authorIdByName.set(name, id);
        return { id, name, lastIdx: counts.get(name) ?? 0 };
    });
    return { authors, authorIdByName };
}
function renderCommentAuthorsXml(authors) {
    const rows = authors
        .map((a) => `<p:cmAuthor id="${a.id}" name="${(0, xml_util_1.esc)(a.name)}" initials="${(0, xml_util_1.esc)(authorInitials(a.name))}" lastIdx="${a.lastIdx}"/>`)
        .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:cmAuthorLst ${PML}>${rows}</p:cmAuthorLst>`;
}
function renderCommentsXml(comments, authorIdByName, slideSize) {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const anchorFor = (c) => {
        if (c.x != null && c.y != null)
            return { x: c.x, y: c.y };
        if (c.parentId) {
            const parent = byId.get(c.parentId);
            if (parent)
                return anchorFor(parent);
        }
        return { x: slideSize.width * 0.08, y: slideSize.height * 0.12 };
    };
    const perAuthorIdx = new Map();
    const cms = comments.map((c) => {
        const authorId = authorIdByName.get(c.author) ?? 0;
        const idx = (perAuthorIdx.get(c.author) ?? 0) + 1;
        perAuthorIdx.set(c.author, idx);
        const anchor = anchorFor(c);
        const x = (0, xml_util_1.pxToEmu)(anchor.x);
        const y = (0, xml_util_1.pxToEmu)(anchor.y);
        const dt = new Date(c.createdAt).toISOString();
        return `<p:cm authorId="${authorId}" dt="${(0, xml_util_1.esc)(dt)}" idx="${idx}"><p:pos x="${x}" y="${y}"/><p:text>${(0, xml_util_1.esc)(c.text)}</p:text></p:cm>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:cmLst ${PML}>${cms.join("")}</p:cmLst>`;
}
