"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blankDocument = void 0;
exports.writeDocx = writeDocx;
const document_core_1 = require("@sliiu/document-core");
const fflate_1 = require("fflate");
const body_1 = require("./body");
var blank_1 = require("./blank");
Object.defineProperty(exports, "blankDocument", { enumerable: true, get: function () { return blank_1.blankDocument; } });
const RELS = "word/_rels/document.xml.rels";
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const CONTENT_TYPES = "[Content_Types].xml";
const IMAGE_MIME = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    tif: "image/tiff",
    tiff: "image/tiff",
    emf: "image/x-emf",
    wmf: "image/x-wmf",
};
/**
 * Writes the document. An edited story replaces word/document.xml, one section at a time;
 * every other original part goes back unchanged, plus a relationship for each new link.
 */
function writeDocx(document) {
    if (!document.source || document.source.size === 0) {
        throw new Error("This document has no original parts to write back");
    }
    const files = {};
    for (const [path, bytes] of document.source)
        files[path] = bytes;
    const story = document.source.get("word/document.xml");
    if (document.edited && story) {
        const relationships = readRelationships(document.source.get(RELS));
        const pictures = pictureRelationships(document, relationships);
        const edited = (0, body_1.applyDocumentEdits)(withBackground((0, fflate_1.strFromU8)(story), document), document, relationships);
        files["word/document.xml"] = (0, fflate_1.strToU8)(edited.xml);
        const added = [...edited.added, ...pictures.added];
        if (added.length)
            files[RELS] = (0, fflate_1.strToU8)(addRelationships((0, fflate_1.strFromU8)(files[RELS] ?? new Uint8Array()), added));
        if (pictures.types.length)
            files[CONTENT_TYPES] = (0, fflate_1.strToU8)(addContentTypes((0, fflate_1.strFromU8)(files[CONTENT_TYPES] ?? new Uint8Array()), pictures.types));
    }
    return (0, fflate_1.zipSync)(files);
}
/** A picture inserted after the file was opened keeps its bytes in the package but has no relationship yet. */
function pictureRelationships(document, relationships) {
    const known = new Set(relationships.map((item) => item.id));
    const added = [];
    const types = [];
    const seen = new Set();
    for (const section of document.sections) {
        for (const block of section.blocks) {
            if ((0, document_core_1.isDocTable)(block))
                continue;
            for (const run of block.runs) {
                if (!run.image || known.has(run.image) || seen.has(run.image))
                    continue;
                const stored = storedPicture(document, run.image);
                if (!stored)
                    continue;
                seen.add(run.image);
                added.push({ id: run.image, type: IMAGE_REL, target: stored.target, external: false });
                types.push(stored.extension);
            }
        }
    }
    return { added, types };
}
function storedPicture(document, id) {
    const source = document.source;
    if (!source)
        return undefined;
    const prefix = `word/media/${id}.`;
    for (const path of source.keys()) {
        if (!path.startsWith(prefix))
            continue;
        const extension = path.slice(prefix.length).toLowerCase();
        if (!IMAGE_MIME[extension])
            continue;
        return { target: path.slice("word/".length), extension };
    }
    return undefined;
}
/** Page color lives on w:background, one per document, not inside a section. */
function withBackground(xml, document) {
    const color = document.sections.find((section) => section.page.background)?.page.background;
    const stripped = xml.replace(/<w:background\b[^>]*\/>/gi, "").replace(/<w:background\b[\s\S]*?<\/w:background>/gi, "");
    if (!color)
        return stripped;
    const element = `<w:background w:color="${color.replace(/^#/, "")}"/>`;
    return stripped.replace(/<w:body\b/i, `${element}<w:body`);
}
function readRelationships(bytes) {
    if (!bytes)
        return [];
    const xml = (0, fflate_1.strFromU8)(bytes);
    const found = [];
    for (const match of xml.matchAll(/<Relationship\b([^>]*)\/>/gi)) {
        const attrs = match[1] ?? "";
        const id = attribute(attrs, "Id");
        const type = attribute(attrs, "Type");
        const target = attribute(attrs, "Target");
        if (!id || !type || !target)
            continue;
        found.push({ id, type, target, external: /TargetMode="External"/i.test(attrs) });
    }
    return found;
}
function attribute(source, name) {
    const match = new RegExp(`${name}="([^"]*)"`, "i").exec(source);
    return match ? match[1] : undefined;
}
function addRelationships(xml, added) {
    const rows = added
        .map((item) => `<Relationship Id="${escapeAttr(item.id)}" Type="${escapeAttr(item.type)}" Target="${escapeAttr(item.target)}"${item.external ? ` TargetMode="External"` : ""}/>`)
        .join("");
    if (/<\/Relationships>/i.test(xml))
        return xml.replace(/<\/Relationships>/i, `${rows}</Relationships>`);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}">${rows}</Relationships>`;
}
/** Registers a default content type for each new picture extension that the package does not already name. */
function addContentTypes(xml, extensions) {
    const fresh = extensions.filter((extension) => !new RegExp(`Extension="${extension}"`, "i").test(xml));
    if (!fresh.length)
        return xml;
    const rows = [...new Set(fresh)]
        .map((extension) => `<Default Extension="${extension}" ContentType="${IMAGE_MIME[extension]}"/>`)
        .join("");
    if (/<\/Types>/i.test(xml))
        return xml.replace(/<\/Types>/i, `${rows}</Types>`);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${rows}</Types>`;
}
function escapeAttr(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
