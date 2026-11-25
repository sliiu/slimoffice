import {
  isDocParagraph,
  isDocRaw,
  isDocTable,
  type DocBlock,
  type DocCell,
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
  /** Page background, #rrggbb, when the document sets one. */
  background?: string;
  columns: number;
  /** Space between columns, in pixels, when the page has more than one. */
  columnSpace?: number;
  /** A line between columns. */
  columnSeparator?: boolean;
  landscape: boolean;
  header: DocParagraph[];
  footer: DocParagraph[];
  /** Which header of the section this page shows, so an edit lands in the right one. */
  headerKind: StoryKind;
  footerKind: StoryKind;
  /** A border around the page, one side at a time. */
  border?: DocPageSetup["border"];
  /** Each column's width, in pixels, when the columns are not equal. */
  columnWidths?: number[];
  /** Where the page's text sits between the margins. */
  verticalAlign?: DocPageSetup["verticalAlign"];
  /** The document grid's line pitch, in pixels. */
  linePitch?: number;
  /** Text direction for the section this page belongs to. */
  direction?: "lr" | "tb" | "rl";
  /** The section numbers its lines. */
  lineNumbers?: boolean;
  blocks: DocBlock[];
}

export type StoryKind = "default" | "first" | "even";

/** The header and footer a page shows: the first page and the even pages can differ. */
function storiesFor(section: DocSection, pageIndex: number): { header: DocParagraph[]; footer: DocParagraph[]; headerKind: StoryKind; footerKind: StoryKind } {
  const first = section.titlePage === true && pageIndex === 0;
  const even = pageIndex % 2 === 1;
  const headerKind: StoryKind = first && section.firstHeader?.length ? "first" : even && section.evenHeader?.length ? "even" : "default";
  const footerKind: StoryKind = first && section.firstFooter?.length ? "first" : even && section.evenFooter?.length ? "even" : "default";
  const header = headerKind === "first" ? section.firstHeader ?? [] : headerKind === "even" ? section.evenHeader ?? [] : section.header;
  const footer = footerKind === "first" ? section.firstFooter ?? [] : footerKind === "even" ? section.evenFooter ?? [] : section.footer;
  return { header, footer, headerKind, footerKind };
}

/**
 * Breaks each section into pages. A table splits between rows when it is taller than the page.
 * A section that starts continuously continues on the page the previous section left, instead of forcing a new one.
 */
export function paginate(document: Document): DocPage[] {
  const pages: DocPage[] = [];
  for (const section of document.sections) {
    const laid = pagesFor(section);
    const last = pages.at(-1);
    const first = laid[0];
    if (section.page.break === "continuous" && last && first?.blocks.length && last.blocks.length) {
      const room = contentHeight(section.page) - last.blocks.reduce((sum, block) => sum + blockHeight(block), 0);
      const carry: DocBlock[] = [];
      let taken = 0;
      for (const block of first.blocks) {
        const height = blockHeight(block);
        if (carry.length && taken + height > room) break;
        carry.push(block);
        taken += height;
      }
      if (carry.length) {
        last.blocks.push(...carry);
        first.blocks.splice(0, carry.length);
      }
      if (!first.blocks.length) laid.shift();
    }
    pages.push(...laid);
  }
  return pages.length ? pages : [emptyPage()];
}

function pagesFor(section: DocSection): DocPage[] {
  const content = contentHeight(section.page);
  const columns = section.page.columns && section.page.columns > 1 ? section.page.columns : 1;
  const pages: DocPage[] = [];
  let blocks: DocBlock[] = [];
  let used = 0;
  let column = 0;
  const flush = () => {
    pages.push(pageFrom(section, blocks, pages.length));
    blocks = [];
    used = 0;
    column = 0;
  };
  for (const block of section.blocks) {
    if (isDocRaw(block)) {
      blocks.push(block);
      used += LINE;
      continue;
    }
    if (isDocParagraph(block) && (block.pageBreakBefore || block.runs.some((run) => run.breakBefore === "page"))) {
      if (blocks.length) flush();
    } else if (isDocParagraph(block) && block.runs.some((run) => run.breakBefore === "column")) {
      if (blocks.length) {
        column += 1;
        used = 0;
        if (column >= columns) flush();
      }
    }
    if (isDocTable(block) && tableHeight(block) > content - used) {
      for (const slice of splitTable(block, content, used)) {
        const height = blockHeight(slice);
        if (blocks.length && used + height > content) flush();
        blocks.push(slice);
        used += height;
      }
      continue;
    }
    const height = blockHeight(block);
    const staysWithNext = isDocParagraph(block) && block.keepNext && used + height <= content && nextHeight(section.blocks, block) > content - used - height;
    const keepsItsLines = isDocParagraph(block) && block.keepLines && height <= content && used + height > content;
    const orphan = isDocParagraph(block) && block.widowControl === true && linesOf(block) === 1 && used + height <= content && nextHeight(section.blocks, block) > content - used - height;
    if (blocks.length && (used + height > content || staysWithNext || keepsItsLines || orphan)) flush();
    blocks.push(block);
    used += height;
  }
  if (blocks.length || pages.length === 0) pages.push(pageFrom(section, blocks, pages.length));
  return pages;
}

function pageFrom(section: DocSection, blocks: DocBlock[], pageIndex: number): DocPage {
  const stories = storiesFor(section, pageIndex);
  return {
    width: section.page.width * TWIP,
    height: section.page.height * TWIP,
    margin: section.page.margin,
    ...(section.page.background ? { background: section.page.background } : {}),
    columns: section.page.columns && section.page.columns > 1 ? section.page.columns : 1,
    ...(section.page.columns && section.page.columns > 1 && section.page.columnSpace ? { columnSpace: section.page.columnSpace * TWIP } : {}),
    ...(section.page.columns && section.page.columns > 1 && section.page.columnSeparator ? { columnSeparator: true } : {}),
    landscape: section.page.landscape === true,
    header: stories.header,
    footer: stories.footer,
    headerKind: stories.headerKind,
    footerKind: stories.footerKind,
    ...(section.page.border ? { border: section.page.border } : {}),
    ...(section.page.columnWidths?.length ? { columnWidths: section.page.columnWidths.map((width) => width * TWIP) } : {}),
    ...(section.page.verticalAlign ? { verticalAlign: section.page.verticalAlign } : {}),
    ...(section.page.grid?.linePitch ? { linePitch: section.page.grid.linePitch * TWIP } : {}),
    ...(section.page.direction ? { direction: section.page.direction } : {}),
    ...(section.page.lineNumbers ? { lineNumbers: true } : {}),
    blocks,
  };
}

function contentHeight(page: DocPageSetup): number {
  return Math.max(LINE, (page.height - page.margin.top - page.margin.bottom) * TWIP);
}

/** How tall the block after this one is, so a keep-with-next paragraph can move before the page breaks. */
function nextHeight(blocks: DocBlock[], current: DocBlock): number {
  const index = blocks.indexOf(current);
  const next = index >= 0 ? blocks[index + 1] : undefined;
  return next ? blockHeight(next) : 0;
}

function blockHeight(block: DocBlock): number {
  if (isDocTable(block)) return tableHeight(block);
  if (!isDocParagraph(block)) return LINE;
  return paragraphHeight(block);
}

function linesOf(paragraph: DocParagraph): number {
  return Math.max(1, paragraph.runs.filter((run) => run.breakBefore === "line").length + 1);
}

function lineHeightOf(paragraph: DocParagraph): number {
  const size = Math.max(LINE, ...paragraph.runs.map((run) => (run.fontSize ?? 11) * 1.4), 0);
  const rule = paragraph.spacing?.lineRule ?? "auto";
  const line = paragraph.spacing?.line;
  return line === undefined ? size : rule === "auto" ? size * (line / 240) : line * TWIP;
}

function paragraphHeight(paragraph: DocParagraph): number {
  const lines = linesOf(paragraph);
  const lineHeight = lineHeightOf(paragraph);
  const before = (paragraph.spacing?.before ?? 0) * TWIP;
  const after = (paragraph.spacing?.after ?? 0) * TWIP;
  return Math.max(LINE, lineHeight * lines + before + after);
}

/** A row is as tall as its content, unless the table gives it a height. An exact height wins; a minimum only raises it. */
function rowHeights(table: DocTable): number[] {
  return table.rows.map((row, index) => {
    const content = Math.max(TABLE_ROW, ...row.map((cell) => cell.paragraphs.reduce((sum, item) => sum + paragraphHeight(item), 0)));
    const stated = (table.rowHeights?.[index] ?? 0) * TWIP;
    if (!stated) return content;
    return table.rowRules?.[index] === "exact" ? stated : Math.max(content, stated);
  });
}

function tableHeight(table: DocTable): number {
  return rowHeights(table).reduce((sum, height) => sum + height, 0);
}

/** The stated heights of the rows a slice shows, so a split page keeps each row's own height. */
function heightsFor(table: DocTable, from: number, count: number): number[] | undefined {
  if (!table.rowHeights) return undefined;
  const repeated = from > 0 && table.header ? [table.rowHeights[0] ?? 0] : [];
  return [...repeated, ...table.rowHeights.slice(from, from + count - repeated.length)];
}

/** A fresh copy of a row, so editing the repeated header on a later page does not rewrite the first page. */
function copyRow(row: DocCell[]): DocCell[] {
  return row.map((cell) => ({ ...cell, paragraphs: cell.paragraphs.map((item) => ({ ...item, runs: item.runs.map((run) => ({ ...run })) })) }));
}

/** Splits a table between rows so each piece fits the room left on its page. The header row repeats. */
function splitTable(table: DocTable, content: number, firstRoom: number): DocTable[] {
  const heights = rowHeights(table);
  const pieces: DocTable[] = [];
  let rows: DocCell[][] = [];
  let from = 0;
  let used = 0;
  let room = Math.max(TABLE_ROW, firstRoom);
  const header = table.header ? table.rows[0] : undefined;
  const cut = () => {
    if (!rows.length) return;
    pieces.push({ ...table, rows, rowHeights: heightsFor(table, from, rows.length), source: { table, from } });
    from += rows.length - (from > 0 && header ? 1 : 0);
    rows = header ? [copyRow(header)] : [];
    used = rows.length ? (heights[0] ?? TABLE_ROW) : 0;
    room = content;
  };
  table.rows.forEach((row, index) => {
    const height = heights[index] ?? TABLE_ROW;
    if (rows.length && used + height > room) cut();
    rows.push(row);
    used += height;
  });
  if (rows.length) pieces.push({ ...table, rows, rowHeights: heightsFor(table, from, rows.length), source: { table, from } });
  return pieces.length ? pieces : [table];
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
    headerKind: "default",
    footerKind: "default",
    blocks: [],
  };
}
