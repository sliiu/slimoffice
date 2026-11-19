import {
  DEFAULT_PAGE,
  type DocAlign,
  type DocBlock,
  type DocBreak,
  type DocCell,
  type DocIndent,
  type DocNumberingLevel,
  type DocNumberingTable,
  type DocPageSetup,
  type DocParagraph,
  type DocRun,
  type DocSection,
  type DocSpacing,
  type DocTable,
  type DocUnderline,
  type Document,
} from "@sliiu/document-core";
import { loadArchive, type OfficeArchive } from "./zip";
import { attr, child, children, ordered, parseXml, text, type XmlNode } from "./xml";

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

interface Context {
  archive: OfficeArchive;
  rels: Map<string, string>;
  numbering: DocNumberingTable;
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
  const context: Context = { archive, rels: relationships(archive), numbering: numberingTable(archive) };
  const background = colorOf(root ? child(root, "background") : undefined);
  const sections = sectionsFrom(body, context);
  if (background) {
    for (const section of sections) section.page.background = background;
  }
  return {
    sections,
    ...(Object.keys(context.numbering).length ? { numbering: context.numbering } : {}),
    source: archive.files,
  };
}

function sectionsFrom(body: XmlNode, context: Context): DocSection[] {
  const sections: DocSection[] = [];
  let blocks: DocBlock[] = [];
  for (const item of ordered(body)) {
    if (item.name === "p") {
      const props = child(item.node, "pPr");
      const section = props ? child(props, "sectPr") : undefined;
      blocks.push(paragraphFrom(item.node, context));
      if (section) {
        sections.push(sectionFrom(section, blocks, context));
        blocks = [];
      }
    } else if (item.name === "tbl") {
      blocks.push(tableFrom(item.node, context));
    } else if (item.name === "sectPr") {
      sections.push(sectionFrom(item.node, blocks, context));
      blocks = [];
    }
  }
  if (blocks.length) sections.push({ page: { ...DEFAULT_PAGE }, header: [], footer: [], blocks });
  return sections.length ? sections : [{ page: { ...DEFAULT_PAGE }, header: [], footer: [], blocks: [] }];
}

function sectionFrom(node: XmlNode, blocks: DocBlock[], context: Context): DocSection {
  return {
    page: pageFrom(node),
    header: storyFrom(context, node, "headerReference", "hdr"),
    footer: storyFrom(context, node, "footerReference", "ftr"),
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
  };
}

function storyFrom(context: Context, section: XmlNode, refName: string, rootName: string): DocParagraph[] {
  const ref = children(section, refName)[0];
  const id = ref ? attr(ref, "id") : undefined;
  if (!id) return [];
  const target = context.rels.get(id);
  if (!target) return [];
  const xml = context.archive.getText(partPath(target));
  if (!xml) return [];
  const root = child(parseXml(xml), rootName);
  return children(root, "p").map((node) => paragraphFrom(node, context));
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
      levels[Number.isFinite(index) ? index : 0] = { text: value, ...(bullet ? { bullet } : {}) };
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

function paragraphFrom(node: XmlNode, context: Context): DocParagraph {
  const props = child(node, "pPr");
  const paragraph: DocParagraph = { runs: [] };
  if (props) applyParagraphProps(paragraph, props, context);
  let link: string | undefined;
  let bookmark: string | undefined;
  for (const item of ordered(node)) {
    if (item.name === "r") paragraph.runs.push(...runsFrom(item.node, context, link, bookmark));
    else if (item.name === "hyperlink") {
      const id = attr(item.node, "id");
      const anchor = attr(item.node, "anchor");
      const target = id ? context.rels.get(id) : anchor ? `#${anchor}` : undefined;
      const previous = link;
      link = target ?? link;
      for (const inner of ordered(item.node)) {
        if (inner.name === "r") paragraph.runs.push(...runsFrom(inner.node, context, link, bookmark));
      }
      link = previous;
    } else if (item.name === "bookmarkStart") {
      bookmark = attr(item.node, "name");
    }
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
  if (child(props, "pageBreakBefore")) paragraph.pageBreakBefore = true;
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

function runsFrom(node: XmlNode, context: Context, link: string | undefined, bookmark: string | undefined): DocRun[] {
  const shared = runProps(child(node, "rPr"));
  if (link) shared.link = link;
  const runs: DocRun[] = [];
  let pending: { breakBefore?: DocBreak; tabBefore?: boolean } = {};
  let usedBookmark = false;
  for (const item of ordered(node)) {
    if (item.name === "br") {
      const kind = attr(item.node, "type");
      pending.breakBefore = kind === "page" ? "page" : kind === "column" ? "column" : "line";
    } else if (item.name === "tab" || item.name === "ptab") {
      pending.tabBefore = true;
    } else if (item.name === "t") {
      const value = text(item.node);
      if (value || pending.breakBefore || pending.tabBefore) {
        runs.push(runWith(shared, value, pending, !usedBookmark ? bookmark : undefined));
        usedBookmark = true;
        pending = {};
      }
    } else if (item.name === "drawing") {
      const image = imageFrom(item.node, context);
      if (image) {
        runs.push({ ...shared, text: "", ...image, ...pending, ...(!usedBookmark && bookmark ? { bookmark } : {}) });
        usedBookmark = true;
        pending = {};
      }
    } else if (item.name === "sym") {
      const char = attr(item.node, "char");
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
  if (on(child(props, "strike")) || on(child(props, "dstrike"))) shared.strike = true;
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
  const font = fonts ? attr(fonts, "ascii") ?? attr(fonts, "hAnsi") ?? attr(fonts, "eastAsia") : undefined;
  if (font) shared.font = font;
  const color = colorOf(child(props, "color"));
  if (color) shared.color = color;
  return shared;
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
  return `#${hex.toLowerCase()}`;
}

function positive(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

interface Picture {
  image: string;
  imageBytes?: Uint8Array;
  imageType?: string;
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
  const target = context.rels.get(id);
  const result: Picture = { image: id };
  if (target) {
    const bytes = context.archive.files.get(partPath(target));
    if (bytes) {
      result.imageBytes = bytes;
      result.imageType = imageType(target);
    }
  }
  return result;
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
  return {
    rows: children(node, "tr").map((row) => children(row, "tc").map((cell) => cellFrom(cell, context))),
  };
}

function cellFrom(node: XmlNode, context: Context): DocCell {
  const props = child(node, "tcPr");
  const cell: DocCell = { paragraphs: children(node, "p").map((item) => paragraphFrom(item, context)) };
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
