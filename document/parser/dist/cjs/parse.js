"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocxOpenError = void 0;
exports.parseDocx = parseDocx;
const document_core_1 = require("@sliiu/document-core");
const zip_1 = require("./zip.js");
const xml_1 = require("./xml.js");
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
/** Paragraph switches the model keeps so a rewrite does not drop them. */
const PARAGRAPH_MARKS = ["suppressLineNumbers", "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "contextualSpacing", "mirrorIndents", "suppressOverlap"];
/** Run switches the model keeps so a rewrite does not drop them. */
const RUN_MARKS = ["bCs", "iCs", "outline", "shadow", "emboss", "imprint", "effect"];
/** Paragraph elements kept as markup, written back unchanged. */
const PARAGRAPH_KEPT = ["framePr", "textDirection", "textAlignment", "textboxTightWrap", "divId", "cnfStyle"];
/** Run elements kept as markup, written back unchanged. */
const RUN_KEPT = ["szCs", "bdr", "shd", "fitText", "eastAsianLayout"];
/** The original markup of the named children, so a rewrite can put them back. */
function keptXml(props, names) {
    return (0, xml_1.ordered)(props)
        .filter((item) => names.includes(item.name))
        .map((item) => (0, xml_1.serialize)(item.name, item.node));
}
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
    const context = { archive, rels: relationships(archive), numbering: numberingTable(archive), styles: styleTable(archive) };
    const background = colorOf(root ? (0, xml_1.child)(root, "background") : undefined);
    const sections = sectionsFrom(body, context, xml);
    if (background) {
        for (const section of sections)
            section.page.background = background;
    }
    const sources = bibliography(archive);
    const recipients = mailRecipients(archive);
    const comments = commentsFrom(archive);
    const notes = notesFrom(archive, context);
    attachNotes(sections, notes);
    const hyphenation = hyphenates(archive);
    const readOnly = locked(archive);
    const media = mediaFiles(archive);
    return {
        sections,
        ...(Object.keys(context.numbering).length ? { numbering: context.numbering } : {}),
        ...(Object.keys(context.styles).length ? { styles: context.styles } : {}),
        ...(sources.length ? { sources } : {}),
        ...(recipients.length ? { recipients } : {}),
        ...(comments.length ? { comments } : {}),
        ...(hyphenation ? { hyphenation: true } : {}),
        ...(readOnly ? { readOnly: true } : {}),
        ...(media.size ? { media } : {}),
        source: archive.files,
    };
}
/** Every part under word/media/, pictures the story never shows included. */
function mediaFiles(archive) {
    const media = new Map();
    for (const [path, bytes] of archive.files) {
        if (path.startsWith("word/media/"))
            media.set(path, bytes);
    }
    return media;
}
/** settings.xml marks the document read only. */
function locked(archive) {
    const xml = archive.getText("word/settings.xml");
    if (!xml)
        return false;
    return /<(?:w:)?documentProtection\b[^>]*\bw:edit="readOnly"/i.test(xml);
}
/** settings.xml asks the document to hyphenate words at line ends. */
function hyphenates(archive) {
    const xml = archive.getText("word/settings.xml");
    if (!xml)
        return false;
    return /<(?:w:)?autoHyphenation\b[^>]*\bw:val="(?:true|1)"/i.test(xml) || /<(?:w:)?autoHyphenation\s*\/>/i.test(xml);
}
/** The body of each footnote and endnote, keyed by id, so a reference in the story can show it. */
function notesFrom(archive, context) {
    const found = new Map();
    const read = (path, kind, root, ref) => {
        const xml = archive.getText(path);
        if (!xml)
            return;
        const body = (0, xml_1.child)((0, xml_1.parseXml)(xml), root);
        if (!body)
            return;
        for (const item of (0, xml_1.children)(body, kind)) {
            const id = (0, xml_1.attr)(item, "id");
            const type = (0, xml_1.attr)(item, "type");
            if (!id || type === "separator" || type === "continuationSeparator")
                continue;
            const paragraph = paragraphFrom((0, xml_1.children)(item, "p")[0] ?? item, context);
            paragraph.runs = paragraph.runs.filter((run) => !run.raw?.includes(`${ref}`));
            paragraph.note = { kind, id };
            found.set(`${kind}:${id}`, paragraph);
        }
    };
    read("word/footnotes.xml", "footnote", "footnotes", "footnoteRef");
    read("word/endnotes.xml", "endnote", "endnotes", "endnoteRef");
    return found;
}
/** Puts each note's body right after the paragraph that references it, so the page can show it. */
function attachNotes(sections, notes) {
    if (!notes.size)
        return;
    for (const section of sections) {
        const blocks = [];
        for (const block of section.blocks) {
            blocks.push(block);
            if (!(0, document_core_1.isDocParagraph)(block))
                continue;
            for (const run of block.runs) {
                const id = noteId(run.raw);
                const note = id ? notes.get(id) : undefined;
                if (note)
                    blocks.push(note);
            }
        }
        section.blocks = blocks;
    }
}
/** The text inside a block, joined across its nested elements. */
/** A formula laid out as pieces: a fraction stacks, a script shifts, a radical roots, and the rest stays text. */
function formulaOf(node) {
    const pieces = [];
    let words = "";
    const flush = () => {
        if (words)
            pieces.push({ text: words });
        words = "";
    };
    for (const item of (0, xml_1.ordered)(node)) {
        const name = item.name.includes(":") ? item.name.slice(item.name.indexOf(":") + 1) : item.name;
        if (name === "f") {
            flush();
            pieces.push({ kind: "frac", top: formulaOf((0, xml_1.child)(item.node, "num") ?? {}), bottom: formulaOf((0, xml_1.child)(item.node, "den") ?? {}) });
        }
        else if (name === "sSup" || name === "sSub") {
            flush();
            pieces.push({ kind: name === "sSup" ? "sup" : "sub", base: formulaOf((0, xml_1.child)(item.node, "e") ?? {}), script: formulaOf((0, xml_1.child)(item.node, name === "sSup" ? "sup" : "sub") ?? {}) });
        }
        else if (name === "rad") {
            flush();
            pieces.push({ kind: "root", body: formulaOf((0, xml_1.child)(item.node, "e") ?? {}), degree: formulaOf((0, xml_1.child)(item.node, "deg") ?? {}) });
        }
        else if (name === "t") {
            words += (0, xml_1.text)(item.node);
        }
        else {
            const inner = formulaOf(item.node);
            for (const piece of inner) {
                if ("text" in piece)
                    words += piece.text;
                else {
                    flush();
                    pieces.push(piece);
                }
            }
        }
    }
    flush();
    return pieces;
}
function visibleText(node) {
    const own = (0, xml_1.text)(node);
    const nested = (0, xml_1.ordered)(node).map((item) => visibleText(item.node)).join("");
    return `${own}${nested}`;
}
function noteId(raw) {
    if (!raw)
        return undefined;
    const match = /<(?:w:)?(footnote|endnote)Reference\b[^>]*\bw:id="(\d+)"/i.exec(raw);
    return match ? `${match[1].toLowerCase()}:${match[2]}` : undefined;
}
/** Reads customXml/itemN.xml for a bibliography or a mail-merge recipient list. Anything else is left alone. */
function bibliography(archive) {
    const xml = customXml(archive, "b:sources") ?? customXml(archive, "sources");
    if (!xml)
        return [];
    const root = (0, xml_1.ordered)((0, xml_1.parseXml)(xml)).find((item) => item.name === "sources" || item.name.endsWith(":sources"));
    if (!root)
        return [];
    const found = [];
    for (const item of (0, xml_1.ordered)(root.node)) {
        if (item.name !== "source" && !item.name.endsWith(":source"))
            continue;
        const tag = textOf(item.node, "tag");
        const title = textOf(item.node, "title");
        if (!tag || !title)
            continue;
        const authors = authorText(item.node);
        found.push({
            tag,
            type: textOf(item.node, "sourceType") || "book",
            authors: authors || tag,
            title,
            year: textOf(item.node, "year") || "",
            ...(textOf(item.node, "publisher") ? { publisher: textOf(item.node, "publisher") } : {}),
        });
    }
    return found;
}
function authorText(node) {
    const names = [];
    const walk = (current) => {
        for (const item of (0, xml_1.ordered)(current)) {
            if (item.name === "nameList" || item.name.endsWith(":nameList") || item.name === "author" || item.name.endsWith(":author") || item.name === "person" || item.name.endsWith(":person")) {
                walk(item.node);
            }
            else if (item.name === "last" || item.name.endsWith(":last") || item.name === "first" || item.name.endsWith(":first")) {
                const value = (0, xml_1.text)(item.node).trim();
                if (value)
                    names.push(value);
            }
        }
    };
    walk(node);
    const people = [];
    for (let index = 0; index < names.length; index += 2)
        people.push(names.slice(index, index + 2).join(" "));
    return people.join(", ");
}
/** A recipient list stored as rows of named columns in a custom XML part. */
function mailRecipients(archive) {
    const xml = customXml(archive, "recipients");
    if (!xml)
        return [];
    const root = (0, xml_1.ordered)((0, xml_1.parseXml)(xml)).find((item) => item.name === "recipients" || item.name.endsWith(":recipients"));
    if (!root)
        return [];
    const found = [];
    for (const item of (0, xml_1.ordered)(root.node)) {
        if (item.name !== "recipient" && !item.name.endsWith(":recipient"))
            continue;
        const fields = {};
        for (const column of (0, xml_1.ordered)(item.node)) {
            const value = (0, xml_1.text)(column.node).trim();
            if (value)
                fields[column.name.includes(":") ? column.name.slice(column.name.indexOf(":") + 1) : column.name] = value;
        }
        if (Object.keys(fields).length)
            found.push({ fields });
    }
    return found;
}
function customXml(archive, rootName) {
    for (const [path, bytes] of archive.files) {
        if (!/^customXml\/item\d+\.xml$/i.test(path))
            continue;
        const xml = new TextDecoder().decode(bytes);
        if (new RegExp(`<(?:[\\w-]+:)?${rootName}\\b`).test(xml))
            return xml;
    }
    return undefined;
}
function textOf(node, name) {
    for (const item of (0, xml_1.ordered)(node)) {
        const local = item.name.includes(":") ? item.name.slice(item.name.indexOf(":") + 1) : item.name;
        if (local === name)
            return (0, xml_1.text)(item.node).trim();
        const nested = textOf(item.node, name);
        if (nested)
            return nested;
    }
    return "";
}
/** Body-level markup the model does not edit, kept so rewriting the story does not drop it. */
const KEPT_BLOCKS = new Set(["sdt", "oMath", "oMathPara", "customXml", "altChunk"]);
function sectionsFrom(body, context, source = "") {
    const sections = [];
    let blocks = [];
    const verbatim = source ? (0, xml_1.keptBody)(source) : [];
    const openField = { instruction: [], result: [], started: false, open: false };
    for (const [index, item] of (0, xml_1.ordered)(body).entries()) {
        if (item.name === "p") {
            const props = (0, xml_1.child)(item.node, "pPr");
            const section = props ? (0, xml_1.child)(props, "sectPr") : undefined;
            blocks.push(paragraphFrom(item.node, context, verbatim, index, openField));
            if (section) {
                sections.push(sectionFrom(section, blocks, context));
                blocks = [];
            }
        }
        else if (item.name === "tbl") {
            blocks.push(tableFrom(item.node, context));
        }
        else if (KEPT_BLOCKS.has(item.name)) {
            const original = verbatim[index];
            const raw = original ? (0, xml_1.serialize)(original.name, original.node) : (0, xml_1.serialize)(item.name, item.node);
            const visible = visibleText(item.node).trim();
            const formula = item.name === "oMath" || item.name === "oMathPara" ? formulaOf(item.node) : undefined;
            blocks.push({ raw, ...(visible ? { text: visible } : {}), ...(formula?.length ? { formula } : {}) });
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
    const header = storyFrom(context, node, "headerReference", "hdr");
    const footer = storyFrom(context, node, "footerReference", "ftr");
    const first = storyFrom(context, node, "headerReference", "hdr", "first");
    const even = storyFrom(context, node, "headerReference", "hdr", "even");
    const firstFooter = storyFrom(context, node, "footerReference", "ftr", "first");
    const evenFooter = storyFrom(context, node, "footerReference", "ftr", "even");
    return {
        page: pageFrom(node),
        header: header.paragraphs,
        footer: footer.paragraphs,
        ...(header.part ? { headerPart: header.part } : {}),
        ...(footer.part ? { footerPart: footer.part } : {}),
        ...(first.paragraphs.length ? { firstHeader: first.paragraphs } : {}),
        ...(first.part ? { firstHeaderPart: first.part } : {}),
        ...(even.paragraphs.length ? { evenHeader: even.paragraphs } : {}),
        ...(even.part ? { evenHeaderPart: even.part } : {}),
        ...(firstFooter.paragraphs.length ? { firstFooter: firstFooter.paragraphs } : {}),
        ...(firstFooter.part ? { firstFooterPart: firstFooter.part } : {}),
        ...(evenFooter.paragraphs.length ? { evenFooter: evenFooter.paragraphs } : {}),
        ...(evenFooter.part ? { evenFooterPart: evenFooter.part } : {}),
        ...((0, xml_1.child)(node, "titlePg") ? { titlePage: true } : {}),
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
        ...readPageExtras(node, margin),
    };
}
function readPageExtras(node, margin) {
    const extras = {};
    const gutter = positive(margin ? (0, xml_1.attr)(margin, "gutter") : undefined);
    const headerDistance = positive(margin ? (0, xml_1.attr)(margin, "header") : undefined);
    const footerDistance = positive(margin ? (0, xml_1.attr)(margin, "footer") : undefined);
    if (gutter !== undefined)
        extras.gutter = gutter;
    if (headerDistance !== undefined)
        extras.headerDistance = headerDistance;
    if (footerDistance !== undefined)
        extras.footerDistance = footerDistance;
    if ((0, xml_1.child)(node, "lnNumType"))
        extras.lineNumbers = true;
    const borders = (0, xml_1.child)(node, "pgBorders");
    const border = borders ? colorOf((0, xml_1.child)(borders, "top")) : undefined;
    if (border)
        extras.border = border;
    const direction = (0, xml_1.child)(node, "textDirection");
    const flow = direction ? (0, xml_1.attr)(direction, "val") : undefined;
    if (flow === "tbRl" || flow === "btLr")
        extras.direction = "tb";
    else if (flow === "rlTb" || flow === "lrTbV")
        extras.direction = "rl";
    const type = (0, xml_1.child)(node, "type");
    const start = type ? (0, xml_1.attr)(type, "val") : undefined;
    if (start === "continuous" || start === "evenPage" || start === "oddPage" || start === "nextColumn")
        extras.break = start;
    else if (start === "nextPage")
        extras.break = "nextPage";
    return extras;
}
/** A header paragraph whose only text sits inside a watermark shape, such as Word's diagonal "DRAFT". */
function watermarkFrom(node) {
    const raw = (0, xml_1.serialize)("p", node);
    if (!/id="PowerPlusWaterMarkObject"/i.test(raw))
        return undefined;
    const shape = (0, xml_1.ordered)(node)
        .filter((item) => item.name === "r")
        .flatMap((item) => (0, xml_1.ordered)(item.node))
        .flatMap((item) => (item.name === "pict" ? (0, xml_1.ordered)(item.node) : []))
        .find((item) => item.name === "shape");
    const path = shape ? (0, xml_1.child)(shape.node, "textpath") : undefined;
    const label = path ? (0, xml_1.attr)(path, "string") ?? (0, xml_1.text)(path) : "";
    if (!label)
        return undefined;
    return { runs: [{ text: label, watermark: true, color: "#d0d0d0", fontSize: 48 }] };
}
function storyFrom(context, section, refName, rootName, type = "default") {
    const ref = (0, xml_1.children)(section, refName).find((item) => ((0, xml_1.attr)(item, "type") ?? "default") === type);
    const id = ref ? (0, xml_1.attr)(ref, "id") : undefined;
    if (!id)
        return { paragraphs: [] };
    const target = context.rels.get(id);
    if (!target)
        return { paragraphs: [] };
    const path = partPath(target);
    const xml = context.archive.getText(path);
    if (!xml)
        return { paragraphs: [] };
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), rootName);
    return { paragraphs: (0, xml_1.children)(root, "p").map((node) => watermarkFrom(node) ?? paragraphFrom(node, context)), part: path };
}
/** Reads word/comments.xml. The body of each comment is the text shown beside its anchor. */
function commentsFrom(archive) {
    const xml = archive.getText("word/comments.xml");
    if (!xml)
        return [];
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), "comments");
    if (!root)
        return [];
    const found = [];
    for (const item of (0, xml_1.children)(root, "comment")) {
        const id = (0, xml_1.attr)(item, "id");
        if (!id)
            continue;
        const body = (0, xml_1.children)(item, "p").map((paragraph) => visibleText(paragraph).trim()).filter(Boolean).join(" ");
        if (body)
            found.push({ id, author: (0, xml_1.attr)(item, "author") ?? "", text: body });
    }
    return found;
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
/** Named paragraph styles, with the formatting they add on top of the one they are based on. */
function styleTable(archive) {
    const xml = archive.getText("word/styles.xml");
    if (!xml)
        return {};
    const root = (0, xml_1.child)((0, xml_1.parseXml)(xml), "styles");
    if (!root)
        return {};
    const table = {};
    for (const item of (0, xml_1.children)(root, "style")) {
        const id = (0, xml_1.attr)(item, "styleId");
        if (!id)
            continue;
        const style = {};
        const based = (0, xml_1.child)(item, "basedOn");
        const basedOn = based ? (0, xml_1.attr)(based, "val") : undefined;
        if (basedOn)
            style.basedOn = basedOn;
        const props = (0, xml_1.child)(item, "pPr");
        const align = props ? (0, xml_1.child)(props, "jc") : undefined;
        const value = align ? (0, xml_1.attr)(align, "val") : undefined;
        if (value === "center" || value === "right" || value === "both" || value === "left")
            style.align = value;
        const run = (0, xml_1.child)(item, "rPr");
        if (run)
            Object.assign(style, runProps(run));
        table[id] = style;
    }
    return table;
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
            const startNode = (0, xml_1.child)(level, "start");
            const formatNode = (0, xml_1.child)(level, "numFmt");
            const startAt = Number(startNode ? (0, xml_1.attr)(startNode, "val") ?? "" : "");
            const format = formatNode ? (0, xml_1.attr)(formatNode, "val") : undefined;
            levels[Number.isFinite(index) ? index : 0] = {
                text: value,
                ...(bullet ? { bullet } : {}),
                ...(Number.isFinite(startAt) && startAt !== 1 ? { start: startAt } : {}),
                ...(format && format !== "decimal" && format !== "bullet" ? { format } : {}),
            };
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
function paragraphFrom(node, context, verbatim = [], blockIndex = -1, carried) {
    const props = (0, xml_1.child)(node, "pPr");
    const paragraph = { runs: [] };
    if (props)
        applyParagraphProps(paragraph, props, context);
    let link;
    let bookmark;
    let field = carried;
    const seen = new Map();
    const take = (item) => {
        const key = `${item.name}\u0000${signatureOf(item.node)}`;
        const occurrence = seen.get(key) ?? 0;
        seen.set(key, occurrence + 1);
        return occurrence;
    };
    for (const item of (0, xml_1.ordered)(node)) {
        const here = take(item);
        const markup = blockIndex < 0 ? "" : (0, xml_1.keptAt)(verbatim, blockIndex, [[item.name, signatureOf(item.node), here]]);
        if (item.name === "ins" || item.name === "moveTo") {
            paragraph.runs.push(...changedRuns(item.node, context, link, bookmark, "insert", markup));
        }
        else if (item.name === "del" || item.name === "moveFrom") {
            paragraph.runs.push(...changedRuns(item.node, context, link, bookmark, "delete", markup));
        }
        else if (item.name === "r") {
            const runs = runsFrom(item.node, context, link, bookmark, verbatim, blockIndex, [[item.name, signatureOf(item.node), here]]);
            const open = field && field.open ? field : undefined;
            if (open) {
                for (const run of runs) {
                    if (run.field === "begin") {
                        field = { instruction: [], result: [], started: false, open: true };
                    }
                    else if (run.field === "separate") {
                        open.started = true;
                    }
                    else if (run.field === "end") {
                        paragraph.runs.push(fieldRun(fieldInstruction(open.instruction), open.result.join(""), {}, bookmark));
                        open.instruction.length = 0;
                        open.result.length = 0;
                        open.started = false;
                        open.open = false;
                        field = undefined;
                    }
                    else if (open.started)
                        open.result.push(run.text);
                    else if (run.field && run.field !== "separate" && run.field !== "end")
                        open.instruction.push(run.field);
                }
            }
            else {
                const begins = runs.findIndex((run) => run.field === "begin");
                if (begins < 0)
                    paragraph.runs.push(...runs);
                else {
                    paragraph.runs.push(...runs.slice(0, begins));
                    const opening = carried ?? { instruction: [], result: [], started: false, open: true };
                    opening.open = true;
                    field = opening;
                    if (carried)
                        Object.assign(carried, opening);
                    for (const run of runs.slice(begins + 1)) {
                        if (run.field === "separate")
                            opening.started = true;
                        else if (run.field && run.field !== "end")
                            opening.instruction.push(run.field);
                        else if (opening.started)
                            opening.result.push(run.text);
                    }
                }
            }
        }
        else if (item.name === "fldSimple") {
            const instruction = (0, xml_1.attr)(item.node, "instr") ?? "";
            const result = (0, xml_1.ordered)(item.node)
                .filter((inner) => inner.name === "r")
                .flatMap((inner) => runsFrom(inner.node, context, link, bookmark))
                .map((run) => run.text)
                .join("");
            paragraph.runs.push(fieldRun(instruction.trim(), result, {}, bookmark));
        }
        else if (KEPT_INLINE.has(item.name)) {
            const shown = item.name === "object" ? visibleText(item.node).trim() : "";
            paragraph.runs.push({ text: shown, raw: markup || (0, xml_1.serialize)(item.name, item.node), ...(bookmark ? { bookmark } : {}) });
        }
        else if (item.name === "hyperlink") {
            const id = (0, xml_1.attr)(item.node, "id");
            const anchor = (0, xml_1.attr)(item.node, "anchor");
            const target = id ? context.rels.get(id) : anchor ? `#${anchor}` : undefined;
            const previous = link;
            link = target ?? link;
            const innerSeen = new Map();
            for (const inner of (0, xml_1.ordered)(item.node)) {
                const innerKey = `${inner.name}\u0000${signatureOf(inner.node)}`;
                const innerOccurrence = innerSeen.get(innerKey) ?? 0;
                innerSeen.set(innerKey, innerOccurrence + 1);
                if (inner.name === "r")
                    paragraph.runs.push(...runsFrom(inner.node, context, link, bookmark, verbatim, blockIndex, [[item.name, signatureOf(item.node), here], [inner.name, signatureOf(inner.node), innerOccurrence]]));
            }
            link = previous;
        }
        else if (item.name === "bookmarkStart") {
            bookmark = (0, xml_1.attr)(item.node, "name");
        }
    }
    if (carried && field !== carried) {
        const pending = field && field.open ? field : undefined;
        carried.instruction = pending ? [...pending.instruction] : [];
        carried.result = pending ? [...pending.result] : [];
        carried.started = pending ? pending.started : false;
        carried.open = !!pending;
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
    const border = (0, xml_1.child)(props, "pBdr");
    const borderColor = border ? colorOf((0, xml_1.child)(border, "top")) : undefined;
    if (borderColor)
        paragraph.border = borderColor;
    if ((0, xml_1.child)(props, "pageBreakBefore"))
        paragraph.pageBreakBefore = true;
    if (on((0, xml_1.child)(props, "keepNext")))
        paragraph.keepNext = true;
    if (on((0, xml_1.child)(props, "keepLines")))
        paragraph.keepLines = true;
    if (on((0, xml_1.child)(props, "widowControl")))
        paragraph.widowControl = true;
    const outline = (0, xml_1.child)(props, "outlineLvl");
    const outlineLevel = Number(outline ? (0, xml_1.attr)(outline, "val") : undefined);
    if (Number.isFinite(outlineLevel) && outlineLevel >= 0)
        paragraph.outline = outlineLevel;
    const kept = PARAGRAPH_MARKS.filter((name) => on((0, xml_1.child)(props, name)));
    if (kept.length)
        paragraph.marks = kept;
    const keptMarkup = keptXml(props, PARAGRAPH_KEPT);
    if (keptMarkup.length)
        paragraph.kept = keptMarkup;
    const tabs = (0, xml_1.child)(props, "tabs");
    if (tabs) {
        const stops = [];
        for (const tab of (0, xml_1.children)(tabs, "tab")) {
            const pos = Number((0, xml_1.attr)(tab, "pos"));
            if (!Number.isFinite(pos))
                continue;
            const align = (0, xml_1.attr)(tab, "val");
            stops.push(align === "center" || align === "right" || align === "decimal" ? { pos, align } : { pos });
        }
        if (stops.length)
            paragraph.tabs = stops;
    }
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
/** Runs inside a tracked change. The text is readable; the original markup is what gets written back. */
function changedRuns(node, context, link, bookmark, kind, markup = "") {
    const name = kind === "insert" ? "ins" : "del";
    const raw = markup || (0, xml_1.serialize)(name, node);
    const runs = (0, xml_1.children)(node, "r").flatMap((run) => runsFrom(run, context, link, bookmark));
    if (!runs.length)
        return [{ text: "", raw, ...(kind === "delete" ? { deleted: true } : { inserted: true }) }];
    return runs.map((run, index) => ({ ...run, ...(index === 0 ? { raw } : {}), ...(kind === "delete" ? { deleted: true } : { inserted: true }) }));
}
function signatureOf(node) {
    return Object.entries(node)
        .filter(([key]) => key.startsWith("@_"))
        .map(([key, value]) => {
        const name = key.slice(2);
        const colon = name.indexOf(":");
        return `${colon < 0 ? name : name.slice(colon + 1)}=${String(value)}`;
    })
        .sort()
        .join(",");
}
/** Inline markup kept verbatim: a footnote or endnote reference, a comment marker, ruby text, an embedded object. */
const KEPT_INLINE = new Set(["footnoteReference", "endnoteReference", "ruby", "object", "pict", "fldSimple", "commentRangeStart", "commentRangeEnd", "bookmarkEnd", "smartTag"]);
/** Turns a field instruction into the run that shows its result. */
function fieldRun(instruction, result, shared, bookmark) {
    const run = { ...shared, text: result, field: instruction, ...(bookmark ? { bookmark } : {}) };
    const citation = /^\s*CITATION\s+(\S+)(?:\s+\\p\s+(\S+))?/i.exec(instruction);
    if (citation?.[1])
        run.citation = { source: citation[1], ...(citation[2] ? { pages: citation[2] } : {}) };
    const caption = /^\s*SEQ\s+(\S+)/i.exec(instruction);
    if (caption?.[1])
        run.caption = caption[1];
    const entry = /^\s*XE\s+"([^"]+)"(?:\s+\\t\s+"([^"]+)")?/i.exec(instruction);
    if (entry?.[1])
        run.indexEntry = { text: entry[1], ...(entry[2] ? { see: entry[2] } : {}) };
    return run;
}
/** The words between a field's begin and its separate, which is the instruction. */
function fieldInstruction(parts) {
    return parts.join("").replace(/\s+/g, " ").trim();
}
function runsFrom(node, context, link, bookmark, verbatim = [], blockIndex = -1, path = []) {
    const shared = runProps((0, xml_1.child)(node, "rPr"));
    if (link)
        shared.link = link;
    const runs = [];
    let pending = {};
    let usedBookmark = false;
    const seen = new Map();
    const take = (item) => {
        const key = `${item.name}\u0000${signatureOf(item.node)}`;
        const occurrence = seen.get(key) ?? 0;
        seen.set(key, occurrence + 1);
        return occurrence;
    };
    for (const item of (0, xml_1.ordered)(node)) {
        const markup = blockIndex < 0 ? "" : (0, xml_1.keptAt)(verbatim, blockIndex, [...path, [item.name, signatureOf(item.node), take(item)]]);
        if (item.name === "br") {
            const kind = (0, xml_1.attr)(item.node, "type");
            pending.breakBefore = kind === "page" ? "page" : kind === "column" ? "column" : "line";
        }
        else if (item.name === "cr") {
            runs.push(runWith(shared, "\n", pending, !usedBookmark ? bookmark : undefined));
            usedBookmark = true;
            pending = {};
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
        else if (item.name === "instrText") {
            runs.push({ ...shared, text: "", field: (0, xml_1.text)(item.node) });
        }
        else if (item.name === "fldChar") {
            if (pending.breakBefore || pending.tabBefore) {
                runs.push(runWith(shared, "", pending, !usedBookmark ? bookmark : undefined));
                usedBookmark = true;
                pending = {};
            }
            runs.push({ text: "", field: (0, xml_1.attr)(item.node, "fldCharType") ?? "begin" });
        }
        else if (item.name === "delText") {
            const value = (0, xml_1.text)(item.node);
            if (value)
                runs.push(runWith(shared, value, pending, !usedBookmark ? bookmark : undefined));
        }
        else if (item.name === "drawing") {
            const image = imageFrom(item.node, context);
            const wrap = wrapOf(node);
            if (image) {
                runs.push({ ...shared, text: "", ...image, ...(wrap ? { wrap } : {}), ...pending, ...(!usedBookmark && bookmark ? { bookmark } : {}) });
                usedBookmark = true;
                pending = {};
            }
        }
        else if (item.name === "sym") {
            const char = (0, xml_1.attr)(item.node, "char");
            const code = char ? Number.parseInt(char, 16) : NaN;
            if (Number.isFinite(code)) {
                const run = runWith(shared, String.fromCodePoint(code), pending, !usedBookmark ? bookmark : undefined);
                run.raw = markup || (0, xml_1.serialize)("sym", item.node);
                runs.push(run);
                usedBookmark = true;
                pending = {};
            }
        }
        else if (item.name === "commentReference") {
            runs.push(runWith(shared, (0, xml_1.text)(item.node), pending, !usedBookmark ? bookmark : undefined));
            const run = runs[runs.length - 1];
            run.raw = markup || (0, xml_1.serialize)(item.name, item.node);
            const id = (0, xml_1.attr)(item.node, "id");
            if (id)
                run.comment = id;
        }
        else if (KEPT_INLINE.has(item.name)) {
            runs.push(runWith(shared, (0, xml_1.text)(item.node), pending, !usedBookmark ? bookmark : undefined));
            runs[runs.length - 1].raw = markup || (0, xml_1.serialize)(item.name, item.node);
            usedBookmark = true;
            pending = {};
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
    if (on((0, xml_1.child)(props, "strike")))
        shared.strike = true;
    if (on((0, xml_1.child)(props, "dstrike")))
        shared.doubleStrike = true;
    const runStyle = (0, xml_1.child)(props, "rStyle");
    const runStyleName = runStyle ? (0, xml_1.attr)(runStyle, "val") : undefined;
    if (runStyleName)
        shared.runStyle = runStyleName;
    if (on((0, xml_1.child)(props, "caps")))
        shared.caps = true;
    if (on((0, xml_1.child)(props, "smallCaps")))
        shared.smallCaps = true;
    if (on((0, xml_1.child)(props, "vanish")))
        shared.hidden = true;
    const emphasis = (0, xml_1.child)(props, "em");
    const emphasisMark = emphasis ? (0, xml_1.attr)(emphasis, "val") : undefined;
    if (emphasisMark && emphasisMark !== "none")
        shared.emphasis = emphasisMark;
    const lang = (0, xml_1.child)(props, "lang");
    const langValue = lang ? (0, xml_1.attr)(lang, "val") ?? (0, xml_1.attr)(lang, "eastAsia") : undefined;
    if (langValue)
        shared.lang = langValue;
    const kern = Number((0, xml_1.child)(props, "kern") ? (0, xml_1.attr)((0, xml_1.child)(props, "kern"), "val") : undefined);
    if (Number.isFinite(kern) && kern > 0)
        shared.kern = kern;
    const kept = RUN_MARKS.filter((name) => on((0, xml_1.child)(props, name)));
    if (kept.length)
        shared.marks = kept;
    const keptMarkup = keptXml(props, RUN_KEPT);
    if (keptMarkup.length)
        shared.kept = keptMarkup;
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
    const font = fonts ? (0, xml_1.attr)(fonts, "ascii") ?? (0, xml_1.attr)(fonts, "hAnsi") : undefined;
    if (font)
        shared.font = font;
    const eastAsia = fonts ? (0, xml_1.attr)(fonts, "eastAsia") : undefined;
    if (eastAsia && eastAsia !== font)
        shared.fontEastAsia = eastAsia;
    const color = colorOf((0, xml_1.child)(props, "color"));
    if (color)
        shared.color = color;
    const scale = Number((0, xml_1.child)(props, "w") ? (0, xml_1.attr)((0, xml_1.child)(props, "w"), "val") : undefined);
    if (Number.isFinite(scale) && scale > 0 && scale !== 100)
        shared.scale = scale;
    const spacing = Number((0, xml_1.child)(props, "spacing") ? (0, xml_1.attr)((0, xml_1.child)(props, "spacing"), "val") : undefined);
    if (Number.isFinite(spacing) && spacing !== 0)
        shared.spacing = spacing;
    const position = Number((0, xml_1.child)(props, "position") ? (0, xml_1.attr)((0, xml_1.child)(props, "position"), "val") : undefined);
    if (Number.isFinite(position) && position !== 0)
        shared.position = position;
    return shared;
}
/** The wrap element a drawing carries, so text can flow around it. */
function wrapOf(node) {
    const drawing = (0, xml_1.child)(node, "drawing");
    const anchor = drawing ? (0, xml_1.child)(drawing, "anchor") : undefined;
    if (!anchor)
        return undefined;
    if ((0, xml_1.child)(anchor, "wrapSquare"))
        return "square";
    if ((0, xml_1.child)(anchor, "wrapTight"))
        return "tight";
    if ((0, xml_1.child)(anchor, "wrapNone"))
        return (0, xml_1.attr)(anchor, "behindDoc") === "1" ? "behind" : "front";
    return undefined;
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
    const extent = inline ? (0, xml_1.child)(inline, "extent") : undefined;
    const width = Number(extent ? (0, xml_1.attr)(extent, "cx") : undefined);
    const height = Number(extent ? (0, xml_1.attr)(extent, "cy") : undefined);
    const target = context.rels.get(id);
    const crop = cropOf(fill);
    const result = {
        image: id,
        ...(Number.isFinite(width) && width > 0 ? { imageWidth: width } : {}),
        ...(Number.isFinite(height) && height > 0 ? { imageHeight: height } : {}),
        ...(crop ? { crop } : {}),
    };
    if (target) {
        const bytes = context.archive.files.get(partPath(target));
        if (bytes) {
            result.imageBytes = bytes;
            result.imageType = imageType(target);
        }
    }
    return result;
}
/** Word stores each cropped edge in thousandths of a percent. */
function cropOf(fill) {
    const rect = fill ? (0, xml_1.child)(fill, "srcRect") : undefined;
    if (!rect)
        return undefined;
    const edge = (name) => {
        const value = Number((0, xml_1.attr)(rect, name));
        return Number.isFinite(value) && value > 0 ? value / 1000 : undefined;
    };
    const crop = { left: edge("l"), top: edge("t"), right: edge("r"), bottom: edge("b") };
    return crop.left || crop.top || crop.right || crop.bottom ? crop : undefined;
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
    const table = {
        rows: (0, xml_1.children)(node, "tr").map((row) => (0, xml_1.children)(row, "tc").map((cell) => cellFrom(cell, context))),
    };
    const grid = (0, xml_1.child)(node, "tblGrid");
    const widths = grid ? (0, xml_1.children)(grid, "gridCol").map((column) => Number((0, xml_1.attr)(column, "w"))).filter((width) => Number.isFinite(width) && width > 0) : [];
    if (widths.length)
        table.widths = widths;
    const first = (0, xml_1.children)(node, "tr")[0];
    const props = first ? (0, xml_1.child)(first, "trPr") : undefined;
    if (props && (0, xml_1.child)(props, "tblHeader"))
        table.header = true;
    return table;
}
/** Paragraphs a cell holds, including those nested in a content control or a formula. */
function cellParagraphs(node, context) {
    const paragraphs = [];
    for (const item of (0, xml_1.ordered)(node)) {
        const name = item.name.includes(":") ? item.name.slice(item.name.indexOf(":") + 1) : item.name;
        if (name === "p")
            paragraphs.push(paragraphFrom(item.node, context));
        else if (name !== "tcPr" && name !== "pPr")
            paragraphs.push(...cellParagraphs(item.node, context));
    }
    return paragraphs;
}
function cellFrom(node, context) {
    const props = (0, xml_1.child)(node, "tcPr");
    const cell = { paragraphs: cellParagraphs(node, context) };
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
    const borders = props ? (0, xml_1.child)(props, "tcBorders") : undefined;
    const border = borders ? colorOf((0, xml_1.child)(borders, "top")) : undefined;
    if (border)
        cell.border = border;
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
