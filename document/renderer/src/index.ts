import {
  isDocTable,
  type DocBlock,
  type DocCell,
  type DocPageSetup,
  type DocParagraph,
  type DocSection,
  type Document,
} from "@sliiu/document-core";

const TWIP = 96 / 1440;
const LINE = 22;
const TABLE_ROW = 28;

export interface DocPage {
  width: number;
  height: number;
  margin: DocPageSetup["margin"];
  /** Page background, #rrggbb, when the document sets one. */
  background?: string;
  columns: number;
  landscape: boolean;
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
    if (!isDocTable(block) && (block.pageBreakBefore || block.runs.some((run) => run.breakBefore === "page"))) {
      if (blocks.length) flush();
    }
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
    ...(section.page.background ? { background: section.page.background } : {}),
    columns: section.page.columns && section.page.columns > 1 ? section.page.columns : 1,
    landscape: section.page.landscape === true,
    header: section.header,
    footer: section.footer,
    blocks,
  };
}

function contentHeight(page: DocPageSetup): number {
  return Math.max(LINE, (page.height - page.margin.top - page.margin.bottom) * TWIP);
}

function blockHeight(block: DocBlock): number {
  if (isDocTable(block)) return tableHeight(block.rows);
  return paragraphHeight(block);
}

function paragraphHeight(paragraph: DocParagraph): number {
  const size = Math.max(LINE, ...paragraph.runs.map((run) => (run.fontSize ?? 11) * 1.4), 0);
  const lines = Math.max(1, paragraph.runs.filter((run) => run.breakBefore === "line").length + 1);
  const rule = paragraph.spacing?.lineRule ?? "auto";
  const line = paragraph.spacing?.line;
  const lineHeight = line === undefined ? size : rule === "auto" ? size * (line / 240) : line * TWIP;
  const before = (paragraph.spacing?.before ?? 0) * TWIP;
  const after = (paragraph.spacing?.after ?? 0) * TWIP;
  return Math.max(LINE, lineHeight * lines + before + after);
}

function tableHeight(rows: DocCell[][]): number {
  const heights = rows.map((row) => Math.max(TABLE_ROW, ...row.map((cell) => cell.paragraphs.reduce((sum, item) => sum + paragraphHeight(item), 0))));
  return heights.reduce((sum, height) => sum + height, 0);
}

function emptyPage(): DocPage {
  return {
    width: 816,
    height: 1056,
    margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
    columns: 1,
    landscape: false,
    header: [],
    footer: [],
    blocks: [],
  };
}
