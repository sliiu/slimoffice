import {
  DEFAULT_PAGE,
  type DocBlock,
  type DocPageSetup,
  type DocParagraph,
  type DocRun,
  type DocSection,
  type DocTable,
  type Document,
} from "@document/core";
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

export async function parseDocx(input: ArrayBuffer | Uint8Array | Blob): Promise<Document> {
  const bytes = await toBytes(input);
  assertOpenXml(bytes);
  const archive = loadArchive(bytes);
  const xml = archive.getText("word/document.xml");
  if (!xml) throw new Error("word/document.xml not found");
  const root = child(parseXml(xml), "document");
  const body = root ? child(root, "body") : undefined;
  if (!body) throw new Error("word/document.xml has no body");
  return { sections: sectionsFrom(body, archive), source: archive.files };
}

function sectionsFrom(body: XmlNode, archive: OfficeArchive): DocSection[] {
  const sections: DocSection[] = [];
  let blocks: DocBlock[] = [];
  for (const item of ordered(body)) {
    if (item.name === "p") {
      const props = child(item.node, "pPr");
      const section = props ? child(props, "sectPr") : undefined;
      blocks.push(paragraphFrom(item.node));
      if (section) {
        sections.push(sectionFrom(section, blocks, archive));
        blocks = [];
      }
    } else if (item.name === "tbl") {
      blocks.push(tableFrom(item.node));
    } else if (item.name === "sectPr") {
      sections.push(sectionFrom(item.node, blocks, archive));
      blocks = [];
    }
  }
  if (blocks.length) sections.push({ page: DEFAULT_PAGE, header: [], footer: [], blocks });
  return sections.length ? sections : [{ page: DEFAULT_PAGE, header: [], footer: [], blocks: [] }];
}

function sectionFrom(node: XmlNode, blocks: DocBlock[], archive: OfficeArchive): DocSection {
  return {
    page: pageFrom(node),
    header: storyFrom(archive, node, "headerReference", "hdr"),
    footer: storyFrom(archive, node, "footerReference", "ftr"),
    blocks,
  };
}

function pageFrom(node: XmlNode): DocPageSetup {
  const size = child(node, "pgSz");
  const margin = child(node, "pgMar");
  const number = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    width: number(size ? attr(size, "w") : undefined, DEFAULT_PAGE.width),
    height: number(size ? attr(size, "h") : undefined, DEFAULT_PAGE.height),
    margin: {
      top: number(margin ? attr(margin, "top") : undefined, DEFAULT_PAGE.margin.top),
      bottom: number(margin ? attr(margin, "bottom") : undefined, DEFAULT_PAGE.margin.bottom),
      left: number(margin ? attr(margin, "left") : undefined, DEFAULT_PAGE.margin.left),
      right: number(margin ? attr(margin, "right") : undefined, DEFAULT_PAGE.margin.right),
    },
  };
}

function storyFrom(archive: OfficeArchive, section: XmlNode, refName: string, rootName: string): DocParagraph[] {
  const ref = children(section, refName)[0];
  const id = ref ? attr(ref, "id") : undefined;
  if (!id) return [];
  const target = relationshipTarget(archive, id);
  if (!target) return [];
  const xml = archive.getText(`word/${target.replace(/^\.\.?\//, "")}`);
  if (!xml) return [];
  const root = child(parseXml(xml), rootName);
  return children(root, "p").map(paragraphFrom);
}

function relationshipTarget(archive: OfficeArchive, id: string): string | undefined {
  const xml = archive.getText("word/_rels/document.xml.rels");
  if (!xml) return undefined;
  const root = child(parseXml(xml), "Relationships");
  const match = children(root, "Relationship").find((item) => attr(item, "Id") === id);
  return match ? attr(match, "Target") : undefined;
}

function paragraphFrom(node: XmlNode): DocParagraph {
  const props = child(node, "pPr");
  const style = props ? child(props, "pStyle") : undefined;
  const align = props ? child(props, "jc") : undefined;
  const value = align ? attr(align, "val") : undefined;
  return {
    ...(style && attr(style, "val") ? { style: attr(style, "val") } : {}),
    ...(value === "center" || value === "right" || value === "both" ? { align: value } : {}),
    runs: children(node, "r").flatMap(runsFrom),
  };
}

function runsFrom(node: XmlNode): DocRun[] {
  const props = child(node, "rPr");
  const size = props ? child(props, "sz") : undefined;
  const color = props ? child(props, "color") : undefined;
  const halfPoints = Number(size ? attr(size, "val") : undefined);
  const hex = color ? attr(color, "val") : undefined;
  const shared: Omit<DocRun, "text"> = {
    ...(props && child(props, "b") ? { bold: true } : {}),
    ...(props && child(props, "i") ? { italic: true } : {}),
    ...(Number.isFinite(halfPoints) && halfPoints > 0 ? { fontSize: halfPoints / 2 } : {}),
    ...(hex && /^[0-9a-fA-F]{6}$/.test(hex) ? { color: `#${hex.toLowerCase()}` } : {}),
  };
  const drawing = child(node, "drawing");
  const image = drawing ? imageFrom(drawing) : undefined;
  const runs: DocRun[] = [];
  for (const textNode of children(node, "t")) {
    const value = text(textNode);
    if (value) runs.push({ text: value, ...shared });
  }
  if (image) runs.push({ text: "", image, ...shared });
  return runs;
}

function imageFrom(drawing: XmlNode): string | undefined {
  const inline = child(drawing, "inline") ?? child(drawing, "anchor");
  const graphic = inline ? child(inline, "graphic") : undefined;
  const data = graphic ? child(graphic, "graphicData") : undefined;
  const picture = data ? child(data, "pic") : undefined;
  const fill = picture ? child(picture, "blipFill") : undefined;
  const blip = fill ? child(fill, "blip") : undefined;
  return blip ? attr(blip, "embed") : undefined;
}

function tableFrom(node: XmlNode): DocTable {
  return {
    rows: children(node, "tr").map((row) => children(row, "tc").map((cell) => children(cell, "p").map(paragraphFrom))),
  };
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
