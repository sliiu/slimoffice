import { isDocParagraph, isDocRaw, isDocTable, type DocComment, type DocNumberingLevel, type DocParagraph, type DocRecipient, type DocSource, type DocStyle, type Document } from "@sliiu/document-core";
import { strFromU8, strToU8, zipSync } from "fflate";
import { applyDocumentEdits, storyPartXml, type Relationship } from "./body";

export { blankDocument } from "./blank";

const RELS = "word/_rels/document.xml.rels";
const NUMBERING = "word/numbering.xml";
const NUMBERING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";
const NUMBERING_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";
const STYLES = "word/styles.xml";
const STYLES_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const STYLES_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml";
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const CONTENT_TYPES = "[Content_Types].xml";
const IMAGE_MIME: Record<string, string> = {
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
export function writeDocx(document: Document): Uint8Array {
  if (!document.source || document.source.size === 0) {
    throw new Error("This document has no original parts to write back");
  }
  const files: Record<string, Uint8Array> = {};
  if (document.edited) {
    withHyphenation(document);
    withProtection(document);
  }
  for (const [path, bytes] of document.source) files[path] = bytes;
  const story = document.source.get("word/document.xml");
  if (document.edited && story) {
    const relationships = readRelationships(document.source.get(RELS));
    const pictures = pictureRelationships(document, relationships);
    const numbering = numberingPart(document, relationships);
    const styles = stylesPart(document, relationships);
    const extras = referenceParts(document);
    const notes = noteParts(document);
    const comments = commentPart(document, relationships);
    const edited = applyDocumentEdits(withBackground(strFromU8(story), document), document, relationships);
    const stories = storyParts(document, edited.parts, new Set(document.source?.keys() ?? []));
    files["word/document.xml"] = strToU8(edited.xml);
    for (const [path, xml] of notes.files) files[path] = strToU8(xml);
    for (const [path, xml] of stories) files[path] = strToU8(xml);
    if (comments.xml) files[COMMENTS] = strToU8(comments.xml);
    const added = [...edited.added, ...pictures.added, ...(numbering.relationship ? [numbering.relationship] : []), ...(styles.relationship ? [styles.relationship] : []), ...extras.relationships, ...notes.relationships, ...(comments.relationship ? [comments.relationship] : [])];
    if (numbering.xml) files[NUMBERING] = strToU8(numbering.xml);
    if (styles.xml) files[STYLES] = strToU8(styles.xml);
    for (const [path, xml] of extras.files) files[path] = strToU8(xml);
    if (added.length) files[RELS] = strToU8(addRelationships(strFromU8(files[RELS] ?? new Uint8Array()), added));
    const types = [...pictures.types, ...(numbering.override ? ["numbering"] : []), ...(styles.override ? ["styles"] : []), ...extras.types, ...notes.types, ...edited.parts, ...(comments.override ? ["comment"] : [])];
    if (types.length) files[CONTENT_TYPES] = strToU8(addContentTypes(strFromU8(files[CONTENT_TYPES] ?? new Uint8Array()), types));
  }
  return zipSync(files);
}

/** A picture inserted after the file was opened keeps its bytes in the package but has no relationship yet. */
function pictureRelationships(document: Document, relationships: Relationship[]): { added: Relationship[]; types: string[] } {
  const known = new Set(relationships.map((item) => item.id));
  const added: Relationship[] = [];
  const types: string[] = [];
  const seen = new Set<string>();
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (isDocTable(block) || isDocRaw(block)) continue;
      for (const run of block.runs) {
        if (!run.image || known.has(run.image) || seen.has(run.image)) continue;
        const stored = storedPicture(document, run.image);
        if (!stored) continue;
        seen.add(run.image);
        added.push({ id: run.image, type: IMAGE_REL, target: stored.target, external: false });
        types.push(stored.extension);
      }
    }
  }
  return { added, types };
}

function storedPicture(document: Document, id: string): { target: string; extension: string } | undefined {
  const source = document.source;
  if (!source) return undefined;
  const prefix = `word/media/${id}.`;
  for (const path of source.keys()) {
    if (!path.startsWith(prefix)) continue;
    const extension = path.slice(prefix.length).toLowerCase();
    if (!IMAGE_MIME[extension]) continue;
    return { target: path.slice("word/".length), extension };
  }
  return undefined;
}

/**
 * Writes numbering definitions the story points at that the original numbering.xml does not have,
 * which is how a list started inside the editor survives a round trip.
 */
function numberingPart(document: Document, relationships: Relationship[]): { xml?: string; relationship?: Relationship; override: boolean } {
  const used = numberingIds(document);
  if (!used.size) return { override: false };
  const existing = document.source?.get(NUMBERING);
  const xml = existing ? strFromU8(existing) : "";
  const present = new Set([...xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"/gi)].map((match) => match[1]!));
  const missing = [...used].filter((id) => /^\d+$/.test(id) && !present.has(id));
  if (!missing.length) return { override: false };
  const nextAbstract = Math.max(0, ...[...xml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"/gi)].map((match) => Number(match[1]))) + 1;
  const built = missing.map((id, index) => abstractXml(nextAbstract + index, document.numbering?.[id] ?? [])).join("");
  const nums = missing.map((id, index) => `<w:num w:numId="${id}"><w:abstractNumId w:val="${nextAbstract + index}"/></w:num>`).join("");
  const linked = relationships.some((item) => item.type === NUMBERING_REL);
  const relationship = linked ? undefined : { id: freshId(relationships), type: NUMBERING_REL, target: "numbering.xml", external: false };
  if (/<\/w:numbering>/i.test(xml)) return { xml: xml.replace(/<\/w:numbering>/i, `${built}${nums}</w:numbering>`), relationship, override: !existing };
  return {
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${built}${nums}</w:numbering>`,
    relationship,
    override: true,
  };
}

/**
 * Writes a style the story uses that the original styles.xml does not define,
 * so a style applied inside the editor keeps its formatting on the way back out.
 */
function stylesPart(document: Document, relationships: Relationship[]): { xml?: string; relationship?: Relationship; override: boolean } {
  const used = styleIds(document);
  if (!used.size) return { override: false };
  const existing = document.source?.get(STYLES);
  const xml = existing ? strFromU8(existing) : "";
  const present = new Set([...xml.matchAll(/<w:style\b[^>]*w:styleId="([^"]*)"/gi)].map((match) => match[1]!));
  const missing = [...used].filter((id) => !present.has(id) && document.styles?.[id]);
  if (!missing.length) return { override: false };
  const built = missing.map((id) => styleXml(id, document.styles?.[id])).join("");
  const linked = relationships.some((item) => item.type === STYLES_REL);
  const relationship = linked ? undefined : { id: freshId(relationships), type: STYLES_REL, target: "styles.xml", external: false };
  if (/<\/w:styles>/i.test(xml)) return { xml: xml.replace(/<\/w:styles>/i, `${built}</w:styles>`), relationship, override: !existing };
  return {
    xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${built}</w:styles>`,
    relationship,
    override: true,
  };
}

function styleIds(document: Document): Set<string> {
  const ids = new Set<string>();
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (!isDocTable(block) && !isDocRaw(block) && block.style) ids.add(block.style);
    }
  }
  return ids;
}

function styleXml(id: string, style: DocStyle | undefined): string {
  if (!style) return "";
  const based = style.basedOn ? `<w:basedOn w:val="${escapeAttr(style.basedOn)}"/>` : "";
  const align = style.align && style.align !== "left" ? `<w:pPr><w:jc w:val="${style.align}"/></w:pPr>` : "";
  const run: string[] = [];
  if (style.bold) run.push("<w:b/>");
  if (style.italic) run.push("<w:i/>");
  if (style.font) run.push(`<w:rFonts w:ascii="${escapeAttr(style.font)}" w:hAnsi="${escapeAttr(style.font)}"/>`);
  if (style.fontSize) run.push(`<w:sz w:val="${Math.round(style.fontSize * 2)}"/>`);
  if (style.color) run.push(`<w:color w:val="${escapeAttr(style.color.replace(/^#/, ""))}"/>`);
  const runProps = run.length ? `<w:rPr>${run.join("")}</w:rPr>` : "";
  return `<w:style w:type="paragraph" w:styleId="${escapeAttr(id)}"><w:name w:val="${escapeAttr(id)}"/>${based}${align}${runProps}</w:style>`;
}

function numberingIds(document: Document): Set<string> {
  const ids = new Set<string>();
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (!isDocTable(block) && !isDocRaw(block) && block.numbering) ids.add(block.numbering.id);
    }
  }
  return ids;
}

function abstractXml(id: number, levels: DocNumberingLevel[]): string {
  const defined = levels.length ? levels : [{ text: "%1." }];
  const body = defined
    .map((level, index) => {
      const text = level?.text || "%1.";
      const format = level?.format || (level?.bullet || !text.includes("%") ? "bullet" : "decimal");
      const start = level?.start && level.start !== 1 ? level.start : 1;
      return `<w:lvl w:ilvl="${index}"><w:start w:val="${start}"/><w:numFmt w:val="${escapeAttr(format)}"/><w:lvlText w:val="${escapeAttr(text)}"/></w:lvl>`;
    })
    .join("");
  return `<w:abstractNum w:abstractNumId="${id}">${body}</w:abstractNum>`;
}

const CUSTOM_XML_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml";

/**
 * Writes the bibliography and the mail-merge recipient list into custom XML parts when the
 * document carries them and the package does not already.
 */
function referenceParts(document: Document): { files: Array<[string, string]>; relationships: Relationship[]; types: string[] } {
  const files: Array<[string, string]> = [];
  const relationships: Relationship[] = [];
  let next = nextItem(document);
  if (document.sources?.length && !hasCustom(document, "b:sources")) {
    const path = `customXml/item${next}.xml`;
    files.push([path, sourcesXml(document.sources)]);
    relationships.push({ id: `rIdSrc${next}`, type: CUSTOM_XML_REL, target: `../${path}`, external: false });
    next += 1;
  }
  if (document.recipients?.length && !hasCustom(document, "recipients")) {
    const path = `customXml/item${next}.xml`;
    files.push([path, recipientsXml(document.recipients)]);
    relationships.push({ id: `rIdRecipients${next}`, type: CUSTOM_XML_REL, target: `../${path}`, external: false });
  }
  return { files, relationships, types: files.length ? ["customXml"] : [] };
}

function nextItem(document: Document): number {
  const used = [...(document.source?.keys() ?? [])]
    .map((path) => /^customXml\/item(\d+)\.xml$/i.exec(path)?.[1])
    .filter((value): value is string => !!value)
    .map(Number);
  return Math.max(0, ...used) + 1;
}

function hasCustom(document: Document, rootName: string): boolean {
  for (const [path, bytes] of document.source ?? []) {
    if (!/^customXml\/item\d+\.xml$/i.test(path)) continue;
    if (new RegExp(`<(?:[\\w-]+:)?${rootName}\\b`).test(strFromU8(bytes))) return true;
  }
  return false;
}

function sourcesXml(sources: DocSource[]): string {
  const body = sources
    .map((item) => {
      const names = item.authors
        .split(/\s*,\s*/)
        .map((person) => {
          const parts = person.trim().split(/\s+/);
          const last = parts.at(-1) ?? person;
          const first = parts.slice(0, -1).join(" ");
          return `<b:person><b:last>${escapeXml(last)}</b:last><b:first>${escapeXml(first)}</b:first></b:person>`;
        })
        .join("");
      const publisher = item.publisher ? `<b:publisher>${escapeXml(item.publisher)}</b:publisher>` : "";
      return `<b:source><b:tag>${escapeXml(item.tag)}</b:tag><b:sourceType>${escapeXml(item.type)}</b:sourceType><b:title>${escapeXml(item.title)}</b:title><b:year>${escapeXml(item.year)}</b:year>${publisher}<b:author><b:nameList>${names}</b:nameList></b:author></b:source>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><b:sources xmlns:b="http://schemas.openxmlformats.org/officeDocument/2006/bibliography">${body}</b:sources>`;
}

function recipientsXml(recipients: DocRecipient[]): string {
  const body = recipients
    .map((recipient) => {
      const columns = Object.entries(recipient.fields)
        .map(([name, value]) => `<${safeName(name)}>${escapeXml(value)}</${safeName(name)}>`)
        .join("");
      return `<recipient>${columns}</recipient>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><recipients>${body}</recipients>`;
}

const HEADER_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml";
const FOOTER_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

/** Writes each header and footer. An existing story goes back to its part; a new one uses the path the section reference was given. */
function storyParts(document: Document, created: string[], used: Set<string>): Array<[string, string]> {
  const files: Array<[string, string]> = [];
  const pending = [...created];
  const take = (kind: "header" | "footer"): string | undefined => {
    const index = pending.findIndex((path) => path.startsWith(`word/${kind}`));
    if (index >= 0) return pending.splice(index, 1)[0];
    let next = 1;
    while (used.has(`word/${kind}${next}.xml`)) next += 1;
    const path = `word/${kind}${next}.xml`;
    used.add(path);
    return path;
  };
  const write = (paragraphs: DocParagraph[] | undefined, part: string | undefined, root: "hdr" | "ftr") => {
    if (!paragraphs?.length) return;
    const path = part ?? take(root === "hdr" ? "header" : "footer");
    if (path) files.push([path, storyPartXml(root, paragraphs)]);
  };
  for (const section of document.sections) {
    write(section.header, section.headerPart, "hdr");
    write(section.firstHeader, section.firstHeaderPart, "hdr");
    write(section.evenHeader, section.evenHeaderPart, "hdr");
    write(section.footer, section.footerPart, "ftr");
    write(section.firstFooter, section.firstFooterPart, "ftr");
    write(section.evenFooter, section.evenFooterPart, "ftr");
  }
  return files;
}

const COMMENTS = "word/comments.xml";
const COMMENT_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const COMMENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";

/** Writes word/comments.xml from the comments the model holds, and links it when the package has none. */
function commentPart(document: Document, relationships: Relationship[]): { xml?: string; relationship?: Relationship; override: boolean } {
  const comments = document.comments ?? [];
  if (!comments.length) return { override: false };
  const existing = document.source?.has(COMMENTS) ?? false;
  const linked = relationships.some((item) => item.type === COMMENT_REL);
  return {
    xml: commentsXml(comments),
    relationship: linked ? undefined : { id: freshId(relationships), type: COMMENT_REL, target: "comments.xml", external: false },
    override: !existing,
  };
}

function commentsXml(comments: DocComment[]): string {
  const body = comments
    .map((comment) => `<w:comment w:id="${escapeAttr(comment.id)}" w:author="${escapeAttr(comment.author)}"><w:p><w:r><w:t xml:space="preserve">${escapeXml(comment.text)}</w:t></w:r></w:p></w:comment>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:comments>`;
}

const FOOTNOTE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
const ENDNOTE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/endnotes";
const FOOTNOTE_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml";
const ENDNOTE_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml";

/** Writes footnote and endnote bodies back. A note added in the editor gets a new part; an edited one replaces the text inside the original. */
function noteParts(document: Document): { files: Array<[string, string]>; relationships: Relationship[]; types: string[] } {
  const collected = collectNotes(document);
  const files: Array<[string, string]> = [];
  const relationships: Relationship[] = [];
  const types: string[] = [];
  const write = (kind: "footnote" | "endnote", path: string, type: string, rel: string) => {
    const notes = collected.get(kind);
    if (!notes?.size) return;
    const existing = document.source?.get(path);
    if (existing) {
      let xml = strFromU8(existing);
      for (const [id, text] of notes) xml = replaceNoteText(xml, kind, id, text);
      files.push([path, xml]);
      return;
    }
    files.push([path, notePartXml(kind, notes)]);
    relationships.push({ id: freshId([]), type: rel, target: path.slice("word/".length), external: false });
    types.push(kind);
  };
  write("footnote", "word/footnotes.xml", FOOTNOTE_TYPE, FOOTNOTE_REL);
  write("endnote", "word/endnotes.xml", ENDNOTE_TYPE, ENDNOTE_REL);
  return { files, relationships, types };
}

function collectNotes(document: Document): Map<"footnote" | "endnote", Map<string, string>> {
  const found = new Map<"footnote" | "endnote", Map<string, string>>();
  for (const section of document.sections) {
    for (const block of section.blocks) {
      if (!isDocParagraph(block) || !block.note) continue;
      const bucket = found.get(block.note.kind) ?? new Map<string, string>();
      bucket.set(block.note.id, block.runs.filter((run) => !run.deleted).map((run) => run.text).join(""));
      found.set(block.note.kind, bucket);
    }
  }
  return found;
}

/** Replaces the text of one note, keeping its reference marker and the rest of the part. */
function replaceNoteText(xml: string, kind: string, id: string, value: string): string {
  const pattern = new RegExp(`(<w:${kind}\\b[^>]*w:id="${id}"[^>]*>)([\\s\\S]*?)(</w:${kind}>)`, "i");
  return xml.replace(pattern, (_match, open: string, body: string, close: string) => {
    const marker = new RegExp(`<w:${kind}Ref\\b[^>]*/>`, "i").exec(body)?.[0] ?? "";
    return `${open}<w:p>${marker}<w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>${close}`;
  });
}

function notePartXml(kind: "footnote" | "endnote", notes: Map<string, string>): string {
  const root = kind === "footnote" ? "footnotes" : "endnotes";
  const body = [...notes.entries()]
    .map(([id, value]) => `<w:${kind} w:id="${id}"><w:p><w:r><w:${kind}Ref/></w:r><w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p></w:${kind}>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${root} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${body}</w:${root}>`;
}

function safeName(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9_]/g, "");
  return /^[A-Za-z_]/.test(clean) ? clean : `f${clean}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function freshId(relationships: Relationship[]): string {
  const used = new Set(relationships.map((item) => item.id));
  let next = used.size + 1;
  while (used.has(`rId${next}`)) next += 1;
  return `rId${next}`;
}

/** Hyphenation lives in word/settings.xml. The part is created when the document did not have one. */
function withHyphenation(document: Document): void {
  const source = document.source;
  if (!source) return;
  const settings = source.get("word/settings.xml");
  if (!settings) {
    if (document.hyphenation) source.set("word/settings.xml", strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:autoHyphenation w:val="true"/></w:settings>`));
    return;
  }
  const stripped = strFromU8(settings).replace(/<w:autoHyphenation\b[^>]*\/>/gi, "");
  const next = document.hyphenation ? stripped.replace(/<\/w:settings>/i, `<w:autoHyphenation w:val="true"/></w:settings>`) : stripped;
  source.set("word/settings.xml", strToU8(next));
}

/** Read only protection lives in word/settings.xml, next to hyphenation. */
function withProtection(document: Document): void {
  const source = document.source;
  if (!source) return;
  const settings = source.get("word/settings.xml");
  const text = settings ? strFromU8(settings) : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:settings>`;
  const stripped = text.replace(/<w:documentProtection\b[^>]*\/>/gi, "");
  const next = document.readOnly ? stripped.replace(/<\/w:settings>/i, `<w:documentProtection w:edit="readOnly"/></w:settings>`) : stripped;
  if (next !== text || !settings) source.set("word/settings.xml", strToU8(next));
}

/** Page color lives on w:background, one per document, not inside a section. */
function withBackground(xml: string, document: Document): string {
  const color = document.sections.find((section) => section.page.background)?.page.background;
  const stripped = xml.replace(/<w:background\b[^>]*\/>/gi, "").replace(/<w:background\b[\s\S]*?<\/w:background>/gi, "");
  if (!color) return stripped;
  const element = `<w:background w:color="${color.replace(/^#/, "")}"/>`;
  return stripped.replace(/<w:body\b/i, `${element}<w:body`);
}

function readRelationships(bytes: Uint8Array | undefined): Relationship[] {
  if (!bytes) return [];
  const xml = strFromU8(bytes);
  const found: Relationship[] = [];
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/>/gi)) {
    const attrs = match[1] ?? "";
    const id = attribute(attrs, "Id");
    const type = attribute(attrs, "Type");
    const target = attribute(attrs, "Target");
    if (!id || !type || !target) continue;
    found.push({ id, type, target, external: /TargetMode="External"/i.test(attrs) });
  }
  return found;
}

function attribute(source: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]*)"`, "i").exec(source);
  return match ? match[1] : undefined;
}

function addRelationships(xml: string, added: Relationship[]): string {
  const rows = added
    .map((item) => `<Relationship Id="${escapeAttr(item.id)}" Type="${escapeAttr(item.type)}" Target="${escapeAttr(item.target)}"${item.external ? ` TargetMode="External"` : ""}/>`)
    .join("");
  if (/<\/Relationships>/i.test(xml)) return xml.replace(/<\/Relationships>/i, `${rows}</Relationships>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELS_NS}">${rows}</Relationships>`;
}

/** Registers a default content type for each new picture extension that the package does not already name. */
function addContentTypes(xml: string, extensions: string[]): string {
  const fresh = extensions.filter((extension) => !new RegExp(`Extension="${extension}"`, "i").test(xml));
  if (!fresh.length) return xml;
  const rows = [...new Set(fresh)]
    .map((extension) =>
      extension === "numbering"
        ? `<Override PartName="/word/numbering.xml" ContentType="${NUMBERING_TYPE}"/>`
        : extension === "styles"
          ? `<Override PartName="/word/styles.xml" ContentType="${STYLES_TYPE}"/>`
        : extension === "customXml"
          ? `<Default Extension="xml" ContentType="application/xml"/>`
          : extension === "footnote"
            ? `<Override PartName="/word/footnotes.xml" ContentType="${FOOTNOTE_TYPE}"/>`
            : extension === "endnote"
              ? `<Override PartName="/word/endnotes.xml" ContentType="${ENDNOTE_TYPE}"/>`
              : extension.startsWith("word/header")
                ? `<Override PartName="/${extension}" ContentType="${HEADER_TYPE}"/>`
                : extension.startsWith("word/footer")
                  ? `<Override PartName="/${extension}" ContentType="${FOOTER_TYPE}"/>`
                  : extension === "comment"
                    ? `<Override PartName="/word/comments.xml" ContentType="${COMMENT_TYPE}"/>`
                    : `<Default Extension="${extension}" ContentType="${IMAGE_MIME[extension]}"/>`,
    )
    .join("");
  if (/<\/Types>/i.test(xml)) return xml.replace(/<\/Types>/i, `${rows}</Types>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${rows}</Types>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
