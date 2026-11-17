import { isDocTable, type DocBlock, type DocParagraph, type DocRun, type Document } from "@sliiu/document-core";

/**
 * Puts the edited story back into word/document.xml.
 * Only paragraph and table-cell text changes. Page setup, headers, and every other part stay as opened.
 */
export function applyDocumentEdits(xml: string, document: Document): string {
  const section = document.sections[0];
  if (!section) return xml;
  const body = bodyRange(xml);
  if (!body) return xml;
  const rebuilt = blocksXml(section.blocks);
  const properties = sectionProperties(xml.slice(body.start, body.end));
  return xml.slice(0, body.start) + rebuilt + properties + xml.slice(body.end);
}

function bodyRange(xml: string): { start: number; end: number } | undefined {
  const open = /<w:body\b[^>]*>/i.exec(xml);
  const close = open ? xml.indexOf("</w:body>", open.index) : -1;
  if (!open || close < 0) return undefined;
  return { start: open.index + open[0].length, end: close };
}

/** The section properties sit at the end of the body, outside any paragraph. */
function sectionProperties(body: string): string {
  const matches = [...body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/gi)];
  const last = matches[matches.length - 1];
  if (!last || last.index === undefined) return "";
  const before = body.slice(0, last.index);
  return /<w:(?:p|tbl)\b[^>]*>\s*$/i.test(before) ? "" : last[0];
}

function blocksXml(blocks: DocBlock[]): string {
  return blocks.map((block) => (isDocTable(block) ? tableXml(block.rows) : paragraphXml(block))).join("");
}

function tableXml(rows: DocParagraph[][][]): string {
  const body = rows
    .map((row) => `<w:tr>${row.map((cell) => `<w:tc>${cell.map(paragraphXml).join("") || paragraphXml({ runs: [] })}</w:tc>`).join("")}</w:tr>`)
    .join("");
  return `<w:tbl>${body}</w:tbl>`;
}

function paragraphXml(paragraph: DocParagraph): string {
  const style = paragraph.style ? `<w:pStyle w:val="${attr(paragraph.style)}"/>` : "";
  const align = paragraph.align && paragraph.align !== "left" ? `<w:jc w:val="${paragraph.align}"/>` : "";
  const props = style || align ? `<w:pPr>${style}${align}</w:pPr>` : "";
  return `<w:p>${props}${paragraph.runs.map(runXml).join("")}</w:p>`;
}

function runXml(run: DocRun): string {
  if (run.image) return "";
  const bold = run.bold ? "<w:b/>" : "";
  const italic = run.italic ? "<w:i/>" : "";
  const size = run.fontSize ? `<w:sz w:val="${Math.round(run.fontSize * 2)}"/>` : "";
  const color = run.color ? `<w:color w:val="${attr(run.color.replace(/^#/, ""))}"/>` : "";
  const props = bold || italic || size || color ? `<w:rPr>${bold}${italic}${size}${color}</w:rPr>` : "";
  return `<w:r>${props}<w:t xml:space="preserve">${text(run.text)}</w:t></w:r>`;
}

function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(value: string): string {
  return text(value).replace(/"/g, "&quot;");
}
