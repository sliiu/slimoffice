import {
  isDocTable,
  type DocAlign,
  type DocBlock,
  type DocCell,
  type DocPageSetup,
  type DocParagraph,
  type DocRun,
  type DocSection,
  type Document,
} from "@sliiu/document-core";

/**
 * Puts the edited story back into word/document.xml.
 * Every section is rewritten from the model. Headers, footers, and every other part stay as opened.
 */
export interface Relationship {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

export interface DocumentEdits {
  xml: string;
  /** Relationships the rewritten story points at that the original rels file did not have. */
  added: Relationship[];
}

export function applyDocumentEdits(xml: string, document: Document, relationships: Relationship[] = []): DocumentEdits {
  const body = bodyRange(xml);
  if (!body) return { xml, added: [] };
  const sections = document.sections;
  if (!sections.length) return { xml, added: [] };
  const originals = sectionProperties(xml.slice(body.start, body.end));
  const links = linkIds(relationships);
  const added: Relationship[] = [];
  const next = xml.slice(0, body.start) + sectionsXml(sections, originals, links, added) + xml.slice(body.end);
  return { xml: next, added };
}

function bodyRange(xml: string): { start: number; end: number } | undefined {
  const open = /<w:body\b[^>]*>/i.exec(xml);
  const close = open ? xml.indexOf("</w:body>", open.index) : -1;
  if (!open || close < 0) return undefined;
  return { start: open.index + open[0].length, end: close };
}

/** Every section's original properties, in document order. A sectPr inside a paragraph ends that section; the last one sits on the body. */
function sectionProperties(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/gi)) {
    if (match.index === undefined) continue;
    const before = body.slice(0, match.index);
    if (/<w:(?:p|tbl)\b[^>]*>\s*$/i.test(before)) continue;
    found.push(match[0]);
  }
  return found;
}

interface LinkIds {
  byTarget: Map<string, string>;
  used: Set<string>;
}

function linkIds(relationships: Relationship[]): LinkIds {
  const byTarget = new Map<string, string>();
  const used = new Set<string>();
  for (const item of relationships) {
    used.add(item.id);
    if (item.external) byTarget.set(item.target, item.id);
  }
  return { byTarget, used };
}

function sectionsXml(sections: DocSection[], originals: string[], links: LinkIds, added: Relationship[]): string {
  return sections
    .map((section, index) => {
      const blocks = section.blocks
        .map((block) => (isDocTable(block) ? tableXml(block.rows, links, added) : paragraphXml(block, undefined, links, added)))
        .join("");
      const original = originals[index];
      const properties = original ? mergeSection(original, section.page) : sectionXml(section.page);
      if (index === sections.length - 1) return blocks + properties;
      return blocks + paragraphXml({ runs: [] }, properties, links, added);
    })
    .join("");
}

/** Keeps header and footer references from this section's original sectPr, and writes the page the model holds. */
function mergeSection(original: string, page: DocPageSetup): string {
  const inner = original.replace(/^<w:sectPr\b[^>]*>/i, "").replace(/<\/w:sectPr>\s*$/i, "");
  const kept = inner
    .replace(/<w:pgSz\b[^/]*\/>/gi, "")
    .replace(/<w:pgMar\b[^/]*\/>/gi, "")
    .replace(/<w:cols\b[^/]*\/>/gi, "");
  return `<w:sectPr>${pageXml(page)}${kept}</w:sectPr>`;
}

function sectionXml(page: DocPageSetup): string {
  return `<w:sectPr>${pageXml(page)}</w:sectPr>`;
}

function pageXml(page: DocPageSetup): string {
  const orient = page.landscape ? ` w:orient="landscape"` : "";
  const columns = page.columns && page.columns > 1 ? `<w:cols w:num="${page.columns}"/>` : "";
  return `<w:pgSz w:w="${Math.round(page.width)}" w:h="${Math.round(page.height)}"${orient}/><w:pgMar w:top="${Math.round(page.margin.top)}" w:bottom="${Math.round(page.margin.bottom)}" w:left="${Math.round(page.margin.left)}" w:right="${Math.round(page.margin.right)}"/>${columns}`;
}

function tableXml(rows: DocCell[][], links: LinkIds, added: Relationship[]): string {
  const body = rows
    .map((row) => {
      const cells = row
        .map((cell) => {
          const span = cell.span && cell.span > 1 ? `<w:gridSpan w:val="${cell.span}"/>` : "";
          const merge = cell.vMerge ? `<w:vMerge${cell.vMerge === "restart" ? ` w:val="restart"` : ""}/>` : "";
          const shading = cell.shading ? `<w:shd w:val="clear" w:fill="${attr(cell.shading.replace(/^#/, ""))}"/>` : "";
          const props = span || merge || shading ? `<w:tcPr>${span}${merge}${shading}</w:tcPr>` : "";
          const content = cell.paragraphs.map((paragraph) => paragraphXml(paragraph, undefined, links, added)).join("") || paragraphXml({ runs: [] }, undefined, links, added);
          return `<w:tc>${props}${content}</w:tc>`;
        })
        .join("");
      return `<w:tr>${cells}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${body}</w:tbl>`;
}

function paragraphXml(paragraph: DocParagraph, section: string | undefined, links: LinkIds, added: Relationship[]): string {
  const props: string[] = [];
  if (paragraph.style) props.push(`<w:pStyle w:val="${attr(paragraph.style)}"/>`);
  if (paragraph.align && paragraph.align !== "left") props.push(`<w:jc w:val="${paragraph.align}"/>`);
  if (paragraph.numbering) {
    props.push(`<w:numPr><w:ilvl w:val="${paragraph.numbering.level}"/><w:numId w:val="${attr(paragraph.numbering.id)}"/></w:numPr>`);
  }
  if (paragraph.spacing) props.push(spacingXml(paragraph.spacing));
  if (paragraph.indent) props.push(indentXml(paragraph.indent));
  if (paragraph.shading) props.push(`<w:shd w:val="clear" w:fill="${attr(paragraph.shading.replace(/^#/, ""))}"/>`);
  if (paragraph.pageBreakBefore) props.push("<w:pageBreakBefore/>");
  if (section) props.push(section);
  const head = props.length ? `<w:pPr>${props.join("")}</w:pPr>` : "";
  return `<w:p>${head}${runsXml(paragraph.runs, links, added)}</w:p>`;
}

function spacingXml(spacing: NonNullable<DocParagraph["spacing"]>): string {
  const before = spacing.before !== undefined ? ` w:before="${Math.round(spacing.before)}"` : "";
  const after = spacing.after !== undefined ? ` w:after="${Math.round(spacing.after)}"` : "";
  const line = spacing.line !== undefined ? ` w:line="${Math.round(spacing.line)}"` : "";
  const rule = spacing.lineRule ? ` w:lineRule="${spacing.lineRule}"` : "";
  return `<w:spacing${before}${after}${line}${rule}/>`;
}

function indentXml(indent: NonNullable<DocParagraph["indent"]>): string {
  const left = indent.left !== undefined ? ` w:left="${Math.round(indent.left)}"` : "";
  const right = indent.right !== undefined ? ` w:right="${Math.round(indent.right)}"` : "";
  const first = indent.firstLine !== undefined ? ` w:firstLine="${Math.round(indent.firstLine)}"` : "";
  const hanging = indent.hanging !== undefined ? ` w:hanging="${Math.round(indent.hanging)}"` : "";
  return `<w:ind${left}${right}${first}${hanging}/>`;
}

function runsXml(runs: DocRun[], links: LinkIds, added: Relationship[]): string {
  let out = "";
  let openLink: string | undefined;
  for (const run of runs) {
    if (run.link !== openLink) {
      if (openLink) out += "</w:hyperlink>";
      openLink = run.link;
      if (openLink) out += linkXml(openLink, links, added);
    }
    if (run.bookmark) out += `<w:bookmarkStart w:id="0" w:name="${attr(run.bookmark)}"/>`;
    out += runXml(run);
  }
  if (openLink) out += "</w:hyperlink>";
  return out;
}

const HYPERLINK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";

function linkXml(target: string, links: LinkIds, added: Relationship[]): string {
  if (target.startsWith("#")) return `<w:hyperlink w:anchor="${attr(target.slice(1))}">`;
  if (/^rId\d+$/.test(target)) return `<w:hyperlink r:id="${attr(target)}">`;
  const known = links.byTarget.get(target);
  if (known) return `<w:hyperlink r:id="${attr(known)}">`;
  let next = added.length + links.used.size + 1;
  while (links.used.has(`rId${next}`)) next += 1;
  const id = `rId${next}`;
  links.used.add(id);
  links.byTarget.set(target, id);
  added.push({ id, type: HYPERLINK, target, external: true });
  return `<w:hyperlink r:id="${id}">`;
}

function runXml(run: DocRun): string {
  const lead = `${run.breakBefore ? `<w:br${run.breakBefore === "line" ? "" : ` w:type="${run.breakBefore}"`}/>` : ""}${run.tabBefore ? "<w:tab/>" : ""}`;
  if (run.image) return `<w:r>${lead}${drawingXml(run.image)}</w:r>`;
  const props = runPropsXml(run);
  return `<w:r>${props}${lead}<w:t xml:space="preserve">${text(run.text)}</w:t></w:r>`;
}

function runPropsXml(run: DocRun): string {
  const parts: string[] = [];
  if (run.font) parts.push(`<w:rFonts w:ascii="${attr(run.font)}" w:hAnsi="${attr(run.font)}"/>`);
  if (run.bold) parts.push("<w:b/>");
  if (run.italic) parts.push("<w:i/>");
  if (run.underline) parts.push(`<w:u w:val="${run.underline}"/>`);
  if (run.strike) parts.push("<w:strike/>");
  if (run.vertAlign) parts.push(`<w:vertAlign w:val="${run.vertAlign}"/>`);
  if (run.fontSize) parts.push(`<w:sz w:val="${Math.round(run.fontSize * 2)}"/>`);
  if (run.color) parts.push(`<w:color w:val="${attr(run.color.replace(/^#/, ""))}"/>`);
  if (run.highlight) parts.push(`<w:highlight w:val="${highlightName(run.highlight)}"/>`);
  return parts.length ? `<w:rPr>${parts.join("")}</w:rPr>` : "";
}

const HIGHLIGHT_NAMES: Record<string, string> = {
  "#ffff00": "yellow",
  "#00ff00": "green",
  "#00ffff": "cyan",
  "#ff00ff": "magenta",
  "#0000ff": "blue",
  "#ff0000": "red",
  "#d3d3d3": "lightGray",
  "#a9a9a9": "darkGray",
  "#000000": "black",
};

function highlightName(color: string): string {
  return HIGHLIGHT_NAMES[color.toLowerCase()] ?? "yellow";
}

function drawingXml(id: string): string {
  return `<w:drawing><wp:inline><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${attr(id)}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(value: string): string {
  return text(value).replace(/"/g, "&quot;");
}

export type { DocAlign, DocBlock };
