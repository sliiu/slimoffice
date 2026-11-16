import {
  isDocTable,
  type DocBlock,
  type DocPageSetup,
  type DocParagraph,
  type DocSection,
  type DocTable,
  type Document,
} from "@sliiu/document-core";

const TWIP = 96 / 1440;
const LINE = 22;
const TABLE_ROW = 28;

export interface DocPage {
  width: number;
  height: number;
  margin: DocPageSetup["margin"];
  header: DocParagraph[];
  footer: DocParagraph[];
  blocks: DocBlock[];
}

/** Breaks each section into pages. A table stays on one page. */
export function paginate(document: Document): DocPage[] {
  const pages: DocPage[] = [];
  for (const section of document.sections) pages.push(...pagesFor(section));
  return pages.length ? pages : [emptyPage()];
}

function pagesFor(section: DocSection): DocPage[] {
  const content = contentHeight(section.page);
  const pages: DocPage[] = [];
  let blocks: DocBlock[] = [];
  let used = 0;
  const flush = () => {
    pages.push(pageFrom(section, blocks));
    blocks = [];
    used = 0;
  };
  for (const block of section.blocks) {
    const height = blockHeight(block);
    if (blocks.length && used + height > content) flush();
    blocks.push(block);
    used += height;
  }
  if (blocks.length || pages.length === 0) pages.push(pageFrom(section, blocks));
  return pages;
}

function pageFrom(section: DocSection, blocks: DocBlock[]): DocPage {
  return {
    width: section.page.width * TWIP,
    height: section.page.height * TWIP,
    margin: section.page.margin,
    header: section.header,
    footer: section.footer,
    blocks,
  };
}

function contentHeight(page: DocPageSetup): number {
  return Math.max(LINE, (page.height - page.margin.top - page.margin.bottom) * TWIP);
}

function blockHeight(block: DocBlock): number {
  if (isDocTable(block)) return tableHeight(block);
  return Math.max(LINE, ...block.runs.map((run) => (run.fontSize ?? 11) * 1.4));
}

function tableHeight(table: DocTable): number {
  return Math.max(TABLE_ROW, table.rows.length * TABLE_ROW);
}

function emptyPage(): DocPage {
  return { width: 816, height: 1056, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, header: [], footer: [], blocks: [] };
}
