import { esc, pxToEmu } from "./xml-util.js";
export const P188_NS = "http://schemas.microsoft.com/office/powerpoint/2018/8/main";
export const REL_MODERN_COMMENTS = "http://schemas.microsoft.com/office/2018/10/relationships/comments";
export const REL_MODERN_AUTHORS = "http://schemas.microsoft.com/office/2018/10/relationships/authors";
export const CT_MODERN_COMMENTS = "application/vnd.ms-powerpoint.comments+xml";
export const CT_MODERN_AUTHORS = "application/vnd.ms-powerpoint.authors+xml";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
/** Deck uses threaded / resolved comments, or source was Office 2021+ modern format. */
export function shouldUseModernComments(comments, commentsModern) {
    if (commentsModern)
        return true;
    return (comments ?? []).some((c) => Boolean(c.parentId || c.resolved));
}
function stableGuid(seed) {
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        const c = seed.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= c << (i % 8);
        h2 = Math.imul(h2, 0x01000193);
    }
    const a = (h1 >>> 0).toString(16).padStart(8, "0");
    const b = (h2 >>> 0).toString(16).padStart(8, "0");
    return `${a.slice(0, 8)}-${b.slice(0, 4)}-4${b.slice(4, 7)}-a${a.slice(0, 3)}-${b}${a.slice(3, 7)}`.slice(0, 36);
}
export function commentModernId(c) {
    return c.modernId ?? officeGuid(`slimppt-cmt:${c.id}`);
}
function authorModernId(name, existing) {
    const hit = existing?.get(name);
    if (hit)
        return hit;
    return officeGuid(`slimppt-author:${name}`);
}
export function buildModernAuthors(comments, existing) {
    const order = [];
    for (const c of comments) {
        if (!order.includes(c.author))
            order.push(c.author);
    }
    const authorIdByName = new Map();
    const authors = order.map((name) => {
        const id = authorModernId(name, existing);
        authorIdByName.set(name, id);
        return { id, name };
    });
    return { authors, authorIdByName };
}
function officeGuid(seed) {
    return `{${stableGuid(seed).toUpperCase()}}`;
}
function renderTxBody(text) {
    const lines = text.split(/\r?\n/);
    const paras = (lines.length ? lines : [""])
        .map((line) => `<a:p><a:pPr/><a:r><a:rPr lang="en-US"/><a:t xml:space="preserve">${esc(line)}</a:t></a:r></a:p>`)
        .join("");
    // MS-PPTX CT_Comment: text lives in p188:txBody (not a:txBody). WPS / PowerPoint
    // look up that qualified name; a:txBody parses as an unknown child and shows blank.
    return `<p188:txBody><a:bodyPr/><a:lstStyle/>${paras}</p188:txBody>`;
}
function modernStatus(resolved) {
    return resolved ? "resolved" : "active";
}
function renderReply(c, authorIdByName) {
    const authorId = authorIdByName.get(c.author) ?? authorModernId(c.author);
    const id = commentModernId(c);
    const created = new Date(c.createdAt).toISOString();
    const status = modernStatus(c.resolved);
    return `<p188:reply id="${esc(id)}" authorId="${esc(authorId)}" created="${esc(created)}" status="${status}">${renderTxBody(c.text)}</p188:reply>`;
}
export function renderModernAuthorsXml(authors) {
    const rows = authors
        .map((a) => `<p188:author id="${esc(a.id)}" name="${esc(a.name)}" userId="" providerId=""/>`)
        .join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p188:authorLst xmlns:p188="${P188_NS}">${rows}</p188:authorLst>`;
}
/** Office 2021+ comment part: threaded replies in replyLst + status for resolved. */
export function renderModernCommentsXml(comments, authorIdByName, slideSize) {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const roots = comments.filter((c) => !c.parentId);
    const childrenOf = (rootId) => comments
        .filter((c) => {
        let p = c.parentId;
        while (p) {
            if (p === rootId)
                return true;
            p = byId.get(p)?.parentId;
        }
        return false;
    })
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
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
    const cms = roots.map((root) => {
        const authorId = authorIdByName.get(root.author) ?? authorModernId(root.author);
        const id = commentModernId(root);
        const created = new Date(root.createdAt).toISOString();
        const status = modernStatus(root.resolved);
        const anchor = anchorFor(root);
        const x = pxToEmu(anchor.x);
        const y = pxToEmu(anchor.y);
        const replies = childrenOf(root.id);
        const replyXml = replies.length
            ? `<p188:replyLst>${replies.map((r) => renderReply(r, authorIdByName)).join("")}</p188:replyLst>`
            : "";
        return `<p188:cm id="${esc(id)}" authorId="${esc(authorId)}" created="${esc(created)}" status="${status}"><p188:unknownAnchor/><p188:pos x="${x}" y="${y}"/>${replyXml}${renderTxBody(root.text)}</p188:cm>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p188:cmLst xmlns:p188="${P188_NS}" xmlns:a="${A_NS}">${cms.join("")}</p188:cmLst>`;
}
export function isModernCommentsXml(xml) {
    return xml.includes(P188_NS) || xml.includes("powerpoint/2018/8/main");
}
/** Parse author name → GUID from an existing modern authors part. */
export function parseModernAuthorsFromXml(xml) {
    const byName = new Map();
    for (const m of xml.matchAll(/<p188:author[^>]*id="([^"]+)"[^>]*name="([^"]+)"/g)) {
        byName.set(m[2], m[1]);
    }
    return byName;
}
export function isModernCommentsPartPath(partPath) {
    return /\/modernComment\d+\.xml$/i.test(partPath) || partPath.includes("/comments/modern");
}
