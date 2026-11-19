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
const HIGHLIGHTS = {
    yellow: "#ffff00",
    green: "#00ff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    blue: "#0000ff",
    red: "#ff0000",
    darkBlue: "#00008b",
    darkCyan: "#008b8b",
    darkGreen: "#006400",
    darkMagenta: "#8b008b",
    darkRed: "#8b0000",
    darkYellow: "#808000",
    darkGray: "#a9a9a9",
    lightGray: "#d3d3d3",
    black: "#000000",
};
const UNDERLINES = new Set(["single", "double", "dotted", "dash", "wave"]);
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
    const context = { archive, rels: relationships(archive), numbering: numberingTable(archive) };
    const background = colorOf(root ? (0, xml_1.child)(root, "background") : undefined);
    const sections = sectionsFrom(body, context);
    if (background) {
        for (const section of sections)
            section.page.background = background;
    }
    return {
        sections,
        ...(Object.keys(context.numbering).length ? { numbering: context.numbering } : {}),
        source: archive.files,
    };
}
function sectionsFrom(body, context) {
    const sections = [];
    let blocks = [];
    for (const item of (0, xml_1.ordered)(body)) {
        if (item.name === "p") {
            const props = (0, xml_1.child)(item.node, "pPr");
            const section = props ? (0, xml_1.child)(props, "sectPr") : undefined;
            blocks.push(paragraphFrom(item.node, context));
            if (section) {
                sections.push(sectionFrom(section, blocks, context));
                blocks = [];
            }
        }
        else if (item.name === "tbl") {
            blocks.push(tableFrom(item.node, context));
        }
        else if (item.name === "sectPr") {
            sections.push(sectionFrom(item.node, blocks, context));
            blocks = [];
        }
    }
    if (blocks.length)
        sections.push({ page: { ...document_core_1.DEFAULT_PAGE }, header: [], footer: [], blocks });
    return sections.length ? sections : [{ page: { ...document_core_1.DEFAULT_PAGE }, header: [], footer: [], blocks: [] }];
}
function sectionFrom(node, blocks, context) {
    return {
        page: pageFrom(node),
        header: storyFrom(context, node, "headerReference", "hdr"),
        footer: storyFrom(context, node, "footerReference", "ftr"),
        blocks,
    };
}
function pageFrom(node) {
    const size = (0, xml_1.child)(node, "pgSz");
    const margin = (0, xml_1.child)(node, "pgMar");
    const columns = (0, xml_1.child)(node, "cols");
    const number = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    const width = number(size ? (0, xml_1.attr)(size, "w") : undefined, document_core_1.DEFAULT_PAGE.width);
    const height = number(size ? (0, xml_1.attr)(size, "h") : undefined, document_core_1.DEFAULT_PAGE.height);
    const orient = size ? (0, xml_1.attr)(size, "orient") : undefined;
    const count = Number(columns ? (0, xml_1.attr)(columns, "num") : undefined);
    return {
        width,
        height,
        ...(orient === "landscape" || (orient !== "portrait" && width > height) ? { landscape: true } : {}),
        margin: {
            top: number(margin ? (0, xml_1.attr)(margin, "top") : undefined, document_core_1.DEFAULT_PAGE.margin.top),
            bottom: number(margin ? (0, xml_1.attr)(margin, "bottom") : undefined, document_core_1.DEFAULT_PAGE.margin.bottom),
            left: number(margin ? (0, xml_1.attr)(margin, "left") : undefined, document_core_1.DEFAULT_PAGE.margin.left),
            right: number(margin ? (0, xml_1.attr)(margin, "right") : undefined, document_core_1.DEFAULT_PAGE.margin.right),
        },
        ...(Number.isFinite(count) && count > 1 ? { columns: count } : {}),
    };
}
function storyFrom(context, section, refName, rootName) {
    const ref = (0, xml_1.children)(section, refName)[0];
    const id = ref ? (0, xml_1.attr)(ref, "id") : undefined;
    if (!id)
        return [];
    const target = context.rels.get(id);
    if (!target)
        return [];
    const xml = context.archive.getText(partPath(target));
    if (!xml)
        return [];
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), rootName);
    return (0, xml_1.children)(root, "p").map((node) => paragraphFrom(node, context));
}
function partPath(target) {
    const clean = target.replace(/^\.?\.\//, "");
    return clean.startsWith("word/") ? clean : `word/${clean}`;
}
function relationships(archive) {
    const map = new Map();
    const xml = archive.getText("word/_rels/document.xml.rels");
    if (!xml)
        return map;
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), "Relationships");
    for (const item of (0, xml_1.children)(root, "Relationship")) {
        const id = (0, xml_1.attr)(item, "Id");
        const target = (0, xml_1.attr)(item, "Target");
        if (id && target)
            map.set(id, target);
    }
    return map;
}
function numberingTable(archive) {
    const xml = archive.getText("word/numbering.xml");
    if (!xml)
        return {};
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), "numbering");
    if (!root)
        return {};
    const abstracts = new Map();
    for (const item of (0, xml_1.children)(root, "abstractNum")) {
        const id = (0, xml_1.attr)(item, "abstractNumId");
        if (!id)
            continue;
        const levels = [];
        for (const level of (0, xml_1.children)(item, "lvl")) {
            const index = Number((0, xml_1.attr)(level, "ilvl") ?? "0");
            const textNode = (0, xml_1.child)(level, "lvlText");
            const value = textNode ? (0, xml_1.attr)(textNode, "val") ?? "" : "";
            const bullet = value && !value.includes("%") ? value : undefined;
            levels[Number.isFinite(index) ? index : 0] = { text: value, ...(bullet ? { bullet } : {}) };
        }
        abstracts.set(id, levels);
    }
    const table = {};
    for (const item of (0, xml_1.children)(root, "num")) {
        const id = (0, xml_1.attr)(item, "numId");
        const ref = (0, xml_1.child)(item, "abstractNumId");
        const abstractId = ref ? (0, xml_1.attr)(ref, "val") : undefined;
        if (id && abstractId && abstracts.has(abstractId))
            table[id] = abstracts.get(abstractId);
    }
    return table;
}
function paragraphFrom(node, context) {
    const props = (0, xml_1.child)(node, "pPr");
    const paragraph = { runs: [] };
    if (props)
        applyParagraphProps(paragraph, props, context);
    let link;
    let bookmark;
    for (const item of (0, xml_1.ordered)(node)) {
        if (item.name === "r")
            paragraph.runs.push(...runsFrom(item.node, context, link, bookmark));
        else if (item.name === "hyperlink") {
            const id = (0, xml_1.attr)(item.node, "id");
            const anchor = (0, xml_1.attr)(item.node, "anchor");
            const target = id ? context.rels.get(id) : anchor ? `#${anchor}` : undefined;
            const previous = link;
            link = target ?? link;
            for (const inner of (0, xml_1.ordered)(item.node)) {
                if (inner.name === "r")
                    paragraph.runs.push(...runsFrom(inner.node, context, link, bookmark));
            }
            link = previous;
        }
        else if (item.name === "bookmarkStart") {
            bookmark = (0, xml_1.attr)(item.node, "name");
        }
    }
    return paragraph;
}
function applyParagraphProps(paragraph, props, context) {
    const style = (0, xml_1.child)(props, "pStyle");
    const styleName = style ? (0, xml_1.attr)(style, "val") : undefined;
    if (styleName)
        paragraph.style = styleName;
    const align = (0, xml_1.child)(props, "jc");
    const value = align ? (0, xml_1.attr)(align, "val") : undefined;
    if (value === "center" || value === "right" || value === "both" || value === "left") {
        paragraph.align = value;
    }
    const numbering = (0, xml_1.child)(props, "numPr");
    if (numbering) {
        const id = (0, xml_1.child)(numbering, "numId");
        const level = (0, xml_1.child)(numbering, "ilvl");
        const numId = id ? (0, xml_1.attr)(id, "val") : undefined;
        if (numId && numId !== "0") {
            paragraph.numbering = { id: numId, level: Number(level ? (0, xml_1.attr)(level, "val") : "0") || 0 };
        }
    }
    const spacing = spacingFrom((0, xml_1.child)(props, "spacing"));
    if (spacing)
        paragraph.spacing = spacing;
    const indent = indentFrom((0, xml_1.child)(props, "ind"));
    if (indent)
        paragraph.indent = indent;
    const shading = colorOf((0, xml_1.child)(props, "shd"));
    if (shading)
        paragraph.shading = shading;
    if ((0, xml_1.child)(props, "pageBreakBefore"))
        paragraph.pageBreakBefore = true;
}
function spacingFrom(node) {
    if (!node)
        return undefined;
    const spacing = {};
    const before = positive((0, xml_1.attr)(node, "before"));
    const after = positive((0, xml_1.attr)(node, "after"));
    const line = positive((0, xml_1.attr)(node, "line"));
    if (before !== undefined)
        spacing.before = before;
    if (after !== undefined)
        spacing.after = after;
    if (line !== undefined) {
        spacing.line = line;
        const rule = (0, xml_1.attr)(node, "lineRule");
        if (rule === "exact" || rule === "atLeast" || rule === "auto")
            spacing.lineRule = rule;
    }
    return Object.keys(spacing).length ? spacing : undefined;
}
function indentFrom(node) {
    if (!node)
        return undefined;
    const indent = {};
    const left = positive((0, xml_1.attr)(node, "left") ?? (0, xml_1.attr)(node, "start"));
    const right = positive((0, xml_1.attr)(node, "right") ?? (0, xml_1.attr)(node, "end"));
    const first = positive((0, xml_1.attr)(node, "firstLine"));
    const hanging = positive((0, xml_1.attr)(node, "hanging"));
    if (left !== undefined)
        indent.left = left;
    if (right !== undefined)
        indent.right = right;
    if (first !== undefined)
        indent.firstLine = first;
    if (hanging !== undefined)
        indent.hanging = hanging;
    return Object.keys(indent).length ? indent : undefined;
}
function runsFrom(node, context, link, bookmark) {
    const shared = runProps((0, xml_1.child)(node, "rPr"));
    if (link)
        shared.link = link;
    const runs = [];
    let pending = {};
    let usedBookmark = false;
    for (const item of (0, xml_1.ordered)(node)) {
        if (item.name === "br") {
            const kind = (0, xml_1.attr)(item.node, "type");
            pending.breakBefore = kind === "page" ? "page" : kind === "column" ? "column" : "line";
        }
        else if (item.name === "tab" || item.name === "ptab") {
            pending.tabBefore = true;
        }
        else if (item.name === "t") {
            const value = (0, xml_1.text)(item.node);
            if (value || pending.breakBefore || pending.tabBefore) {
                runs.push(runWith(shared, value, pending, !usedBookmark ? bookmark : undefined));
                usedBookmark = true;
                pending = {};
            }
        }
        else if (item.name === "drawing") {
            const image = imageFrom(item.node, context);
            if (image) {
                runs.push({ ...shared, text: "", ...image, ...pending, ...(!usedBookmark && bookmark ? { bookmark } : {}) });
                usedBookmark = true;
                pending = {};
            }
        }
        else if (item.name === "sym") {
            const char = (0, xml_1.attr)(item.node, "char");
            const code = char ? Number.parseInt(char, 16) : NaN;
            if (Number.isFinite(code)) {
                runs.push(runWith(shared, String.fromCodePoint(code), pending, !usedBookmark ? bookmark : undefined));
                usedBookmark = true;
                pending = {};
            }
        }
    }
    return runs;
}
function runWith(shared, value, pending, bookmark) {
    return {
        ...shared,
        text: value,
        ...(pending.breakBefore ? { breakBefore: pending.breakBefore } : {}),
        ...(pending.tabBefore ? { tabBefore: true } : {}),
        ...(bookmark ? { bookmark } : {}),
    };
}
function runProps(props) {
    if (!props)
        return {};
    const shared = {};
    if (on((0, xml_1.child)(props, "b")))
        shared.bold = true;
    if (on((0, xml_1.child)(props, "i")))
        shared.italic = true;
    const underline = (0, xml_1.child)(props, "u");
    if (underline) {
        const value = (0, xml_1.attr)(underline, "val");
        if (value && value !== "none")
            shared.underline = UNDERLINES.has(value) ? value : "single";
    }
    if (on((0, xml_1.child)(props, "strike")) || on((0, xml_1.child)(props, "dstrike")))
        shared.strike = true;
    const vert = (0, xml_1.child)(props, "vertAlign");
    const vertValue = vert ? (0, xml_1.attr)(vert, "val") : undefined;
    if (vertValue === "superscript" || vertValue === "subscript")
        shared.vertAlign = vertValue;
    const highlight = (0, xml_1.child)(props, "highlight");
    const highlightName = highlight ? (0, xml_1.attr)(highlight, "val") : undefined;
    if (highlightName && HIGHLIGHTS[highlightName])
        shared.highlight = HIGHLIGHTS[highlightName];
    const size = (0, xml_1.child)(props, "sz");
    const halfPoints = Number(size ? (0, xml_1.attr)(size, "val") : undefined);
    if (Number.isFinite(halfPoints) && halfPoints > 0)
        shared.fontSize = halfPoints / 2;
    const fonts = (0, xml_1.child)(props, "rFonts");
    const font = fonts ? (0, xml_1.attr)(fonts, "ascii") ?? (0, xml_1.attr)(fonts, "hAnsi") ?? (0, xml_1.attr)(fonts, "eastAsia") : undefined;
    if (font)
        shared.font = font;
    const color = colorOf((0, xml_1.child)(props, "color"));
    if (color)
        shared.color = color;
    return shared;
}
/** A toggle element is on unless its val is "0", "false", or "off". */
function on(node) {
    if (!node)
        return false;
    const value = (0, xml_1.attr)(node, "val");
    return value !== "0" && value !== "false" && value !== "off";
}
function colorOf(node) {
    if (!node)
        return undefined;
    const hex = (0, xml_1.attr)(node, "color") ?? (0, xml_1.attr)(node, "val") ?? (0, xml_1.attr)(node, "fill");
    if (!hex || hex === "auto" || !/^[0-9a-fA-F]{6}$/.test(hex))
        return undefined;
    return `#${hex.toLowerCase()}`;
}
function positive(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
function imageFrom(drawing, context) {
    const inline = (0, xml_1.child)(drawing, "inline") ?? (0, xml_1.child)(drawing, "anchor");
    const graphic = inline ? (0, xml_1.child)(inline, "graphic") : undefined;
    const data = graphic ? (0, xml_1.child)(graphic, "graphicData") : undefined;
    const picture = data ? (0, xml_1.child)(data, "pic") : undefined;
    const fill = picture ? (0, xml_1.child)(picture, "blipFill") : undefined;
    const blip = fill ? (0, xml_1.child)(fill, "blip") : undefined;
    const id = blip ? (0, xml_1.attr)(blip, "embed") : undefined;
    if (!id)
        return undefined;
    const target = context.rels.get(id);
    const result = { image: id };
    if (target) {
        const bytes = context.archive.files.get(partPath(target));
        if (bytes) {
            result.imageBytes = bytes;
            result.imageType = imageType(target);
        }
    }
    return result;
}
function imageType(path) {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "jpg" || ext === "jpeg")
        return "image/jpeg";
    if (ext === "gif")
        return "image/gif";
    if (ext === "webp")
        return "image/webp";
    if (ext === "svg")
        return "image/svg+xml";
    return "image/png";
}
function tableFrom(node, context) {
    return {
        rows: (0, xml_1.children)(node, "tr").map((row) => (0, xml_1.children)(row, "tc").map((cell) => cellFrom(cell, context))),
    };
}
function cellFrom(node, context) {
    const props = (0, xml_1.child)(node, "tcPr");
    const cell = { paragraphs: (0, xml_1.children)(node, "p").map((item) => paragraphFrom(item, context)) };
    const span = props ? (0, xml_1.child)(props, "gridSpan") : undefined;
    const spanValue = Number(span ? (0, xml_1.attr)(span, "val") : undefined);
    if (Number.isFinite(spanValue) && spanValue > 1)
        cell.span = spanValue;
    const merge = props ? (0, xml_1.child)(props, "vMerge") : undefined;
    if (merge) {
        const value = (0, xml_1.attr)(merge, "val");
        cell.vMerge = value === "restart" ? "restart" : "continue";
    }
    const shading = colorOf(props ? (0, xml_1.child)(props, "shd") : undefined);
    if (shading)
        cell.shading = shading;
    return cell;
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
