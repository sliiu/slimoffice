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
  type DocStyle,
  type DocStyleTable,
  type DocSpacing,
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
const PARAGRAPH_MARKS = ["suppressLineNumbers", "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "contextualSpacing", "mirrorIndents", "suppressOverlap"];

/** Run switches the model keeps so a rewrite does not drop them. */
const RUN_MARKS = ["bCs", "iCs", "outline", "shadow", "emboss", "imprint", "effect"];

/** Paragraph elements kept as markup, written back unchanged. */
const PARAGRAPH_KEPT = ["framePr", "textDirection", "textAlignment", "textboxTightWrap", "divId", "cnfStyle"];

/** Run elements kept as markup, written back unchanged. */
const RUN_KEPT = ["szCs", "bdr", "shd", "fitText", "eastAsianLayout"];

/** The original markup of the named children, so a rewrite can put them back. */
function keptXml(props: XmlNode, names: string[]): string[] {
  return ordered(props)
    .filter((item) => names.includes(item.name))
    .map((item) => serialize(item.name, item.node));
}

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
  if (background) {
    for (const section of sections) section.page.background = background;
  }
  const sources = bibliography(archive);
  const recipients = mailRecipients(archive);
  const mailMerge = mailMergeOf(archive);
  const comments = commentsFrom(archive);
  const notes = notesFrom(archive, context);
  attachNotes(sections, notes);
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
    ...(Object.keys(context.styles).length ? { styles: context.styles } : {}),
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
function notesFrom(archive: OfficeArchive, context: Context): Map<string, DocParagraph> {
  const found = new Map<string, DocParagraph>();
  const read = (path: string, kind: "footnote" | "endnote", root: string, ref: string) => {
    const xml = archive.getText(path);
    if (!xml) return;
    const body = child(parseXml(xml), root);
    if (!body) return;
    for (const item of children(body, kind)) {
      const id = attr(item, "id");
      const type = attr(item, "type");
      if (!id || type === "separator" || type === "continuationSeparator") continue;
      const paragraph = paragraphFrom(children(item, "p")[0] ?? item, context);
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
function attachNotes(sections: DocSection[], notes: Map<string, DocParagraph>): void {
  if (!notes.size) return;
  for (const section of sections) {
    const blocks: DocBlock[] = [];
    for (const block of section.blocks) {
      blocks.push(block);
      if (!isDocParagraph(block)) continue;
      for (const run of block.runs) {
        const id = noteId(run.raw);
        const note = id ? notes.get(id) : undefined;
        if (note) blocks.push(note);
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
    } else if (name === "rad") {
      pieces.push({ kind: "root", body: formulaOf(child(item.node, "e") ?? {}), degree: formulaOf(child(item.node, "deg") ?? {}) });
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
  if (child(node, "lnNumType")) extras.lineNumbers = true;
  const borders = child(node, "pgBorders");
  const border = borders ? colorOf(child(borders, "top")) : undefined;
  if (border) extras.border = border;
  const direction = child(node, "textDirection");
  const flow = direction ? attr(direction, "val") : undefined;
  if (flow === "tbRl" || flow === "btLr") extras.direction = "tb";
  else if (flow === "rlTb" || flow === "lrTbV") extras.direction = "rl";
  const type = child(node, "type");
  const start = type ? attr(type, "val") : undefined;
  if (start === "continuous" || start === "evenPage" || start === "oddPage" || start === "nextColumn") extras.break = start;
  else if (start === "nextPage") extras.break = "nextPage";
  return extras;
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

function relationships(archive: OfficeArchive): Map<string, string> {
  const map = new Map<string, string>();
  const xml = archive.getText("word/_rels/document.xml.rels");
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

/** Named paragraph styles, with the formatting they add on top of the one they are based on. */
function styleTable(archive: OfficeArchive): DocStyleTable {
  const xml = archive.getText("word/styles.xml");
  if (!xml) return {};
  const root = child(parseXml(xml), "styles");
  if (!root) return {};
  const table: DocStyleTable = {};
  for (const item of children(root, "style")) {
    const id = attr(item, "styleId");
    if (!id) continue;
    const style: DocStyle = {};
    const based = child(item, "basedOn");
    const basedOn = based ? attr(based, "val") : undefined;
    if (basedOn) style.basedOn = basedOn;
    const props = child(item, "pPr");
    const align = props ? child(props, "jc") : undefined;
    const value = align ? attr(align, "val") : undefined;
    if (value === "center" || value === "right" || value === "both" || value === "left") style.align = value;
    const run = child(item, "rPr");
    if (run) Object.assign(style, runProps(run));
    table[id] = style;
  }
  return table;
}

function numberingTable(archive: OfficeArchive): DocNumberingTable {
  const xml = archive.getText("word/numbering.xml");
  if (!xml) return {};
  const root = child(parseXml(xml), "numbering");
  if (!root) return {};
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
      levels[Number.isFinite(index) ? index : 0] = {
        text: value,
        ...(bullet ? { bullet } : {}),
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
  if (value === "center" || value === "right" || value === "both" || value === "left") {
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
  const border = child(props, "pBdr");
  const borderColor = border ? colorOf(child(border, "top")) : undefined;
  if (borderColor) paragraph.border = borderColor;
  if (child(props, "pageBreakBefore")) paragraph.pageBreakBefore = true;
  if (on(child(props, "keepNext"))) paragraph.keepNext = true;
  if (on(child(props, "keepLines"))) paragraph.keepLines = true;
  if (on(child(props, "widowControl"))) paragraph.widowControl = true;
  const outline = child(props, "outlineLvl");
  const outlineLevel = Number(outline ? attr(outline, "val") : undefined);
  if (Number.isFinite(outlineLevel) && outlineLevel >= 0) paragraph.outline = outlineLevel;
  const kept = PARAGRAPH_MARKS.filter((name) => on(child(props, name)));
  if (kept.length) paragraph.marks = kept;
  const keptMarkup = keptXml(props, PARAGRAPH_KEPT);
  if (keptMarkup.length) paragraph.kept = keptMarkup;
  const tabs = child(props, "tabs");
  if (tabs) {
    const stops: Array<{ pos: number; align?: "center" | "right" | "decimal" }> = [];
    for (const tab of children(tabs, "tab")) {
      const pos = Number(attr(tab, "pos"));
      if (!Number.isFinite(pos)) continue;
      const align = attr(tab, "val");
      stops.push(align === "center" || align === "right" || align === "decimal" ? { pos, align } : { pos });
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
const KEPT_INLINE = new Set(["footnoteReference", "endnoteReference", "ruby", "object", "pict", "fldSimple", "commentRangeStart", "commentRangeEnd", "bookmarkEnd", "smartTag"]);

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
  const keptMarkup = keptXml(props, RUN_KEPT);
  if (keptMarkup.length) shared.kept = keptMarkup;
  const vert = child(props, "vertAlign");
  const vertValue = vert ? attr(vert, "val") : undefined;
  if (vertValue === "superscript" || vertValue === "subscript") shared.vertAlign = vertValue;
  const highlight = child(props, "highlight");
  const highlightName = highlight ? attr(highlight, "val") : undefined;
  if (highlightName && HIGHLIGHTS[highlightName]) shared.highlight = HIGHLIGHTS[highlightName];
  const size = child(props, "sz");
  const halfPoints = Number(size ? attr(size, "val") : undefined);
  if (Number.isFinite(halfPoints) && halfPoints > 0) shared.fontSize = halfPoints / 2;
  const fonts = child(props, "rFonts");
  const font = fonts ? attr(fonts, "ascii") ?? attr(fonts, "hAnsi") : undefined;
  const themeFont = fonts ? themeFace(attr(fonts, "asciiTheme") ?? attr(fonts, "hAnsiTheme"), "latin") : undefined;
  if (font || themeFont) shared.font = font || themeFont;
  const eastAsia = fonts ? attr(fonts, "eastAsia") : undefined;
  const themeEastAsia = fonts ? themeFace(attr(fonts, "eastAsiaTheme"), "eastAsia") : undefined;
  const resolvedEastAsia = eastAsia || themeEastAsia;
  if (resolvedEastAsia && resolvedEastAsia !== (font || themeFont)) shared.fontEastAsia = resolvedEastAsia;
  const color = colorOf(child(props, "color"));
  if (color) shared.color = color;
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

function colorOf(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  const hex = attr(node, "color") ?? attr(node, "val") ?? attr(node, "fill");
  if (!hex || hex === "auto" || !/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const theme = attr(node, "themeColor");
  if (theme) return undefined;
  return `#${hex.toLowerCase()}`;
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
  const table: DocTable = {
    rows: children(node, "tr").map((row) => children(row, "tc").map((cell) => cellFrom(cell, context))),
  };
  const grid = child(node, "tblGrid");
  const widths = grid ? children(grid, "gridCol").map((column) => Number(attr(column, "w"))).filter((width) => Number.isFinite(width) && width > 0) : [];
  if (widths.length) table.widths = widths;
  const first = children(node, "tr")[0];
  const props = first ? child(first, "trPr") : undefined;
  if (props && child(props, "tblHeader")) table.header = true;
  return table;
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
  const borders = props ? child(props, "tcBorders") : undefined;
  const border = borders ? colorOf(child(borders, "top")) : undefined;
  if (border) cell.border = border;
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
