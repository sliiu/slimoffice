"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocxOpenError = void 0;
exports.parseDocx = parseDocx;
const document_core_1 = require("@sliiu/document-core");
const zip_1 = require("./zip");
const xml_1 = require("./xml");
class DocxOpenError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "DocxOpenError";
    }
}
exports.DocxOpenError = DocxOpenError;
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENCRYPTED = new TextEncoder().encode("EncryptedPackage");
async function parseDocx(input) {
    const bytes = await toBytes(input);
    assertOpenXml(bytes);
    const archive = (0, zip_1.loadArchive)(bytes);
    const xml = archive.getText("word/document.xml");
    if (!xml)
        throw new Error("word/document.xml not found");
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), "document");
    const body = root ? (0, xml_1.child)(root, "body") : undefined;
    if (!body)
        throw new Error("word/document.xml has no body");
    return { sections: sectionsFrom(body, archive), source: archive.files };
}
function sectionsFrom(body, archive) {
    const sections = [];
    let blocks = [];
    for (const item of (0, xml_1.ordered)(body)) {
        if (item.name === "p") {
            const props = (0, xml_1.child)(item.node, "pPr");
            const section = props ? (0, xml_1.child)(props, "sectPr") : undefined;
            blocks.push(paragraphFrom(item.node));
            if (section) {
                sections.push(sectionFrom(section, blocks, archive));
                blocks = [];
            }
        }
        else if (item.name === "tbl") {
            blocks.push(tableFrom(item.node));
        }
        else if (item.name === "sectPr") {
            sections.push(sectionFrom(item.node, blocks, archive));
            blocks = [];
        }
    }
    if (blocks.length)
        sections.push({ page: document_core_1.DEFAULT_PAGE, header: [], footer: [], blocks });
    return sections.length ? sections : [{ page: document_core_1.DEFAULT_PAGE, header: [], footer: [], blocks: [] }];
}
function sectionFrom(node, blocks, archive) {
    return {
        page: pageFrom(node),
        header: storyFrom(archive, node, "headerReference", "hdr"),
        footer: storyFrom(archive, node, "footerReference", "ftr"),
        blocks,
    };
}
function pageFrom(node) {
    const size = (0, xml_1.child)(node, "pgSz");
    const margin = (0, xml_1.child)(node, "pgMar");
    const number = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    return {
        width: number(size ? (0, xml_1.attr)(size, "w") : undefined, document_core_1.DEFAULT_PAGE.width),
        height: number(size ? (0, xml_1.attr)(size, "h") : undefined, document_core_1.DEFAULT_PAGE.height),
        margin: {
            top: number(margin ? (0, xml_1.attr)(margin, "top") : undefined, document_core_1.DEFAULT_PAGE.margin.top),
            bottom: number(margin ? (0, xml_1.attr)(margin, "bottom") : undefined, document_core_1.DEFAULT_PAGE.margin.bottom),
            left: number(margin ? (0, xml_1.attr)(margin, "left") : undefined, document_core_1.DEFAULT_PAGE.margin.left),
            right: number(margin ? (0, xml_1.attr)(margin, "right") : undefined, document_core_1.DEFAULT_PAGE.margin.right),
        },
    };
}
function storyFrom(archive, section, refName, rootName) {
    const ref = (0, xml_1.children)(section, refName)[0];
    const id = ref ? (0, xml_1.attr)(ref, "id") : undefined;
    if (!id)
        return [];
    const target = relationshipTarget(archive, id);
    if (!target)
        return [];
    const xml = archive.getText(`word/${target.replace(/^\.\.?\//, "")}`);
    if (!xml)
        return [];
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), rootName);
    return (0, xml_1.children)(root, "p").map(paragraphFrom);
}
function relationshipTarget(archive, id) {
    const xml = archive.getText("word/_rels/document.xml.rels");
    if (!xml)
        return undefined;
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), "Relationships");
    const match = (0, xml_1.children)(root, "Relationship").find((item) => (0, xml_1.attr)(item, "Id") === id);
    return match ? (0, xml_1.attr)(match, "Target") : undefined;
}
function paragraphFrom(node) {
    const props = (0, xml_1.child)(node, "pPr");
    const style = props ? (0, xml_1.child)(props, "pStyle") : undefined;
    const align = props ? (0, xml_1.child)(props, "jc") : undefined;
    const value = align ? (0, xml_1.attr)(align, "val") : undefined;
    return {
        ...(style && (0, xml_1.attr)(style, "val") ? { style: (0, xml_1.attr)(style, "val") } : {}),
        ...(value === "center" || value === "right" || value === "both" ? { align: value } : {}),
        runs: (0, xml_1.children)(node, "r").flatMap(runsFrom),
    };
}
function runsFrom(node) {
    const props = (0, xml_1.child)(node, "rPr");
    const size = props ? (0, xml_1.child)(props, "sz") : undefined;
    const color = props ? (0, xml_1.child)(props, "color") : undefined;
    const halfPoints = Number(size ? (0, xml_1.attr)(size, "val") : undefined);
    const hex = color ? (0, xml_1.attr)(color, "val") : undefined;
    const shared = {
        ...(props && (0, xml_1.child)(props, "b") ? { bold: true } : {}),
        ...(props && (0, xml_1.child)(props, "i") ? { italic: true } : {}),
        ...(Number.isFinite(halfPoints) && halfPoints > 0 ? { fontSize: halfPoints / 2 } : {}),
        ...(hex && /^[0-9a-fA-F]{6}$/.test(hex) ? { color: `#${hex.toLowerCase()}` } : {}),
    };
    const drawing = (0, xml_1.child)(node, "drawing");
    const image = drawing ? imageFrom(drawing) : undefined;
    const runs = [];
    for (const textNode of (0, xml_1.children)(node, "t")) {
        const value = (0, xml_1.text)(textNode);
        if (value)
            runs.push({ text: value, ...shared });
    }
    if (image)
        runs.push({ text: "", image, ...shared });
    return runs;
}
function imageFrom(drawing) {
    const inline = (0, xml_1.child)(drawing, "inline") ?? (0, xml_1.child)(drawing, "anchor");
    const graphic = inline ? (0, xml_1.child)(inline, "graphic") : undefined;
    const data = graphic ? (0, xml_1.child)(graphic, "graphicData") : undefined;
    const picture = data ? (0, xml_1.child)(data, "pic") : undefined;
    const fill = picture ? (0, xml_1.child)(picture, "blipFill") : undefined;
    const blip = fill ? (0, xml_1.child)(fill, "blip") : undefined;
    return blip ? (0, xml_1.attr)(blip, "embed") : undefined;
}
function tableFrom(node) {
    return {
        rows: (0, xml_1.children)(node, "tr").map((row) => (0, xml_1.children)(row, "tc").map((cell) => (0, xml_1.children)(cell, "p").map(paragraphFrom))),
    };
}
function assertOpenXml(bytes) {
    if (bytes.length < OLE_MAGIC.length)
        return;
    if (!OLE_MAGIC.every((byte, index) => bytes[index] === byte))
        return;
    if (contains(bytes, ENCRYPTED)) {
        throw new DocxOpenError("ENCRYPTED_DOCX", "Password-protected .docx is not supported; remove the password and try again");
    }
    throw new DocxOpenError("LEGACY_DOC", "Legacy .doc (97-2003 binary) is not supported; please open or save as .docx");
}
function contains(bytes, needle) {
    for (let index = 0; index <= bytes.length - needle.length * 2; index += 2) {
        let matched = true;
        for (let offset = 0; offset < needle.length; offset += 1) {
            if (bytes[index + offset * 2] !== needle[offset] || bytes[index + offset * 2 + 1] !== 0) {
                matched = false;
                break;
            }
        }
        if (matched)
            return true;
    }
    return false;
}
async function toBytes(input) {
    if (input instanceof Uint8Array)
        return input;
    if (input instanceof ArrayBuffer)
        return new Uint8Array(input);
    return new Uint8Array(await input.arrayBuffer());
}
