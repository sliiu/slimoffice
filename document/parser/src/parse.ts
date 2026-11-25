import {
  DEFAULT_PAGE,
  type DocAlign,
  type DocBlock,
  isDocParagraph,
  type DocBreak,
  type DocCell,
  type DocIndent,
  type DocNumberingLevel,
  type DocNumberingTable,
  type DocPageSetup,
  type DocParagraph,
  type DocRun,
  type DocSection,
  type DocComment,
  type DocDefaults,
  type DocLatentStyle,
  type DocStyle,
  type DocStyleTable,
  type DocSpacing,
  type DocBorder,
  type DocBorderSide,
  type DocFrame,
  type DocTable,
  type DocUnderline,
  type Document,
  type DocSource,
  type DocRecipient,
  type DocFormula,
  type DocMailMerge,
  type DocTheme,
} from "@sliiu/document-core";
import { loadArchive, type OfficeArchive } from "./zip";
import { attr, child, children, keptAt, keptBody, ordered, parseXml, serialize, text, type XmlNode } from "./xml";

export type DocxOpenErrorCode = "LEGACY_DOC" | "ENCRYPTED_DOCX";

export class DocxOpenError extends Error {
  constructor(
    readonly code: DocxOpenErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DocxOpenError";
  }
}

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENCRYPTED = new TextEncoder().encode("EncryptedPackage");

const HIGHLIGHTS: Record<string, string> = {
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

const UNDERLINES = new Set<DocUnderline>(["single", "double", "dotted", "dash", "wave"]);

/** Paragraph switches the model keeps so a rewrite does not drop them. */
const PARAGRAPH_MARKS = ["suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "contextualSpacing", "mirrorIndents", "suppressOverlap"];

/** Run switches the model keeps so a rewrite does not drop them. */
const RUN_MARKS = ["outline", "shadow", "emboss", "imprint", "effect"];

const BORDER_SIDES = ["top", "left", "bottom", "right"] as const;

interface Context {
  archive: OfficeArchive;
  rels: Map<string, string>;
  numbering: DocNumberingTable;
  styles: DocStyleTable;
}

export async function parseDocx(input: ArrayBuffer | Uint8Array | Blob): Promise<Document> {
  const bytes = await toBytes(input);
  assertOpenXml(bytes);
  const archive = loadArchive(bytes);
  const xml = archive.getText("word/document.xml");
  if (!xml) throw new Error("word/document.xml not found");
  const root = child(parseXml(xml), "document");
  const body = root ? child(root, "body") : undefined;
  if (!body) throw new Error("word/document.xml has no body");
  const context: Context = { archive, rels: relationships(archive), numbering: numberingTable(archive), styles: styleTable(archive) };
  const background = colorOf(root ? child(root, "background") : undefined);
  const sections = sectionsFrom(body, context, xml);
  const web = webSettingsOf(archive);
  if (background || web.background) {
    for (const section of sections) section.page.background = background ?? web.background;
  }
  if (web.margin) {
    for (const section of sections) section.page.webMargin = web.margin;
  }
  const sources = bibliography(archive);
  const recipients = mailRecipients(archive);
  const mailMerge = mailMergeOf(archive);
  const comments = commentsFrom(archive);
  const notes = notesFrom(archive, context);
  attachNotes(sections, notes.notes, notes.separators);
  const hyphenation = hyphenates(archive);
  const view = viewOf(archive);
  const zoom = zoomOf(archive);
  const macros = hasMacros(archive);
  const readOnly = locked(archive);
  const media = mediaFiles(archive);
  const theme = themeOf(archive);
  return {
    sections,
    ...(Object.keys(context.numbering).length ? { numbering: context.numbering } : {}),
    ...(Object.keys(context.styles.styles).length || context.styles.defaults || context.styles.latent?.length ? { styles: context.styles } : {}),
    ...(theme ? { theme } : {}),
    ...(sources.length ? { sources } : {}),
    ...(recipients.length ? { recipients } : {}),
    ...(mailMerge ? { mailMerge } : {}),
    ...(comments.length ? { comments } : {}),
    ...(hyphenation ? { hyphenation: true } : {}),
    ...(view ? { view } : {}),
    ...(zoom ? { zoom } : {}),
    ...(macros ? { macros: true } : {}),
    ...(readOnly ? { readOnly: true } : {}),
    ...(media.size ? { media } : {}),
    source: archive.files,
  };
}

/** The page color and the margin webSettings.xml stores, in pixels, used when the document is shown as a web page. */
function webSettingsOf(archive: OfficeArchive): { background?: string; margin?: number } {
  const xml = archive.getText("word/webSettings.xml");
  if (!xml) return {};
  const root = child(parseXml(xml), "webSettings");
  if (!root) return {};
  const color = colorOf(child(root, "background"));
  const divs = child(root, "divs");
  const margin = divs ? child(child(divs, "div") ?? {}, "marLeft") : undefined;
  const pixels = margin ? Number(attr(margin, "val")) : undefined;
  return {
    ...(color ? { background: color } : {}),
    ...(pixels !== undefined && Number.isFinite(pixels) ? { margin: pixels } : {}),
  };
}

/** Every part under word/media/, pictures the story never shows included. */
function mediaFiles(archive: OfficeArchive): Map<string, Uint8Array> {
  const media = new Map<string, Uint8Array>();
  for (const [path, bytes] of archive.files) {
    if (path.startsWith("word/media/")) media.set(path, bytes);
  }
  return media;
}

/** The mail merge settings.xml stores: the document type, the data type, the source, and how it connects. */
function mailMergeOf(archive: OfficeArchive): DocMailMerge | undefined {
  const xml = archive.getText("word/settings.xml");
  if (!xml) return undefined;
  const settings = child(parseXml(xml), "settings");
  const merge = settings ? child(settings, "mailMerge") : undefined;
  if (!merge) return undefined;
  const value = (name: string): string | undefined => {
    const node = child(merge, name);
    return node ? attr(node, "val") : undefined;
  };
  const found: DocMailMerge = {
    ...(value("mainDocumentType") ? { document: value("mainDocumentType") } : {}),
    ...(value("dataType") ? { data: value("dataType") } : {}),
    ...(value("query") ? { source: value("query") } : {}),
    ...(value("linkToQuery") ? { link: value("linkToQuery") } : {}),
  };
  return Object.keys(found).length ? found : undefined;
}

const VIEWS = ["print", "web", "outline", "normal"] as const;

/** The view settings.xml stored. Anything else, including master pages, falls back to print. */
function viewOf(archive: OfficeArchive): (typeof VIEWS)[number] | undefined {
  const xml = archive.getText("word/settings.xml");
  if (!xml) return undefined;
  const match = /<(?:w:)?view\s[^>]*val="([^"]*)"/i.exec(xml);
  const value = match?.[1];
  return VIEWS.find((item) => item === value);
}

/** The zoom settings.xml stored, in percent. */
function zoomOf(archive: OfficeArchive): number | undefined {
  const xml = archive.getText("word/settings.xml");
  if (!xml) return undefined;
  const match = /<(?:w:)?zoom\s[^>]*percent="(\d+)"/i.exec(xml);
  const percent = Number(match?.[1]);
  return Number.isFinite(percent) && percent > 0 ? percent : undefined;
}

/** A macro project is present. Its bytes are kept and it is never run. */
function hasMacros(archive: OfficeArchive): boolean {
  for (const path of archive.files.keys()) {
    if (/^word\/vbaProject\.bin$/i.test(path)) return true;
  }
  return false;
}

/** settings.xml marks the document read only. */
function locked(archive: OfficeArchive): boolean {
  const xml = archive.getText("word/settings.xml");
  if (!xml) return false;
  return /<(?:w:)?documentProtection\b[^>]*\bw:edit="readOnly"/i.test(xml);
}

/** settings.xml asks the document to hyphenate words at line ends. */
function hyphenates(archive: OfficeArchive): boolean {
  const xml = archive.getText("word/settings.xml");
  if (!xml) return false;
  return /<(?:w:)?autoHyphenation\b[^>]*\bw:val="(?:true|1)"/i.test(xml) || /<(?:w:)?autoHyphenation\s*\/>/i.test(xml);
}

/** The body of each footnote and endnote, keyed by id, so a reference in the story can show it. */
function notesFrom(archive: OfficeArchive, context: Context): { notes: Map<string, DocParagraph>; separators: DocParagraph[] } {
  const notes = new Map<string, DocParagraph>();
  const separators: DocParagraph[] = [];
  const read = (path: string, kind: "footnote" | "endnote", root: string, ref: string) => {
    const xml = archive.getText(path);
    if (!xml) return;
    const body = child(parseXml(xml), root);
    if (!body) return;
    for (const item of children(body, kind)) {
      const id = attr(item, "id");
      const type = attr(item, "type");
      if (!id) continue;
      if (type === "separator" || type === "continuationSeparator") {
        separators.push({ runs: [], noteSeparator: { kind, type } });
        continue;
      }
      const paragraph = paragraphFrom(children(item, "p")[0] ?? item, context);
      paragraph.runs = paragraph.runs.filter((run) => !run.raw?.includes(`${ref}`));
      paragraph.note = { kind, id };
      notes.set(`${kind}:${id}`, paragraph);
    }
  };
  read("word/footnotes.xml", "footnote", "footnotes", "footnoteRef");
  read("word/endnotes.xml", "endnote", "endnotes", "endnoteRef");
  return { notes, separators };
}

/** Puts each note's body right after the paragraph that references it, with the separator line ahead of the first one. A section that ends its own endnotes takes the ones left over. */
function attachNotes(sections: DocSection[], notes: Map<string, DocParagraph>, separators: DocParagraph[]): void {
  if (!notes.size && !separators.length) return;
  const placed = new Set<string>();
  for (const section of sections) {
    const blocks: DocBlock[] = [];
    const drawn = new Set<string>();
    const place = (note: DocParagraph) => {
      if (!note.note) return;
      const kind = note.note.kind;
      if (!drawn.has(kind)) {
        const line = separators.find((item) => item.noteSeparator?.kind === kind && item.noteSeparator.type === "separator");
        if (line) blocks.push(line);
        drawn.add(kind);
      }
      blocks.push(note);
      placed.add(`${kind}:${note.note.id}`);
    };
    for (const block of section.blocks) {
      blocks.push(block);
      if (!isDocParagraph(block)) continue;
      for (const run of block.runs) {
        const id = noteId(run.raw);
        const note = id ? notes.get(id) : undefined;
        if (note?.note) place(note);
      }
    }
    if (section.page.endnotesHere) {
      for (const [id, note] of notes) {
        if (note.note?.kind === "endnote" && !placed.has(id)) place(note);
      }
    }
    section.blocks = blocks;
  }
}

/** The paragraphs inside a content control, so each one can be edited like any other paragraph. */
function controlContent(node: XmlNode, context: Context): DocParagraph[] | undefined {
  const body = child(node, "sdtContent");
  if (!body) return undefined;
  const paragraphs = children(body, "p").map((item) => paragraphFrom(item, context));
  return paragraphs.length ? paragraphs : undefined;
}

/** The control's own properties, kept so writing wraps the edited paragraphs in the same control. */
function controlProps(node: XmlNode): string | undefined {
  const props = child(node, "sdtPr");
  return props ? serialize("sdtPr", props) : undefined;
}

/** A formula laid out as pieces. Each text node stays its own piece, so an edit writes back into that node. */
function formulaOf(node: XmlNode): DocFormula[] {
  const pieces: DocFormula[] = [];
  for (const item of ordered(node)) {
    const name = item.name.includes(":") ? item.name.slice(item.name.indexOf(":") + 1) : item.name;
    if (name === "f") {
      pieces.push({ kind: "frac", top: formulaOf(child(item.node, "num") ?? {}), bottom: formulaOf(child(item.node, "den") ?? {}) });
    } else if (name === "sSup" || name === "sSub") {
      pieces.push({ kind: name === "sSup" ? "sup" : "sub", base: formulaOf(child(item.node, "e") ?? {}), script: formulaOf(child(item.node, name === "sSup" ? "sup" : "sub") ?? {}) });
    } else if (name === "sSubSup") {
      pieces.push({ kind: "subsup", base: formulaOf(child(item.node, "e") ?? {}), script: formulaOf(child(item.node, "sub") ?? {}), upper: formulaOf(child(item.node, "sup") ?? {}) });
    } else if (name === "rad") {
      pieces.push({ kind: "root", body: formulaOf(child(item.node, "e") ?? {}), degree: formulaOf(child(item.node, "deg") ?? {}) });
    } else if (name === "d") {
      const props = child(item.node, "dPr");
      const open = props ? child(props, "begChr") : undefined;
      const close = props ? child(props, "endChr") : undefined;
      pieces.push({ kind: "delim", open: (open ? attr(open, "val") : undefined) ?? "(", close: (close ? attr(close, "val") : undefined) ?? ")", body: formulaOf(child(item.node, "e") ?? {}) });
    } else if (name === "nary") {
      const props = child(item.node, "naryPr");
      const sign = props ? child(props, "chr") : undefined;
      pieces.push({ kind: "nary", sign: (sign ? attr(sign, "val") : undefined) ?? "∑", body: formulaOf(child(item.node, "e") ?? {}), sub: formulaOf(child(item.node, "sub") ?? {}), sup: formulaOf(child(item.node, "sup") ?? {}) });
    } else if (name === "func") {
      pieces.push({ kind: "func", name: formulaOf(child(item.node, "fName") ?? {}), body: formulaOf(child(item.node, "e") ?? {}) });
    } else if (name === "bar" || name === "groupChr") {
      const props = child(item.node, `${name}Pr`);
      const position = props ? child(props, "pos") : undefined;
      pieces.push({ kind: "bar", body: formulaOf(child(item.node, "e") ?? {}), ...(position && attr(position, "val") === "bot" ? { under: true } : {}) });
    } else if (name === "m") {
      const rows = children(item.node, "mr").map((row) => children(row, "e").map((cell) => formulaOf(cell)[0] ?? { text: "" }));
      pieces.push({ kind: "matrix", rows });
    } else if (name === "t") {
      const value = text(item.node);
      if (value) pieces.push({ text: value });
    } else {
      pieces.push(...formulaOf(item.node));
    }
  }
  return pieces;
}

function visibleText(node: XmlNode): string {
  const own = text(node);
  const nested = ordered(node).map((item) => visibleText(item.node)).join("");
  return `${own}${nested}`;
}

function noteId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = /<(?:w:)?(footnote|endnote)Reference\b[^>]*\bw:id="(\d+)"/i.exec(raw);
  return match ? `${match[1]!.toLowerCase()}:${match[2]}` : undefined;
}

/** Reads customXml/itemN.xml for a bibliography or a mail-merge recipient list. Anything else is left alone. */
function bibliography(archive: OfficeArchive): DocSource[] {
  const xml = customXml(archive, "b:sources") ?? customXml(archive, "sources");
  if (!xml) return [];
  const root = ordered(parseXml(xml)).find((item) => item.name === "sources" || item.name.endsWith(":sources"));
  if (!root) return [];
  const found: DocSource[] = [];
  for (const item of ordered(root.node)) {
    if (item.name !== "source" && !item.name.endsWith(":source")) continue;
    const tag = textOf(item.node, "tag");
    const title = textOf(item.node, "title");
    if (!tag || !title) continue;
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

function authorText(node: XmlNode): string {
  const names: string[] = [];
  const walk = (current: XmlNode): void => {
    for (const item of ordered(current)) {
      if (item.name === "nameList" || item.name.endsWith(":nameList") || item.name === "author" || item.name.endsWith(":author") || item.name === "person" || item.name.endsWith(":person")) {
        walk(item.node);
      } else if (item.name === "last" || item.name.endsWith(":last") || item.name === "first" || item.name.endsWith(":first")) {
        const value = text(item.node).trim();
        if (value) names.push(value);
      }
    }
  };
  walk(node);
  const people: string[] = [];
  for (let index = 0; index < names.length; index += 2) people.push(names.slice(index, index + 2).join(" "));
  return people.join(", ");
}

/** A recipient list stored as rows of named columns in a custom XML part. */
function mailRecipients(archive: OfficeArchive): DocRecipient[] {
  const xml = customXml(archive, "recipients");
  if (!xml) return [];
  const root = ordered(parseXml(xml)).find((item) => item.name === "recipients" || item.name.endsWith(":recipients"));
  if (!root) return [];
  const found: DocRecipient[] = [];
  for (const item of ordered(root.node)) {
    if (item.name !== "recipient" && !item.name.endsWith(":recipient")) continue;
    const fields: Record<string, string> = {};
    for (const column of ordered(item.node)) {
      const value = text(column.node).trim();
      if (value) fields[column.name.includes(":") ? column.name.slice(column.name.indexOf(":") + 1) : column.name] = value;
    }
    if (Object.keys(fields).length) found.push({ fields });
  }
  return found;
}

function customXml(archive: OfficeArchive, rootName: string): string | undefined {
  for (const [path, bytes] of archive.files) {
    if (!/^customXml\/item\d+\.xml$/i.test(path)) continue;
    const xml = new TextDecoder().decode(bytes);
    if (new RegExp(`<(?:[\\w-]+:)?${rootName}\\b`).test(xml)) return xml;
  }
  return undefined;
}

function textOf(node: XmlNode, name: string): string {
  for (const item of ordered(node)) {
    const local = item.name.includes(":") ? item.name.slice(item.name.indexOf(":") + 1) : item.name;
    if (local === name) return text(item.node).trim();
    const nested = textOf(item.node, name);
    if (nested) return nested;
  }
  return "";
}

/** Body-level markup the model does not edit, kept so rewriting the story does not drop it. */
const KEPT_BLOCKS = new Set(["sdt", "oMath", "oMathPara", "customXml", "altChunk"]);

function sectionsFrom(body: XmlNode, context: Context, source = ""): DocSection[] {
  const sections: DocSection[] = [];
  let blocks: DocBlock[] = [];
  const verbatim = source ? keptBody(source) : [];
  const openField = { instruction: [] as string[], result: [] as string[], started: false, open: false };
  for (const [index, item] of ordered(body).entries()) {
    if (item.name === "p") {
      const props = child(item.node, "pPr");
      const section = props ? child(props, "sectPr") : undefined;
      blocks.push(paragraphFrom(item.node, context, verbatim, index, openField));
      if (section) {
        sections.push(sectionFrom(section, blocks, context));
        blocks = [];
      }
    } else if (item.name === "tbl") {
      blocks.push(tableFrom(item.node, context));
    } else if (KEPT_BLOCKS.has(item.name)) {
      const original = verbatim[index];
      const raw = original ? serialize(original.name, original.node) : serialize(item.name, item.node);
      const visible = visibleText(item.node).trim();
      const formula = item.name === "oMath" || item.name === "oMathPara" ? formulaOf(item.node) : undefined;
      const content = item.name === "sdt" ? controlContent(item.node, context) : undefined;
      const control = content ? controlProps(item.node) : undefined;
      blocks.push({ raw, ...(visible ? { text: visible } : {}), ...(formula?.length ? { formula } : {}), ...(content ? { content, ...(control ? { control } : {}) } : {}) });
    } else if (item.name === "sectPr") {
      sections.push(sectionFrom(item.node, blocks, context));
      blocks = [];
    }
  }
  if (blocks.length) sections.push({ page: { ...DEFAULT_PAGE }, header: [], footer: [], blocks });
  return sections.length ? sections : [{ page: { ...DEFAULT_PAGE }, header: [], footer: [], blocks: [] }];
}

function sectionFrom(node: XmlNode, blocks: DocBlock[], context: Context): DocSection {
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
    ...(child(node, "titlePg") ? { titlePage: true } : {}),
    blocks,
  };
}

function pageFrom(node: XmlNode): DocPageSetup {
  const size = child(node, "pgSz");
  const margin = child(node, "pgMar");
  const columns = child(node, "cols");
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  const width = number(size ? attr(size, "w") : undefined, DEFAULT_PAGE.width);
  const height = number(size ? attr(size, "h") : undefined, DEFAULT_PAGE.height);
  const orient = size ? attr(size, "orient") : undefined;
  const count = Number(columns ? attr(columns, "num") : undefined);
  const columnSpace = positive(columns ? attr(columns, "space") : undefined);
  const separator = columns ? attr(columns, "sep") : undefined;
  return {
    width,
    height,
    ...(orient === "landscape" || (orient !== "portrait" && width > height) ? { landscape: true } : {}),
    margin: {
      top: number(margin ? attr(margin, "top") : undefined, DEFAULT_PAGE.margin.top),
      bottom: number(margin ? attr(margin, "bottom") : undefined, DEFAULT_PAGE.margin.bottom),
      left: number(margin ? attr(margin, "left") : undefined, DEFAULT_PAGE.margin.left),
      right: number(margin ? attr(margin, "right") : undefined, DEFAULT_PAGE.margin.right),
    },
    ...(Number.isFinite(count) && count > 1 ? { columns: count } : {}),
    ...(Number.isFinite(count) && count > 1 && columnSpace ? { columnSpace } : {}),
    ...(Number.isFinite(count) && count > 1 && (separator === "1" || separator === "true") ? { columnSeparator: true } : {}),
    ...readPageExtras(node, margin),
  };
}

function readPageExtras(node: XmlNode, margin: XmlNode | undefined): Partial<DocPageSetup> {
  const extras: Partial<DocPageSetup> = {};
  const gutter = positive(margin ? attr(margin, "gutter") : undefined);
  const headerDistance = positive(margin ? attr(margin, "header") : undefined);
  const footerDistance = positive(margin ? attr(margin, "footer") : undefined);
  if (gutter !== undefined) extras.gutter = gutter;
  if (headerDistance !== undefined) extras.headerDistance = headerDistance;
  if (footerDistance !== undefined) extras.footerDistance = footerDistance;
  const numbered = child(node, "lnNumType");
  if (numbered) {
    extras.lineNumbers = true;
    const start = Number(attr(numbered, "start"));
    if (Number.isFinite(start) && start > 0 && start !== 1) extras.lineStart = start;
  }
  const border = borderOf(child(node, "pgBorders"));
  if (border) extras.border = border;
  const direction = child(node, "textDirection");
  const flow = direction ? attr(direction, "val") : undefined;
  if (flow === "tbRl" || flow === "btLr") extras.direction = "tb";
  else if (flow === "rlTb" || flow === "lrTbV") extras.direction = "rl";
  const type = child(node, "type");
  const start = type ? attr(type, "val") : undefined;
  if (start === "continuous" || start === "evenPage" || start === "oddPage" || start === "nextColumn") extras.break = start;
  else if (start === "nextPage") extras.break = "nextPage";
  const widths = columnWidths(columnsOf(node));
  if (widths) extras.columnWidths = widths;
  const align = child(node, "vAlign");
  const aligned = align ? attr(align, "val") : undefined;
  if (aligned === "center" || aligned === "both" || aligned === "bottom" || aligned === "top") extras.verticalAlign = aligned;
  const grid = gridOf(child(node, "docGrid"));
  if (grid) extras.grid = grid;
  const numbering = pageNumberOf(child(node, "pgNumType"));
  if (numbering) extras.pageNumber = numbering;
  if (on(child(node, "bidi"))) extras.bidi = true;
  if (on(child(node, "rtlGutter"))) extras.rtlGutter = true;
  const endnotes = child(node, "endnotePr");
  const endnotePos = endnotes ? child(endnotes, "pos") : undefined;
  if (endnotePos && attr(endnotePos, "val") === "sectEnd") extras.endnotesHere = true;
  const notes = notesOf(child(node, "footnotePr"), endnotes);
  if (notes) extras.notes = notes;
  return extras;
}

/** Where the section's footnotes and endnotes start, and whether they restart. */
function notesOf(footnotes: XmlNode | undefined, endnotes: XmlNode | undefined): DocPageSetup["notes"] | undefined {
  const notes: NonNullable<DocPageSetup["notes"]> = {};
  const read = (node: XmlNode | undefined, start: "footnoteStart" | "endnoteStart", restart: "footnoteRestart" | "endnoteRestart") => {
    if (!node) return;
    const numStart = child(node, "numStart");
    const begun = numStart ? Number(attr(numStart, "val")) : undefined;
    if (begun !== undefined && Number.isFinite(begun)) notes[start] = begun;
    const numRestart = child(node, "numRestart");
    const again = numRestart ? attr(numRestart, "val") : undefined;
    if (again) notes[restart] = again;
  };
  read(footnotes, "footnoteStart", "footnoteRestart");
  read(endnotes, "endnoteStart", "endnoteRestart");
  return notes.footnoteStart !== undefined || notes.footnoteRestart || notes.endnoteStart !== undefined || notes.endnoteRestart ? notes : undefined;
}

/** The columns element, read here so the width list does not depend on the count. */
function columnsOf(node: XmlNode): XmlNode | undefined {
  return child(node, "cols");
}

/** Each column's own width, when the columns are not equal. */
function columnWidths(node: XmlNode | undefined): number[] | undefined {
  if (!node) return undefined;
  const widths = children(node, "col")
    .map((item) => positive(attr(item, "w")))
    .filter((width): width is number => width !== undefined);
  return widths.length ? widths : undefined;
}

/** The document grid: the line pitch and the character space the page is ruled for. */
function gridOf(node: XmlNode | undefined): DocPageSetup["grid"] | undefined {
  if (!node) return undefined;
  const grid: NonNullable<DocPageSetup["grid"]> = {};
  const type = attr(node, "type");
  const linePitch = positive(attr(node, "linePitch"));
  const charSpace = Number(attr(node, "charSpace"));
  if (type) grid.type = type;
  if (linePitch !== undefined) grid.linePitch = linePitch;
  if (Number.isFinite(charSpace) && charSpace !== 0) grid.charSpace = charSpace;
  return Object.keys(grid).length ? grid : undefined;
}

/** Where the page numbers start, and the format they are written in. */
function pageNumberOf(node: XmlNode | undefined): DocPageSetup["pageNumber"] | undefined {
  if (!node) return undefined;
  const numbering: NonNullable<DocPageSetup["pageNumber"]> = {};
  const start = positive(attr(node, "start"));
  const format = attr(node, "fmt");
  if (start !== undefined) numbering.start = start;
  if (format) numbering.format = format;
  return Object.keys(numbering).length ? numbering : undefined;
}

/** A header paragraph whose only text sits inside a watermark shape, such as Word's diagonal "DRAFT". */
function watermarkFrom(node: XmlNode): DocParagraph | undefined {
  const raw = serialize("p", node);
  if (!/id="PowerPlusWaterMarkObject"/i.test(raw)) return undefined;
  const shape = ordered(node)
    .filter((item) => item.name === "r")
    .flatMap((item) => ordered(item.node))
    .flatMap((item) => (item.name === "pict" ? ordered(item.node) : []))
    .find((item) => item.name === "shape");
  const path = shape ? child(shape.node, "textpath") : undefined;
  const label = path ? attr(path, "string") ?? text(path) : "";
  if (!label) return undefined;
  return { runs: [{ text: label, watermark: true, color: "#d0d0d0", fontSize: 48 }] };
}

function storyFrom(context: Context, section: XmlNode, refName: string, rootName: string, type = "default"): { paragraphs: DocParagraph[]; part?: string } {
  const ref = children(section, refName).find((item) => (attr(item, "type") ?? "default") === type);
  const id = ref ? attr(ref, "id") : undefined;
  if (!id) return { paragraphs: [] };
  const target = context.rels.get(id);
  if (!target) return { paragraphs: [] };
  const path = partPath(target);
  const xml = context.archive.getText(path);
  if (!xml) return { paragraphs: [] };
  const root = child(parseXml(xml), rootName);
  return { paragraphs: children(root, "p").map((node) => watermarkFrom(node) ?? paragraphFrom(node, context)), part: path };
}

/** Reads word/comments.xml. The body of each comment is the text shown beside its anchor. */
function commentsFrom(archive: OfficeArchive): DocComment[] {
  const xml = archive.getText("word/comments.xml");
  if (!xml) return [];
  const root = child(parseXml(xml), "comments");
  if (!root) return [];
  const found: DocComment[] = [];
  for (const item of children(root, "comment")) {
    const id = attr(item, "id");
    if (!id) continue;
    const body = children(item, "p").map((paragraph) => visibleText(paragraph).trim()).filter(Boolean).join(" ");
    if (body) found.push({ id, author: attr(item, "author") ?? "", text: body });
  }
  return found;
}

function partPath(target: string): string {
  const clean = target.replace(/^\.?\.\//, "");
  return clean.startsWith("word/") ? clean : `word/${clean}`;
}

function relationships(archive: OfficeArchive, part = "word/_rels/document.xml.rels"): Map<string, string> {
  const map = new Map<string, string>();
  const xml = archive.getText(part);
  if (!xml) return map;
  const root = child(parseXml(xml), "Relationships");
  for (const item of children(root, "Relationship")) {
    const id = attr(item, "Id");
    const target = attr(item, "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

/** The theme's color scheme and font scheme, so a run that names one resolves to a real color or face. */
function themeOf(archive: OfficeArchive): DocTheme | undefined {
  const xml = archive.getText("word/theme/theme1.xml");
  if (!xml) return undefined;
  const root = child(parseXml(xml), "theme");
  const elements = root ? child(root, "themeElements") : undefined;
  if (!elements) return undefined;
  const colors: Record<string, string> = {};
  const scheme = child(elements, "clrScheme");
  for (const item of ordered(scheme ?? {})) {
    const hex = srgb(item.node);
    if (hex) colors[item.name] = hex;
  }
  const fonts: DocTheme["fonts"] = {};
  const schemeFonts = child(elements, "fontScheme");
  for (const script of ["majorFont", "minorFont"]) {
    const group = schemeFonts ? child(schemeFonts, script) : undefined;
    if (!group) continue;
    const latin = child(group, "latin");
    const latinFace = latin ? attr(latin, "typeface") : undefined;
    if (latinFace && !fonts.latin) fonts.latin = latinFace;
    const eastAsia = child(group, "ea");
    const eastAsiaFace = eastAsia ? attr(eastAsia, "typeface") : undefined;
    if (eastAsiaFace && !fonts.eastAsia) fonts.eastAsia = eastAsiaFace;
  }
  if (!Object.keys(colors).length && !fonts.latin && !fonts.eastAsia) return undefined;
  return { colors, fonts };
}

/** The srgb color a theme color carries, as #rrggbb. A sysClr falls back to its lastClr. */
function srgb(node: XmlNode): string | undefined {
  const direct = child(node, "srgbClr");
  const value = direct ? attr(direct, "val") : undefined;
  if (value && /^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`;
  const system = child(node, "sysClr");
  const fallback = system ? attr(system, "lastClr") : undefined;
  if (fallback && /^[0-9a-fA-F]{6}$/.test(fallback)) return `#${fallback.toLowerCase()}`;
  return undefined;
}

/** Named styles, the document defaults, and the latent styles, from styles.xml. */
function styleTable(archive: OfficeArchive): DocStyleTable {
  const xml = archive.getText("word/styles.xml");
  if (!xml) return { styles: {} };
  const root = child(parseXml(xml), "styles");
  if (!root) return { styles: {} };
  const styles: Record<string, DocStyle> = {};
  for (const item of children(root, "style")) {
    const id = attr(item, "styleId");
    if (!id) continue;
    const style: DocStyle = {};
    const kind = attr(item, "type");
    if (kind === "character" || kind === "table") style.type = kind;
    const based = child(item, "basedOn");
    const basedOn = based ? attr(based, "val") : undefined;
    if (basedOn) style.basedOn = basedOn;
    const linked = child(item, "link");
    const link = linked ? attr(linked, "val") : undefined;
    if (link) style.link = link;
    const props = child(item, "pPr");
    const align = props ? child(props, "jc") : undefined;
    const value = align ? attr(align, "val") : undefined;
    if (value === "center" || value === "right" || value === "both" || value === "left") style.align = value;
    const run = child(item, "rPr");
    if (run) Object.assign(style, runProps(run));
    styles[id] = style;
  }
  const defaults = defaultsOf(child(root, "docDefaults"));
  const latent = latentOf(child(root, "latentStyles"));
  return { styles, ...(defaults ? { defaults } : {}), ...(latent.length ? { latent } : {}) };
}

/** The formatting a run or a paragraph gets when it names no style. */
function defaultsOf(node: XmlNode | undefined): DocDefaults | undefined {
  if (!node) return undefined;
  const defaults_ = child(node, "rPrDefault");
  const run = defaults_ ? child(defaults_, "rPr") : undefined;
  const props = run ? runProps(run) : {};
  const defaults: DocDefaults = {};
  if (props.font) defaults.font = props.font;
  if (props.fontSize) defaults.fontSize = props.fontSize;
  if (props.bold) defaults.bold = true;
  if (props.italic) defaults.italic = true;
  if (props.color) defaults.color = props.color;
  return Object.keys(defaults).length ? defaults : undefined;
}

/** Styles Word builds the first time they are used, named and counted. */
function latentOf(node: XmlNode | undefined): DocLatentStyle[] {
  if (!node) return [];
  const found: DocLatentStyle[] = [];
  for (const item of children(node, "lsdException")) {
    const name = attr(item, "name");
    if (!name) continue;
    const count = Number(attr(item, "count"));
    found.push(Number.isFinite(count) && count > 0 ? { name, count } : { name });
  }
  return found;
}

/** A picture bullet, keyed by its `numPicBulletId`, with the image bytes it points at. */
function pictureBullets(root: XmlNode, archive: OfficeArchive): Map<string, NonNullable<DocNumberingLevel["picture"]>> {
  const found = new Map<string, NonNullable<DocNumberingLevel["picture"]>>();
  for (const item of children(root, "numPicBullet")) {
    const id = attr(item, "numPicBulletId");
    if (!id) continue;
    const drawing = child(item, "drawing");
    const frame = drawing ? child(drawing, "inline") ?? child(drawing, "anchor") : undefined;
    const graphic = frame ? child(frame, "graphic") : undefined;
    const data = graphic ? child(graphic, "graphicData") : undefined;
    const blip = data ? child(data, "pic") : undefined;
    const fill = blip ? child(blip, "blipFill") : undefined;
    const embed = fill ? attr(child(fill, "blip") ?? {}, "embed") : undefined;
    const shape = child(item, "pict");
    const outline = shape ? child(shape, "shape") : undefined;
    const imagedata = outline ? child(outline, "imagedata") : undefined;
    const rel = embed ?? (imagedata ? attr(imagedata, "id") : undefined);
    if (!rel) continue;
    const target = relationships(archive, "word/_rels/numbering.xml.rels").get(rel);
    const bytes = target ? archive.files.get(partPath(target)) : undefined;
    found.set(id, { image: rel, ...(bytes ? { imageBytes: bytes, imageType: imageType(target ?? "") } : {}) });
  }
  return found;
}

function numberingTable(archive: OfficeArchive): DocNumberingTable {
  const xml = archive.getText("word/numbering.xml");
  if (!xml) return {};
  const root = child(parseXml(xml), "numbering");
  if (!root) return {};
  const pictures = pictureBullets(root, archive);
  const abstracts = new Map<string, DocNumberingLevel[]>();
  for (const item of children(root, "abstractNum")) {
    const id = attr(item, "abstractNumId");
    if (!id) continue;
    const levels: DocNumberingLevel[] = [];
    for (const level of children(item, "lvl")) {
      const index = Number(attr(level, "ilvl") ?? "0");
      const textNode = child(level, "lvlText");
      const value = textNode ? attr(textNode, "val") ?? "" : "";
      const bullet = value && !value.includes("%") ? value : undefined;
      const startNode = child(level, "start");
      const formatNode = child(level, "numFmt");
      const startAt = Number(startNode ? attr(startNode, "val") ?? "" : "");
      const format = formatNode ? attr(formatNode, "val") : undefined;
      const pictureId = child(level, "lvlPicBulletId");
      const picture = pictureId ? pictures.get(attr(pictureId, "val") ?? "") : undefined;
      levels[Number.isFinite(index) ? index : 0] = {
        text: value,
        ...(bullet ? { bullet } : {}),
        ...(picture ? { picture } : {}),
        ...(Number.isFinite(startAt) && startAt !== 1 ? { start: startAt } : {}),
        ...(format && format !== "decimal" && format !== "bullet" ? { format } : {}),
      };
    }
    abstracts.set(id, levels);
  }
  const table: DocNumberingTable = {};
  for (const item of children(root, "num")) {
    const id = attr(item, "numId");
    const ref = child(item, "abstractNumId");
    const abstractId = ref ? attr(ref, "val") : undefined;
    if (id && abstractId && abstracts.has(abstractId)) table[id] = abstracts.get(abstractId)!;
  }
  return table;
}

function paragraphFrom(node: XmlNode, context: Context, verbatim: Array<{ name: string; node: XmlNode }> = [], blockIndex = -1, carried?: { instruction: string[]; result: string[]; started: boolean; open: boolean }): DocParagraph {
  const props = child(node, "pPr");
  const paragraph: DocParagraph = { runs: [] };
  if (props) applyParagraphProps(paragraph, props, context);
  let link: string | undefined;
  let bookmark: string | undefined;
  let field = carried;
  const seen = new Map<string, number>();
  const take = (item: { name: string; node: XmlNode }): number => {
    const key = `${item.name}\u0000${signatureOf(item.node)}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return occurrence;
  };
  for (const item of ordered(node)) {
    const here = take(item);
    const markup = blockIndex < 0 ? "" : keptAt(verbatim, blockIndex, [[item.name, signatureOf(item.node), here]]);
    if (item.name === "ins" || item.name === "moveTo") {
      paragraph.runs.push(...changedRuns(item.node, context, link, bookmark, "insert", markup));
    } else if (item.name === "del" || item.name === "moveFrom") {
      paragraph.runs.push(...changedRuns(item.node, context, link, bookmark, "delete", markup));
    } else if (MOVE_RANGES.has(item.name)) {
      paragraph.runs.push(moveRangeRun(item.name, item.node, markup));
    } else if (item.name === "r") {
      const runs = runsFrom(item.node, context, link, bookmark, verbatim, blockIndex, [[item.name, signatureOf(item.node), here]]);
      const open = field && field.open ? field : undefined;
      if (open) {
        for (const run of runs) {
          if (run.field === "begin") {
            field = { instruction: [], result: [], started: false, open: true };
          } else if (run.field === "separate") {
            open.started = true;
          } else if (run.field === "end") {
            paragraph.runs.push(fieldRun(fieldInstruction(open.instruction), open.result.join(""), {}, bookmark));
            open.instruction.length = 0;
            open.result.length = 0;
            open.started = false;
            open.open = false;
            field = undefined;
          } else if (open.started) open.result.push(run.text);
          else if (run.field && run.field !== "separate" && run.field !== "end") open.instruction.push(run.field);
        }
      } else {
        const begins = runs.findIndex((run) => run.field === "begin");
        if (begins < 0) paragraph.runs.push(...runs);
        else {
          paragraph.runs.push(...runs.slice(0, begins));
          const opening = carried ?? { instruction: [] as string[], result: [] as string[], started: false, open: true };
          opening.open = true;
          field = opening;
          if (carried) Object.assign(carried, opening);
          for (const run of runs.slice(begins + 1)) {
            if (run.field === "separate") opening.started = true;
            else if (run.field && run.field !== "end") opening.instruction.push(run.field);
            else if (opening.started) opening.result.push(run.text);
          }
        }
      }
    } else if (item.name === "fldSimple") {
      const instruction = attr(item.node, "instr") ?? "";
      const result = ordered(item.node)
        .filter((inner) => inner.name === "r")
        .flatMap((inner) => runsFrom(inner.node, context, link, bookmark))
        .map((run) => run.text)
        .join("");
      paragraph.runs.push(fieldRun(instruction.trim(), result, {}, bookmark));
    } else if (item.name === "ruby") {
      paragraph.runs.push(rubyRun(item.node, bookmark));
    } else if (KEPT_INLINE.has(item.name)) {
      const shown = item.name === "object" ? visibleText(item.node).trim() : "";
      paragraph.runs.push({ text: shown, raw: markup || serialize(item.name, item.node), ...(bookmark ? { bookmark } : {}) });
    } else if (item.name === "hyperlink") {
      const id = attr(item.node, "id");
      const anchor = attr(item.node, "anchor");
      const target = id ? context.rels.get(id) : anchor ? `#${anchor}` : undefined;
      const previous = link;
      link = target ?? link;
      const innerSeen = new Map<string, number>();
      for (const inner of ordered(item.node)) {
        const innerKey = `${inner.name}\u0000${signatureOf(inner.node)}`;
        const innerOccurrence = innerSeen.get(innerKey) ?? 0;
        innerSeen.set(innerKey, innerOccurrence + 1);
        if (inner.name === "r") paragraph.runs.push(...runsFrom(inner.node, context, link, bookmark, verbatim, blockIndex, [[item.name, signatureOf(item.node), here], [inner.name, signatureOf(inner.node), innerOccurrence]]));
      }
      link = previous;
    } else if (item.name === "bookmarkStart") {
      bookmark = attr(item.node, "name");
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

function applyParagraphProps(paragraph: DocParagraph, props: XmlNode, context: Context): void {
  const style = child(props, "pStyle");
  const styleName = style ? attr(style, "val") : undefined;
  if (styleName) paragraph.style = styleName;
  const align = child(props, "jc");
  const value = align ? attr(align, "val") : undefined;
  if (value === "center" || value === "right" || value === "both" || value === "distribute" || value === "left") {
    paragraph.align = value as DocAlign;
  }
  const numbering = child(props, "numPr");
  if (numbering) {
    const id = child(numbering, "numId");
    const level = child(numbering, "ilvl");
    const numId = id ? attr(id, "val") : undefined;
    if (numId && numId !== "0") {
      paragraph.numbering = { id: numId, level: Number(level ? attr(level, "val") : "0") || 0 };
    }
  }
  const spacing = spacingFrom(child(props, "spacing"));
  if (spacing) paragraph.spacing = spacing;
  const indent = indentFrom(child(props, "ind"));
  if (indent) paragraph.indent = indent;
  const shading = colorOf(child(props, "shd"));
  if (shading) paragraph.shading = shading;
  const border = borderOf(child(props, "pBdr"));
  if (border) paragraph.border = border;
  if (child(props, "pageBreakBefore")) paragraph.pageBreakBefore = true;
  if (on(child(props, "keepNext"))) paragraph.keepNext = true;
  if (on(child(props, "keepLines"))) paragraph.keepLines = true;
  if (on(child(props, "widowControl"))) paragraph.widowControl = true;
  if (on(child(props, "suppressLineNumbers"))) paragraph.noLineNumbers = true;
  const outline = child(props, "outlineLvl");
  const outlineLevel = Number(outline ? attr(outline, "val") : undefined);
  if (Number.isFinite(outlineLevel) && outlineLevel >= 0) paragraph.outline = outlineLevel;
  const kept = PARAGRAPH_MARKS.filter((name) => on(child(props, name)));
  if (kept.length) paragraph.marks = kept;
  const frame = frameOf(child(props, "framePr"));
  if (frame) paragraph.frame = frame;
  const direction = directionOf(child(props, "textDirection"));
  if (direction) paragraph.direction = direction;
  const aligned = child(props, "textAlignment");
  const alignedValue = aligned ? attr(aligned, "val") : undefined;
  if (alignedValue) paragraph.textAlign = alignedValue;
  const wrap = child(props, "textboxTightWrap");
  const wrapValue = wrap ? attr(wrap, "val") : undefined;
  if (wrapValue) paragraph.tightWrap = wrapValue;
  const div = child(props, "divId");
  const divValue = div ? attr(div, "val") : undefined;
  if (divValue) paragraph.divId = divValue;
  const rowStyle = child(props, "cnfStyle");
  const rowStyleValue = rowStyle ? attr(rowStyle, "val") : undefined;
  if (rowStyleValue) paragraph.rowStyle = rowStyleValue;
  const tabs = child(props, "tabs");
  if (tabs) {
    const stops: Array<{ pos: number; align?: "center" | "right" | "decimal"; leader?: string }> = [];
    for (const tab of children(tabs, "tab")) {
      const pos = Number(attr(tab, "pos"));
      if (!Number.isFinite(pos)) continue;
      const align = attr(tab, "val");
      const leader = attr(tab, "leader");
      const stop: { pos: number; align?: "center" | "right" | "decimal"; leader?: string } = { pos };
      if (align === "center" || align === "right" || align === "decimal") stop.align = align;
      if (leader) stop.leader = leader;
      stops.push(stop);
    }
    if (stops.length) paragraph.tabs = stops;
  }
}

function spacingFrom(node: XmlNode | undefined): DocSpacing | undefined {
  if (!node) return undefined;
  const spacing: DocSpacing = {};
  const before = positive(attr(node, "before"));
  const after = positive(attr(node, "after"));
  const line = positive(attr(node, "line"));
  if (before !== undefined) spacing.before = before;
  if (after !== undefined) spacing.after = after;
  if (line !== undefined) {
    spacing.line = line;
    const rule = attr(node, "lineRule");
    if (rule === "exact" || rule === "atLeast" || rule === "auto") spacing.lineRule = rule;
  }
  return Object.keys(spacing).length ? spacing : undefined;
}

function indentFrom(node: XmlNode | undefined): DocIndent | undefined {
  if (!node) return undefined;
  const indent: DocIndent = {};
  const left = positive(attr(node, "left") ?? attr(node, "start"));
  const right = positive(attr(node, "right") ?? attr(node, "end"));
  const first = positive(attr(node, "firstLine"));
  const hanging = positive(attr(node, "hanging"));
  if (left !== undefined) indent.left = left;
  if (right !== undefined) indent.right = right;
  if (first !== undefined) indent.firstLine = first;
  if (hanging !== undefined) indent.hanging = hanging;
  return Object.keys(indent).length ? indent : undefined;
}

/** Runs inside a tracked change. The text is readable; the original markup is what gets written back. */
function changedRuns(node: XmlNode, context: Context, link: string | undefined, bookmark: string | undefined, kind: "insert" | "delete", markup = ""): DocRun[] {
  const name = kind === "insert" ? "ins" : "del";
  const raw = markup || serialize(name, node);
  const runs = children(node, "r").flatMap((run) => runsFrom(run, context, link, bookmark));
  if (!runs.length) return [{ text: "", raw, ...(kind === "delete" ? { deleted: true } : { inserted: true }) }];
  return runs.map((run, index) => ({ ...run, ...(index === 0 ? { raw } : {}), ...(kind === "delete" ? { deleted: true } : { inserted: true }) }));
}

function signatureOf(node: XmlNode): string {
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
const KEPT_INLINE = new Set(["footnoteReference", "endnoteReference", "object", "pict", "fldSimple", "commentRangeStart", "commentRangeEnd", "bookmarkEnd", "smartTag"]);

/** A move range marks where a tracked move begins and ends. The text between the marks is read with the move itself. */
const MOVE_RANGES = new Set(["moveFromRangeStart", "moveFromRangeEnd", "moveToRangeStart", "moveToRangeEnd"]);

/** One end of a move range, kept so writing puts the marker back where it was. */
function moveRangeRun(name: string, node: XmlNode, markup: string): DocRun {
  const kind = name.startsWith("moveFrom") ? "moveFrom" : "moveTo";
  const edge = name.endsWith("Start") ? "start" : "end";
  return { text: "", moveRange: { kind, edge, id: attr(node, "id") ?? "0", raw: markup || serialize(name, node) } };
}

/** Turns a field instruction into the run that shows its result. */
function fieldRun(instruction: string, result: string, shared: Omit<DocRun, "text">, bookmark: string | undefined): DocRun {
  const run: DocRun = { ...shared, text: result, field: instruction, ...(bookmark ? { bookmark } : {}) };
  const citation = /^\s*CITATION\s+(\S+)(?:\s+\\p\s+(\S+))?/i.exec(instruction);
  if (citation?.[1]) run.citation = { source: citation[1], ...(citation[2] ? { pages: citation[2] } : {}) };
  const caption = /^\s*SEQ\s+(\S+)/i.exec(instruction);
  if (caption?.[1]) run.caption = caption[1];
  const entry = /^\s*XE\s+"([^"]+)"(?:\s+\\t\s+"([^"]+)")?/i.exec(instruction);
  if (entry?.[1]) run.indexEntry = { text: entry[1], ...(entry[2] ? { see: entry[2] } : {}) };
  return run;
}

/** The words between a field's begin and its separate, which is the instruction. */
function fieldInstruction(parts: string[]): string {
  return parts.join("").replace(/\s+/g, " ").trim();
}

function runsFrom(node: XmlNode, context: Context, link: string | undefined, bookmark: string | undefined, verbatim: Array<{ name: string; node: XmlNode }> = [], blockIndex = -1, path: Array<[string, string, number]> = []): DocRun[] {
  const shared = runProps(child(node, "rPr"));
  if (link) shared.link = link;
  const runs: DocRun[] = [];
  let pending: { breakBefore?: DocBreak; tabBefore?: boolean } = {};
  let usedBookmark = false;
  const seen = new Map<string, number>();
  const take = (item: { name: string; node: XmlNode }): number => {
    const key = `${item.name}\u0000${signatureOf(item.node)}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return occurrence;
  };
  for (const item of ordered(node)) {
    const markup = blockIndex < 0 ? "" : keptAt(verbatim, blockIndex, [...path, [item.name, signatureOf(item.node), take(item)]]);
    if (item.name === "br") {
      const kind = attr(item.node, "type");
      pending.breakBefore = kind === "page" ? "page" : kind === "column" ? "column" : "line";
    } else if (item.name === "cr") {
      runs.push(runWith(shared, "\n", pending, !usedBookmark ? bookmark : undefined));
      usedBookmark = true;
      pending = {};
    } else if (item.name === "tab" || item.name === "ptab") {
      pending.tabBefore = true;
    } else if (item.name === "t") {
      const value = text(item.node);
      if (value || pending.breakBefore || pending.tabBefore) {
        runs.push(runWith(shared, value, pending, !usedBookmark ? bookmark : undefined));
        usedBookmark = true;
        pending = {};
      }
    } else if (item.name === "instrText") {
      runs.push({ ...shared, text: "", field: text(item.node) });
    } else if (item.name === "fldChar") {
      if (pending.breakBefore || pending.tabBefore) {
        runs.push(runWith(shared, "", pending, !usedBookmark ? bookmark : undefined));
        usedBookmark = true;
        pending = {};
      }
      runs.push({ text: "", field: attr(item.node, "fldCharType") ?? "begin" });
    } else if (item.name === "delText") {
      const value = text(item.node);
      if (value) runs.push(runWith(shared, value, pending, !usedBookmark ? bookmark : undefined));
    } else if (item.name === "drawing") {
      const image = imageFrom(item.node, context);
      const wrap = wrapOf(node);
      if (image) {
        runs.push({ ...shared, text: "", ...image, ...(wrap ? { wrap } : {}), ...pending, ...(!usedBookmark && bookmark ? { bookmark } : {}) });
        usedBookmark = true;
        pending = {};
      }
    } else if (item.name === "sym") {
      const char = attr(item.node, "char");
      const code = char ? Number.parseInt(char, 16) : NaN;
      if (Number.isFinite(code)) {
        const run = runWith(shared, String.fromCodePoint(code), pending, !usedBookmark ? bookmark : undefined);
        run.raw = markup || serialize("sym", item.node);
        runs.push(run);
        usedBookmark = true;
        pending = {};
      }
    } else if (item.name === "ruby") {
      runs.push(rubyRun(item.node, !usedBookmark ? bookmark : undefined));
      usedBookmark = true;
      pending = {};
    } else if (item.name === "commentReference") {
      runs.push(runWith(shared, text(item.node), pending, !usedBookmark ? bookmark : undefined));
      const run = runs[runs.length - 1]!;
      run.raw = markup || serialize(item.name, item.node);
      const id = attr(item.node, "id");
      if (id) run.comment = id;
    } else if (KEPT_INLINE.has(item.name)) {
      runs.push(runWith(shared, text(item.node), pending, !usedBookmark ? bookmark : undefined));
      runs[runs.length - 1]!.raw = markup || serialize(item.name, item.node);
      usedBookmark = true;
      pending = {};
    }
  }
  return runs;
}

/** Ruby text: the base is the run's text, the guide is the pronunciation shown above it. */
function rubyRun(node: XmlNode, bookmark: string | undefined): DocRun {
  const base = child(node, "rubyBase");
  const guide = child(node, "rt");
  return {
    text: base ? visibleText(base) : "",
    ruby: guide ? visibleText(guide) : "",
    ...(bookmark ? { bookmark } : {}),
  };
}

function runWith(
  shared: Omit<DocRun, "text">,
  value: string,
  pending: { breakBefore?: DocBreak; tabBefore?: boolean },
  bookmark: string | undefined,
): DocRun {
  return {
    ...shared,
    text: value,
    ...(pending.breakBefore ? { breakBefore: pending.breakBefore } : {}),
    ...(pending.tabBefore ? { tabBefore: true } : {}),
    ...(bookmark ? { bookmark } : {}),
  };
}

function runProps(props: XmlNode | undefined): Omit<DocRun, "text"> {
  if (!props) return {};
  const shared: Omit<DocRun, "text"> = {};
  if (on(child(props, "b"))) shared.bold = true;
  if (on(child(props, "i"))) shared.italic = true;
  const underline = child(props, "u");
  if (underline) {
    const value = attr(underline, "val");
    if (value && value !== "none") shared.underline = UNDERLINES.has(value as DocUnderline) ? (value as DocUnderline) : "single";
    const color = hexColor(attr(underline, "color"));
    if (color) shared.underlineColor = color;
  }
  if (on(child(props, "strike"))) shared.strike = true;
  if (on(child(props, "dstrike"))) shared.doubleStrike = true;
  const runStyle = child(props, "rStyle");
  const runStyleName = runStyle ? attr(runStyle, "val") : undefined;
  if (runStyleName) shared.runStyle = runStyleName;
  if (on(child(props, "caps"))) shared.caps = true;
  if (on(child(props, "smallCaps"))) shared.smallCaps = true;
  if (on(child(props, "vanish"))) shared.hidden = true;
  const emphasis = child(props, "em");
  const emphasisMark = emphasis ? attr(emphasis, "val") : undefined;
  if (emphasisMark && emphasisMark !== "none") shared.emphasis = emphasisMark;
  const lang = child(props, "lang");
  const langValue = lang ? attr(lang, "val") ?? attr(lang, "eastAsia") : undefined;
  if (langValue) shared.lang = langValue;
  const kern = Number(child(props, "kern") ? attr(child(props, "kern")!, "val") : undefined);
  if (Number.isFinite(kern) && kern > 0) shared.kern = kern;
  const kept = RUN_MARKS.filter((name) => on(child(props, name)));
  if (kept.length) shared.marks = kept;
  const border = borderOf(child(props, "bdr"));
  if (border) shared.border = border;
  const shading = colorOf(child(props, "shd"));
  if (shading) shared.shading = shading;
  const fit = child(props, "fitText");
  const fitWidth = positive(fit ? attr(fit, "val") : undefined);
  if (fitWidth !== undefined) shared.fitText = fitWidth;
  const layout = eastAsianLayoutOf(child(props, "eastAsianLayout"));
  if (layout) shared.eastAsianLayout = layout;
  const vert = child(props, "vertAlign");
  const vertValue = vert ? attr(vert, "val") : undefined;
  if (vertValue === "superscript" || vertValue === "subscript") shared.vertAlign = vertValue;
  const highlight = child(props, "highlight");
  const highlightName = highlight ? attr(highlight, "val") : undefined;
  if (highlightName && HIGHLIGHTS[highlightName]) shared.highlight = HIGHLIGHTS[highlightName];
  const size = child(props, "sz");
  const halfPoints = Number(size ? attr(size, "val") : undefined);
  if (Number.isFinite(halfPoints) && halfPoints > 0) shared.fontSize = halfPoints / 2;
  const sizeCs = child(props, "szCs");
  const halfPointsCs = Number(sizeCs ? attr(sizeCs, "val") : undefined);
  if (Number.isFinite(halfPointsCs) && halfPointsCs > 0) shared.fontSizeCs = halfPointsCs / 2;
  if (on(child(props, "bCs"))) shared.boldCs = true;
  if (on(child(props, "iCs"))) shared.italicCs = true;
  const fonts = child(props, "rFonts");
  const font = fonts ? attr(fonts, "ascii") ?? attr(fonts, "hAnsi") : undefined;
  const themeFont = fonts ? themeFace(attr(fonts, "asciiTheme") ?? attr(fonts, "hAnsiTheme"), "latin") : undefined;
  if (font || themeFont) shared.font = font || themeFont;
  const eastAsia = fonts ? attr(fonts, "eastAsia") : undefined;
  const themeEastAsia = fonts ? themeFace(attr(fonts, "eastAsiaTheme"), "eastAsia") : undefined;
  const resolvedEastAsia = eastAsia || themeEastAsia;
  if (resolvedEastAsia && resolvedEastAsia !== (font || themeFont)) shared.fontEastAsia = resolvedEastAsia;
  const color = themeColorOf(child(props, "color"));
  if (color.color) shared.color = color.color;
  if (color.colorAuto) shared.colorAuto = true;
  if (color.themeColor) shared.themeColor = color.themeColor;
  const scale = Number(child(props, "w") ? attr(child(props, "w")!, "val") : undefined);
  if (Number.isFinite(scale) && scale > 0 && scale !== 100) shared.scale = scale;
  const spacing = Number(child(props, "spacing") ? attr(child(props, "spacing")!, "val") : undefined);
  if (Number.isFinite(spacing) && spacing !== 0) shared.spacing = spacing;
  const position = Number(child(props, "position") ? attr(child(props, "position")!, "val") : undefined);
  if (Number.isFinite(position) && position !== 0) shared.position = position;
  return shared;
}

/** The wrap element a drawing carries, so text can flow around it. */
function wrapOf(node: XmlNode): DocRun["wrap"] {
  const drawing = child(node, "drawing");
  const anchor = drawing ? child(drawing, "anchor") : undefined;
  if (!anchor) return undefined;
  if (child(anchor, "wrapSquare")) return "square";
  if (child(anchor, "wrapTight")) return "tight";
  if (child(anchor, "wrapNone")) return attr(anchor, "behindDoc") === "1" ? "behind" : "front";
  return undefined;
}

/** A toggle element is on unless its val is "0", "false", or "off". */
function on(node: XmlNode | undefined): boolean {
  if (!node) return false;
  const value = attr(node, "val");
  return value !== "0" && value !== "false" && value !== "off";
}

const BORDER_STYLES = new Set(["single", "double", "dotted", "dashed", "dash", "wave", "thick", "nil", "none"]);

/** A border read one side at a time, keeping each side's line and width. */
function borderOf(node: XmlNode | undefined): DocBorder | undefined {
  if (!node) return undefined;
  const border: DocBorder = {};
  for (const side of BORDER_SIDES) {
    const edge = borderSide(child(node, side));
    if (edge) border[side] = edge;
  }
  return Object.keys(border).length ? border : undefined;
}

function borderSide(node: XmlNode | undefined): DocBorderSide | undefined {
  if (!node) return undefined;
  const side: DocBorderSide = {};
  const style = attr(node, "val");
  const size = positive(attr(node, "sz"));
  if (style && BORDER_STYLES.has(style)) side.style = style;
  else if (style && style !== "nil" && style !== "none") side.style = "single";
  if (size !== undefined) side.size = size;
  const color = hexColor(attr(node, "color"));
  if (color) side.color = color;
  return Object.keys(side).length ? side : undefined;
}

/** A paragraph frame: its size, where it sits, and how text wraps it. */
function frameOf(node: XmlNode | undefined): DocFrame | undefined {
  if (!node) return undefined;
  const frame: DocFrame = {};
  const width = positive(attr(node, "w"));
  const height = positive(attr(node, "h"));
  const x = Number(attr(node, "x"));
  const y = Number(attr(node, "y"));
  if (width !== undefined) frame.width = width;
  if (height !== undefined) frame.height = height;
  if (Number.isFinite(x)) frame.x = x;
  if (Number.isFinite(y)) frame.y = y;
  const anchorX = attr(node, "hAnchor");
  const anchorY = attr(node, "vAnchor");
  const wrap = attr(node, "wrap");
  if (anchorX) frame.anchorX = anchorX;
  if (anchorY) frame.anchorY = anchorY;
  if (wrap) frame.wrap = wrap;
  const drop = attr(node, "dropCap");
  const lines = Number(attr(node, "lines"));
  if ((drop === "drop" || drop === "margin") && Number.isFinite(lines) && lines > 0) {
    const space = positive(attr(node, "hSpace"));
    frame.dropCap = space !== undefined ? { lines, space } : { lines };
  }
  return Object.keys(frame).length ? frame : undefined;
}

/** A text direction, mapped onto the three directions the page already uses. */
function directionOf(node: XmlNode | undefined): "lr" | "tb" | "rl" | undefined {
  const flow = node ? attr(node, "val") : undefined;
  if (flow === "tbRl" || flow === "btLr") return "tb";
  if (flow === "rlTb" || flow === "lrTbV") return "rl";
  if (flow === "lrTb") return "lr";
  return undefined;
}

/** East-asian layout: characters combined into one cell, turned vertical, or squeezed onto one line. */
function eastAsianLayoutOf(node: XmlNode | undefined): DocRun["eastAsianLayout"] | undefined {
  if (!node) return undefined;
  const layout: NonNullable<DocRun["eastAsianLayout"]> = {};
  const id = attr(node, "id");
  if (id) layout.id = id;
  if (attr(node, "combine") === "1" || attr(node, "combine") === "true") layout.combine = true;
  if (attr(node, "vert") === "1" || attr(node, "vert") === "true") layout.vert = true;
  if (attr(node, "vertCompress") === "1" || attr(node, "vertCompress") === "true") layout.twoInOne = true;
  return Object.keys(layout).length ? layout : undefined;
}

function colorOf(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  return hexColor(attr(node, "fill") ?? attr(node, "color") ?? attr(node, "val"));
}

function hexColor(hex: string | undefined): string | undefined {
  if (!hex || hex === "auto" || !/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return `#${hex.toLowerCase()}`;
}

/** A run color that names a theme slot or `auto`, which a plain color does not. */
function themeColorOf(node: XmlNode | undefined): { color?: string; colorAuto?: boolean; themeColor?: string } {
  if (!node) return {};
  const found: { color?: string; colorAuto?: boolean; themeColor?: string } = {};
  const theme = attr(node, "themeColor");
  if (theme) found.themeColor = theme;
  const hex = attr(node, "val");
  if (hex === "auto") found.colorAuto = true;
  else if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) found.color = `#${hex.toLowerCase()}`;
  return found;
}

/** A theme font slot, mapped onto the face this model stores. Only the two faces the theme reader fills are named. */
function themeFace(slot: string | undefined, face: "latin" | "eastAsia"): string | undefined {
  if (slot === "majorAscii" || slot === "majorHAnsi" || slot === "majorEastAsia") return face === "eastAsia" ? "theme:eastAsia" : "theme:latin";
  if (slot === "minorAscii" || slot === "minorHAnsi" || slot === "minorEastAsia") return face === "eastAsia" ? "theme:eastAsia" : "theme:latin";
  return undefined;
}

function positive(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

interface Picture {
  image: string;
  imageBytes?: Uint8Array;
  imageType?: string;
  imageWidth?: number;
  imageHeight?: number;
  crop?: DocRun["crop"];
}

function imageFrom(drawing: XmlNode, context: Context): Picture | undefined {
  const inline = child(drawing, "inline") ?? child(drawing, "anchor");
  const graphic = inline ? child(inline, "graphic") : undefined;
  const data = graphic ? child(graphic, "graphicData") : undefined;
  const picture = data ? child(data, "pic") : undefined;
  const fill = picture ? child(picture, "blipFill") : undefined;
  const blip = fill ? child(fill, "blip") : undefined;
  const id = blip ? attr(blip, "embed") : undefined;
  if (!id) return undefined;
  const extent = inline ? child(inline, "extent") : undefined;
  const width = Number(extent ? attr(extent, "cx") : undefined);
  const height = Number(extent ? attr(extent, "cy") : undefined);
  const target = context.rels.get(id);
  const crop = cropOf(fill);
  const result: Picture = {
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
function cropOf(fill: XmlNode | undefined): Picture["crop"] {
  const rect = fill ? child(fill, "srcRect") : undefined;
  if (!rect) return undefined;
  const edge = (name: string): number | undefined => {
    const value = Number(attr(rect, name));
    return Number.isFinite(value) && value > 0 ? value / 1000 : undefined;
  };
  const crop = { left: edge("l"), top: edge("t"), right: edge("r"), bottom: edge("b") };
  return crop.left || crop.top || crop.right || crop.bottom ? crop : undefined;
}

function imageType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  if (ext === "svg") return "image/svg+xml";
  return "image/png";
}

function tableFrom(node: XmlNode, context: Context): DocTable {
  const lines = children(node, "tr");
  const table: DocTable = {
    rows: lines.map((row) => children(row, "tc").map((cell) => cellFrom(cell, context))),
  };
  const grid = child(node, "tblGrid");
  const widths = grid ? children(grid, "gridCol").map((column) => Number(attr(column, "w"))).filter((width) => Number.isFinite(width) && width > 0) : [];
  if (widths.length) table.widths = widths;
  const heights = lines.map(rowHeight);
  if (heights.some((height) => height !== undefined)) table.rowHeights = heights.map((height) => height?.value ?? 0);
  const rules = heights.map((height) => height?.rule);
  if (rules.some((rule) => rule !== undefined)) table.rowRules = rules;
  const props = lines[0] ? child(lines[0], "trPr") : undefined;
  if (props && child(props, "tblHeader")) table.header = true;
  return table;
}

/** A row's height in twips, and whether it is exact or a minimum. */
function rowHeight(row: XmlNode): { value: number; rule?: "exact" | "atLeast" } | undefined {
  const props = child(row, "trPr");
  const height = props ? child(props, "trHeight") : undefined;
  if (!height) return undefined;
  const value = Number(attr(height, "val"));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const rule = attr(height, "hRule");
  return rule === "exact" || rule === "atLeast" ? { value, rule } : { value };
}

/** Paragraphs a cell holds, including those nested in a content control or a formula. */
function cellParagraphs(node: XmlNode, context: Context): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];
  for (const item of ordered(node)) {
    const name = item.name.includes(":") ? item.name.slice(item.name.indexOf(":") + 1) : item.name;
    if (name === "p") paragraphs.push(paragraphFrom(item.node, context));
    else if (name !== "tcPr" && name !== "pPr") paragraphs.push(...cellParagraphs(item.node, context));
  }
  return paragraphs;
}

function cellFrom(node: XmlNode, context: Context): DocCell {
  const props = child(node, "tcPr");
  const cell: DocCell = { paragraphs: cellParagraphs(node, context) };
  const span = props ? child(props, "gridSpan") : undefined;
  const spanValue = Number(span ? attr(span, "val") : undefined);
  if (Number.isFinite(spanValue) && spanValue > 1) cell.span = spanValue;
  const merge = props ? child(props, "vMerge") : undefined;
  if (merge) {
    const value = attr(merge, "val");
    cell.vMerge = value === "restart" ? "restart" : "continue";
  }
  const shading = colorOf(props ? child(props, "shd") : undefined);
  if (shading) cell.shading = shading;
  const border = props ? borderOf(child(props, "tcBorders")) : undefined;
  if (border) cell.border = border;
  const align = props ? child(props, "vAlign") : undefined;
  const aligned = align ? attr(align, "val") : undefined;
  if (aligned === "center" || aligned === "bottom" || aligned === "top") cell.align = aligned;
  return cell;
}

function assertOpenXml(bytes: Uint8Array): void {
  if (bytes.length < OLE_MAGIC.length) return;
  if (!OLE_MAGIC.every((byte, index) => bytes[index] === byte)) return;
  if (contains(bytes, ENCRYPTED)) {
    throw new DocxOpenError("ENCRYPTED_DOCX", "Password-protected .docx is not supported; remove the password and try again");
  }
  throw new DocxOpenError("LEGACY_DOC", "Legacy .doc (97-2003 binary) is not supported; please open or save as .docx");
}

function contains(bytes: Uint8Array, needle: Uint8Array): boolean {
  for (let index = 0; index <= bytes.length - needle.length * 2; index += 2) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset * 2] !== needle[offset] || bytes[index + offset * 2 + 1] !== 0) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

async function toBytes(input: ArrayBuffer | Uint8Array | Blob): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}
