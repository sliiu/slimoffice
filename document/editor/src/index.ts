import {
  DEFAULT_PAGE,
  isDocTable,
  listMarker,
  type DocAlign,
  type DocBlock,
  type DocCell,
  type DocNumberingLevel,
  type DocParagraph,
  type DocRun,
  type DocSection,
  type DocUnderline,
  type Document,
} from "@sliiu/document-core";
import { paginate } from "@sliiu/document-renderer";

export interface DocumentEditOptions {
  locale?: "zh-CN" | "en";
  onChange?: () => void;
  onStatus?: (text: string) => void;
  onSelection?: () => void;
}

export type RunMark = "bold" | "italic" | "strike";

export interface DocumentView {
  destroy(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  bold(): void;
  boldOn(): boolean;
  italic(): void;
  italicOn(): boolean;
  underline(): void;
  underlineOn(): boolean;
  strike(): void;
  strikeOn(): boolean;
  superscript(): void;
  subscript(): void;
  vertAlignOn(value: "superscript" | "subscript"): boolean;
  highlight(color: string): void;
  highlightOn(): string | undefined;
  fontSize(pixels: number): void;
  fontSizeOn(): number | undefined;
  growFont(): void;
  shrinkFont(): void;
  font(name: string): void;
  fontOn(): string | undefined;
  color(value: string): void;
  colorOn(): string | undefined;
  clearFormat(): void;
  align(value: DocAlign): void;
  alignOn(value: DocAlign): boolean;
  indent(direction: 1 | -1): void;
  bullet(): void;
  number(): void;
  insertParagraph(): void;
  insertTable(rows?: number, cols?: number): void;
  addRow(): void;
  addColumn(): void;
  deleteRow(): void;
  deleteColumn(): void;
  mergeCells(): void;
  insertImage(file: Blob): Promise<void>;
  link(target: string): void;
  unlink(): void;
  linkOn(): string | undefined;
  bookmark(name: string): void;
  pageBreak(): void;
  pageSize(width: number, height: number): void;
  landscape(): void;
  landscapeOn(): boolean;
  margins(narrow: boolean): void;
  columns(count: number): void;
  columnsOn(): number;
  pageColor(color: string): void;
  pageColorOn(): string | undefined;
  find(query: string): number;
  findNext(): void;
  replace(query: string, replacement: string): number;
  replaceAll(query: string, replacement: string): number;
  selectAll(): void;
  wordCount(): void;
  speak(): void;
  copy(): Promise<void>;
  cut(): Promise<void>;
  paste(): Promise<void>;
  reload(): void;
}

interface Spot {
  section: number;
  block: number;
  row?: number;
  col?: number;
  para?: number;
}

interface Snapshot {
  sections: string;
  numbering: string;
}

const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
const INDENT_STEP = 720;

/** Pages you can edit. Headers and footers stay as opened; the story is what gets written back. */
export function mountDocument(host: HTMLElement, doc: Document, options: DocumentEditOptions = {}): DocumentView {
  const locale = options.locale ?? "en";
  const zh = locale === "zh-CN";
  if (!doc.sections[0]) doc.sections.push({ page: { ...DEFAULT_PAGE }, header: [], footer: [], blocks: [] });
  const undoStack: Snapshot[] = [];
  const redoStack: Snapshot[] = [];
  let selected: Spot = { section: 0, block: 0 };
  let armed = false;
  let root: HTMLElement = el("div", "doc-view");
  let hits: HTMLElement[] = [];
  let hitIndex = 0;

  const view: DocumentView = {
    destroy: () => root.remove(),
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    bold: () => toggleMark("bold"),
    boldOn: () => markOn("bold"),
    italic: () => toggleMark("italic"),
    italicOn: () => markOn("italic"),
    underline,
    underlineOn: () => textRuns(current()).some((run) => run.underline),
    strike: () => toggleMark("strike"),
    strikeOn: () => markOn("strike"),
    superscript: () => toggleVert("superscript"),
    subscript: () => toggleVert("subscript"),
    vertAlignOn: (value) => textRuns(current()).some((run) => run.vertAlign === value),
    highlight,
    highlightOn: () => textRuns(current())[0]?.highlight,
    fontSize,
    fontSizeOn: () => textRuns(current())[0]?.fontSize,
    growFont: () => stepFont(1),
    shrinkFont: () => stepFont(-1),
    font,
    fontOn: () => textRuns(current())[0]?.font,
    color,
    colorOn: () => textRuns(current())[0]?.color,
    clearFormat,
    align,
    alignOn,
    indent,
    bullet,
    number,
    insertParagraph,
    insertTable,
    addRow,
    addColumn,
    deleteRow,
    deleteColumn,
    mergeCells,
    insertImage,
    link,
    unlink,
    linkOn: () => textRuns(current()).find((run) => run.link)?.link,
    bookmark,
    pageBreak,
    pageSize,
    landscape,
    landscapeOn: () => currentSection().page.landscape === true,
    margins,
    columns,
    columnsOn: () => currentSection().page.columns ?? 1,
    pageColor,
    pageColorOn: () => currentSection().page.background,
    find,
    findNext,
    replace,
    replaceAll,
    selectAll,
    wordCount,
    speak,
    copy,
    cut,
    paste,
    reload: render,
  };
  render();
  return view;

  function render(): void {
    root = el("div", "doc-view");
    paginate(doc).forEach((page, pageIndex) => {
      const paper = el("section", "doc-page");
      paper.style.width = `${page.width}px`;
      paper.style.minHeight = `${page.height}px`;
      paper.style.padding = sides(page.margin);
      if (page.background) paper.style.background = page.background;
      if (page.header.length) paper.append(story("header", page.header));
      const body = el("div", "doc-body");
      if (page.columns > 1) {
        body.style.columnCount = String(page.columns);
        body.style.columnGap = "24px";
      }
      const sectionIndex = sectionIndexFor(page.blocks);
      for (const block of page.blocks) body.append(renderBlock(block, sectionIndex));
      paper.append(body);
      if (page.footer.length) paper.append(story("footer", page.footer));
      paper.dataset.page = String(pageIndex);
      root.append(paper);
    });
    const bar = host.querySelector(":scope > .office-toolbar");
    host.replaceChildren(...(bar ? [bar, root] : [root]));
  }

  function sectionIndexFor(blocks: DocBlock[]): number {
    const first = blocks[0];
    if (!first) return selected.section;
    const index = doc.sections.findIndex((section) => section.blocks.includes(first));
    return index < 0 ? selected.section : index;
  }

  function renderBlock(block: DocBlock, sectionIndex: number): HTMLElement {
    const section = doc.sections[sectionIndex];
    const blockIndex = section ? section.blocks.indexOf(block) : -1;
    if (!isDocTable(block)) return paragraph(block, { section: sectionIndex, block: blockIndex }, true);
    const table = el("table", "doc-table");
    block.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach((cell, colIndex) => {
        if (cell.vMerge === "continue") return;
        const td = document.createElement("td");
        if (cell.span && cell.span > 1) td.colSpan = cell.span;
        const continued = continuedRows(block.rows, rowIndex, colIndex);
        if (continued > 1) td.rowSpan = continued;
        if (cell.shading) td.style.background = cell.shading;
        cell.paragraphs.forEach((item, paraIndex) => {
          td.append(paragraph(item, { section: sectionIndex, block: blockIndex, row: rowIndex, col: colIndex, para: paraIndex }, true));
        });
        tr.append(td);
      });
      table.append(tr);
    });
    return table;
  }

  function paragraph(item: DocParagraph, spot: Spot, editable: boolean): HTMLElement {
    const node = el("p", "doc-paragraph");
    stamp(node, spot);
    if (sameSpot(spot, selected)) node.classList.add("is-selected");
    if (item.align) node.style.textAlign = item.align === "both" ? "justify" : item.align;
    if (item.shading) node.style.background = item.shading;
    const indent = item.indent;
    if (indent?.left) node.style.marginLeft = twips(indent.left);
    if (indent?.right) node.style.marginRight = twips(indent.right);
    if (indent?.firstLine) node.style.textIndent = twips(indent.firstLine);
    if (indent?.hanging) {
      node.style.textIndent = twips(-indent.hanging);
      node.style.paddingLeft = twips(indent.hanging);
    }
    if (item.spacing?.before) node.style.marginTop = twips(item.spacing.before);
    if (item.spacing?.after) node.style.marginBottom = twips(item.spacing.after);
    const marker = listMarker(doc.numbering, item);
    if (marker) {
      const bullet = el("span", "doc-marker");
      bullet.textContent = marker;
      bullet.contentEditable = "false";
      node.append(bullet);
    }
    const body = el("span", "doc-text");
    if (editable) {
      body.contentEditable = "true";
      body.addEventListener("focus", () => {
        selected = spot;
        arm();
        options.onSelection?.();
      });
      body.addEventListener("blur", () => {
        armed = false;
      });
      body.addEventListener("input", () => {
        writeText(item, body.textContent ?? "");
        touch();
      });
    }
    node.append(body);
    const target = node.querySelector(".doc-text") ?? node;
    for (const run of item.runs) target.append(runNode(run));
    return node;
  }

  function undo(): void {
    const prev = undoStack.pop();
    if (!prev) return;
    redoStack.push(snapshot());
    restore(prev);
  }

  function redo(): void {
    const next = redoStack.pop();
    if (!next) return;
    undoStack.push(snapshot());
    restore(next);
  }

  function restore(saved: Snapshot): void {
    const sections = JSON.parse(saved.sections) as DocSection[];
    sections.forEach(revive);
    doc.sections = sections;
    doc.numbering = JSON.parse(saved.numbering) as Document["numbering"];
    touch();
    render();
    options.onSelection?.();
  }

  function toggleMark(mark: RunMark): void {
    const item = current();
    if (!item) return;
    remember();
    const runs = textRuns(item);
    const on = runs.length > 0 && runs.every((run) => run[mark]);
    for (const run of runs) {
      if (on) delete run[mark];
      else run[mark] = true;
    }
    finish();
  }

  function markOn(mark: RunMark): boolean {
    const runs = textRuns(current());
    return runs.length > 0 && runs.every((run) => run[mark]);
  }

  function underline(): void {
    const item = current();
    if (!item) return;
    remember();
    const runs = textRuns(item);
    const on = runs.length > 0 && runs.every((run) => run.underline);
    for (const run of runs) {
      if (on) delete run.underline;
      else run.underline = "single";
    }
    finish();
  }

  function toggleVert(value: "superscript" | "subscript"): void {
    const item = current();
    if (!item) return;
    remember();
    const runs = textRuns(item);
    const on = runs.length > 0 && runs.every((run) => run.vertAlign === value);
    for (const run of runs) {
      if (on) delete run.vertAlign;
      else run.vertAlign = value;
    }
    finish();
  }

  function highlight(color: string): void {
    applyToRuns((run) => {
      if (!color) delete run.highlight;
      else run.highlight = color;
    });
  }

  function fontSize(pixels: number): void {
    if (!Number.isFinite(pixels) || pixels <= 0) return;
    applyToRuns((run) => {
      run.fontSize = pixels;
    });
  }

  function stepFont(direction: 1 | -1): void {
    const currentSize = textRuns(current())[0]?.fontSize ?? 11;
    const next = SIZES.filter((size) => (direction > 0 ? size > currentSize : size < currentSize)).at(direction > 0 ? 0 : -1);
    if (next) fontSize(next);
  }

  function font(name: string): void {
    applyToRuns((run) => {
      if (name) run.font = name;
      else delete run.font;
    });
  }

  function color(value: string): void {
    applyToRuns((run) => {
      if (value) run.color = value;
      else delete run.color;
    });
  }

  function clearFormat(): void {
    const item = current();
    if (!item) return;
    remember();
    delete item.align;
    delete item.spacing;
    delete item.indent;
    delete item.shading;
    delete item.numbering;
    for (const run of textRuns(item)) {
      const text = run.text;
      const image = run.image;
      const bytes = run.imageBytes;
      const type = run.imageType;
      for (const key of Object.keys(run) as (keyof DocRun)[]) delete run[key];
      run.text = text;
      if (image) {
        run.image = image;
        if (bytes) run.imageBytes = bytes;
        if (type) run.imageType = type;
      }
    }
    finish();
  }

  function align(value: DocAlign): void {
    const item = current();
    if (!item) return;
    remember();
    if (value === "left") delete item.align;
    else item.align = value;
    finish();
  }

  function alignOn(value: DocAlign): boolean {
    return (current()?.align ?? "left") === value;
  }

  function indent(direction: 1 | -1): void {
    const item = current();
    if (!item) return;
    remember();
    const left = Math.max(0, (item.indent?.left ?? 0) + direction * INDENT_STEP);
    item.indent = { ...item.indent, ...(left ? { left } : {}) };
    if (!left) delete item.indent.left;
    if (!item.indent.left && item.indent.right === undefined && item.indent.firstLine === undefined && item.indent.hanging === undefined) {
      delete item.indent;
    }
    finish();
  }

  function bullet(): void {
    toggleList("bullet", { text: "•", bullet: "•" });
  }

  function number(): void {
    toggleList("number", { text: "%1." });
  }

  function toggleList(kind: string, level: DocNumberingLevel): void {
    const item = current();
    if (!item) return;
    remember();
    const id = `local-${kind}`;
    doc.numbering = { ...doc.numbering, [id]: [level] };
    if (item.numbering?.id === id) delete item.numbering;
    else item.numbering = { id, level: 0 };
    finish();
  }

  function insertParagraph(): void {
    const section = currentSection();
    remember();
    const at = Math.min(selected.block, section.blocks.length - 1);
    section.blocks.splice(at + 1, 0, { runs: [{ text: "" }] });
    selected = { section: selected.section, block: at + 1 };
    finish();
  }

  function insertTable(rows = 2, cols = 2): void {
    const section = currentSection();
    remember();
    const cell = (): DocCell => ({ paragraphs: [{ runs: [{ text: "" }] }] });
    const at = Math.min(selected.block, section.blocks.length - 1);
    const table: DocBlock = { rows: Array.from({ length: rows }, () => Array.from({ length: cols }, cell)) };
    section.blocks.splice(at + 1, 0, table);
    selected = { section: selected.section, block: at + 1, row: 0, col: 0, para: 0 };
    finish();
  }

  function addRow(): void {
    const table = currentTable();
    if (!table) return;
    remember();
    const cols = table.rows[0]?.length ?? 1;
    table.rows.splice((selected.row ?? table.rows.length - 1) + 1, 0, Array.from({ length: cols }, () => ({ paragraphs: [{ runs: [{ text: "" }] }] })));
    finish();
  }

  function addColumn(): void {
    const table = currentTable();
    if (!table) return;
    remember();
    const at = (selected.col ?? 0) + 1;
    for (const row of table.rows) row.splice(at, 0, { paragraphs: [{ runs: [{ text: "" }] }] });
    finish();
  }

  function deleteRow(): void {
    const table = currentTable();
    if (!table || selected.row === undefined || table.rows.length < 2) return;
    remember();
    table.rows.splice(selected.row, 1);
    selected = { ...selected, row: Math.min(selected.row, table.rows.length - 1) };
    finish();
  }

  function deleteColumn(): void {
    const table = currentTable();
    if (!table || selected.col === undefined || (table.rows[0]?.length ?? 0) < 2) return;
    remember();
    for (const row of table.rows) row.splice(selected.col!, 1);
    selected = { ...selected, col: Math.min(selected.col, (table.rows[0]?.length ?? 1) - 1) };
    finish();
  }

  function mergeCells(): void {
    const table = currentTable();
    if (!table || selected.row === undefined || selected.col === undefined) return;
    const row = table.rows[selected.row];
    const cell = row?.[selected.col];
    const next = row?.[selected.col + 1];
    if (!row || !cell || !next) return;
    remember();
    cell.span = (cell.span ?? 1) + (next.span ?? 1);
    cell.paragraphs.push(...next.paragraphs);
    row.splice(selected.col + 1, 1);
    finish();
  }

  async function insertImage(file: Blob): Promise<void> {
    const item = current();
    if (!item) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const id = `rIdImg${Date.now()}`;
    const type = file.type || "image/png";
    const ext = type.split("/")[1] || "png";
    doc.source?.set(`word/media/${id}.${ext}`, bytes);
    remember();
    item.runs.push({ text: "", image: id, imageBytes: bytes, imageType: type });
    finish();
  }

  function link(target: string): void {
    const trimmed = target.trim();
    if (!trimmed) return;
    applyToRuns((run) => {
      run.link = trimmed;
    });
  }

  function unlink(): void {
    applyToRuns((run) => {
      delete run.link;
    });
  }

  function bookmark(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const item = current();
    const run = textRuns(item)[0];
    if (!run) return;
    remember();
    run.bookmark = trimmed;
    finish();
  }

  function pageSize(width: number, height: number): void {
    const section = currentSection();
    remember();
    section.page.width = width;
    section.page.height = height;
    section.page.landscape = width > height;
    finish();
  }

  function landscape(): void {
    const section = currentSection();
    remember();
    const landscape = section.page.landscape !== true;
    section.page.landscape = landscape;
    if (landscape && section.page.width < section.page.height) {
      const width = section.page.width;
      section.page.width = section.page.height;
      section.page.height = width;
    }
    if (!landscape && section.page.width > section.page.height) {
      const width = section.page.width;
      section.page.width = section.page.height;
      section.page.height = width;
    }
    finish();
  }

  function margins(narrow: boolean): void {
    const section = currentSection();
    remember();
    const edge = narrow ? 720 : 1440;
    section.page.margin = { top: edge, bottom: edge, left: edge, right: edge };
    finish();
  }

  function columns(count: number): void {
    const section = currentSection();
    remember();
    if (count > 1) section.page.columns = count;
    else delete section.page.columns;
    finish();
  }

  function pageColor(color: string): void {
    const section = currentSection();
    remember();
    if (color) section.page.background = color;
    else delete section.page.background;
    finish();
  }

  function pageBreak(): void {
    const section = currentSection();
    remember();
    const at = Math.min(selected.block, section.blocks.length - 1);
    section.blocks.splice(at + 1, 0, { runs: [{ text: "" }], pageBreakBefore: true });
    selected = { section: selected.section, block: at + 1 };
    finish();
  }

  function find(query: string): number {
    const needle = query.trim().toLowerCase();
    hits = [];
    hitIndex = 0;
    for (const node of root.querySelectorAll<HTMLElement>(".doc-paragraph")) {
      const hit = needle.length > 0 && (node.textContent ?? "").toLowerCase().includes(needle);
      node.classList.toggle("is-hit", hit);
      if (hit) hits.push(node);
    }
    hits[0]?.scrollIntoView({ block: "nearest" });
    if (hits[0]) hits[0].classList.add("is-current-hit");
    return hits.length;
  }

  function findNext(): void {
    if (!hits.length) return;
    hits[hitIndex]?.classList.remove("is-current-hit");
    hitIndex = (hitIndex + 1) % hits.length;
    const node = hits[hitIndex];
    node?.classList.add("is-current-hit");
    node?.scrollIntoView({ block: "nearest" });
    const spot = spotFrom(node);
    if (spot) selected = spot;
  }

  function replace(query: string, replacement: string): number {
    const item = current();
    if (!item) return 0;
    const needle = query.trim();
    if (!needle) return 0;
    remember();
    let count = 0;
    for (const run of textRuns(item)) {
      if (run.text.includes(needle)) {
        run.text = run.text.replace(needle, replacement);
        count += 1;
        break;
      }
    }
    if (count) finish();
    return count;
  }

  function replaceAll(query: string, replacement: string): number {
    const needle = query.trim();
    if (!needle) return 0;
    remember();
    let count = 0;
    for (const section of doc.sections) {
      for (const paragraph of paragraphsOf(section.blocks)) {
        for (const run of textRuns(paragraph)) {
          if (!run.text.includes(needle)) continue;
          const hits = run.text.split(needle).length - 1;
          run.text = run.text.split(needle).join(replacement);
          count += hits;
        }
      }
    }
    if (count) finish();
    return count;
  }

  function selectAll(): void {
    const node = root.querySelector<HTMLElement>(".doc-paragraph[contenteditable='true']");
    const selection = node?.ownerDocument.defaultView?.getSelection();
    if (!node || !selection) return;
    const range = node.ownerDocument.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function wordCount(): void {
    const text = storyText();
    const chars = text.replace(/\s/g, "").length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    options.onStatus?.(zh ? `${chars} 字，${words} 词` : `${words} words, ${chars} characters`);
  }

  function speak(): void {
    const text = storyText().trim();
    if (!text) {
      options.onStatus?.(zh ? "没有可朗读的文字" : "Nothing to read");
      return;
    }
    const synth = window.speechSynthesis;
    if (!synth) {
      options.onStatus?.(zh ? "这个环境不能朗读" : "Speech is not available");
      return;
    }
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text.slice(0, 800)));
    options.onStatus?.(zh ? "正在朗读" : "Reading");
  }

  async function copy(): Promise<void> {
    const text = textRuns(current()).map((run) => run.text).join("");
    await writeClipboard(text);
  }

  async function cut(): Promise<void> {
    const item = current();
    if (!item) return;
    await copy();
    remember();
    item.runs = [{ text: "" }];
    finish();
  }

  async function paste(): Promise<void> {
    const item = current();
    if (!item) return;
    const clip = await readClipboard();
    if (!clip) return;
    remember();
    const run = textRuns(item)[0] ?? { text: "" };
    run.text = `${run.text}${clip}`;
    item.runs = [run];
    finish();
  }

  function applyToRuns(change: (run: DocRun) => void): void {
    const item = current();
    if (!item) return;
    remember();
    for (const run of textRuns(item)) change(run);
    finish();
  }

  function current(): DocParagraph | undefined {
    const section = doc.sections[selected.section];
    const block = section?.blocks[selected.block];
    if (!block) return undefined;
    if (!isDocTable(block)) return block;
    if (selected.row === undefined || selected.col === undefined || selected.para === undefined) return undefined;
    return block.rows[selected.row]?.[selected.col]?.paragraphs[selected.para];
  }

  function currentTable(): { rows: DocCell[][] } | undefined {
    const block = doc.sections[selected.section]?.blocks[selected.block];
    return block && isDocTable(block) ? block : undefined;
  }

  function currentSection(): DocSection {
    return doc.sections[selected.section] ?? doc.sections[0]!;
  }

  function storyText(): string {
    const parts: string[] = [];
    for (const section of doc.sections) {
      for (const paragraph of paragraphsOf(section.blocks)) parts.push(paragraph.runs.map((run) => run.text).join(""));
    }
    return parts.join("\n");
  }

  function finish(): void {
    touch();
    render();
    options.onSelection?.();
  }

  function touch(): void {
    doc.edited = true;
    options.onChange?.();
  }

  function arm(): void {
    if (armed) return;
    remember();
    armed = true;
  }

  function remember(): void {
    undoStack.push(snapshot());
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
  }

  function snapshot(): Snapshot {
    return { sections: JSON.stringify(doc.sections), numbering: JSON.stringify(doc.numbering ?? {}) };
  }
}

function paragraphsOf(blocks: DocBlock[]): DocParagraph[] {
  const found: DocParagraph[] = [];
  for (const block of blocks) {
    if (!isDocTable(block)) {
      found.push(block);
      continue;
    }
    for (const row of block.rows) for (const cell of row) found.push(...cell.paragraphs);
  }
  return found;
}

function continuedRows(rows: DocCell[][], row: number, col: number): number {
  let count = 1;
  for (let next = row + 1; next < rows.length; next += 1) {
    if (rows[next]?.[col]?.vMerge !== "continue") break;
    count += 1;
  }
  return count;
}

function textRuns(item: DocParagraph | undefined): DocRun[] {
  return item?.runs.filter((run) => !run.image) ?? [];
}

function writeText(item: DocParagraph, value: string): void {
  const style = item.runs.find((run) => !run.image);
  const images = item.runs.filter((run) => run.image);
  const run: DocRun = { text: value };
  copyStyle(style, run);
  item.runs = [run, ...images];
}

function copyStyle(from: DocRun | undefined, to: DocRun): void {
  if (!from) return;
  if (from.bold) to.bold = true;
  if (from.italic) to.italic = true;
  if (from.underline) to.underline = from.underline;
  if (from.strike) to.strike = true;
  if (from.vertAlign) to.vertAlign = from.vertAlign;
  if (from.highlight) to.highlight = from.highlight;
  if (from.fontSize) to.fontSize = from.fontSize;
  if (from.font) to.font = from.font;
  if (from.color) to.color = from.color;
}

function runNode(run: DocRun): HTMLElement {
  if (run.image) {
    if (run.imageBytes) {
      const img = document.createElement("img");
      img.className = "doc-image";
      img.alt = "";
      img.src = `data:${run.imageType ?? "image/png"};base64,${base64(run.imageBytes)}`;
      return img;
    }
    const mark = el("span", "doc-image");
    mark.textContent = "[图]";
    return mark;
  }
  const span = document.createElement("span");
  if (run.breakBefore === "line") span.append(document.createElement("br"));
  if (run.tabBefore) span.append(document.createTextNode(" "));
  span.append(document.createTextNode(run.text));
  if (run.bold) span.style.fontWeight = "700";
  if (run.italic) span.style.fontStyle = "italic";
  if (run.underline) span.style.textDecoration = underlineOf(run.underline);
  if (run.strike) span.style.textDecoration = `${span.style.textDecoration} line-through`.trim();
  if (run.vertAlign === "superscript") span.style.verticalAlign = "super";
  if (run.vertAlign === "subscript") span.style.verticalAlign = "sub";
  if (run.vertAlign) span.style.fontSize = "0.75em";
  if (run.highlight) span.style.background = run.highlight;
  if (run.fontSize) span.style.fontSize = `${run.fontSize}px`;
  if (run.font) span.style.fontFamily = run.font;
  if (run.color) span.style.color = run.color;
  if (run.link) {
    const anchor = document.createElement("a");
    anchor.href = run.link;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.append(span);
    return anchor;
  }
  return span;
}

function underlineOf(value: DocUnderline): string {
  if (value === "double") return "underline double";
  if (value === "dotted") return "underline dotted";
  if (value === "dash") return "underline dashed";
  if (value === "wave") return "underline wavy";
  return "underline";
}

function story(kind: "header" | "footer", items: DocParagraph[]): HTMLElement {
  const node = el("div", `doc-${kind}`);
  for (const item of items) {
    const para = el("p", "doc-paragraph");
    if (item.align) para.style.textAlign = item.align === "both" ? "justify" : item.align;
    for (const run of item.runs) para.append(runNode(run));
    node.append(para);
  }
  return node;
}

function revive(section: DocSection): void {
  for (const block of section.blocks) {
    if (!isDocTable(block)) continue;
    for (const row of block.rows) {
      for (const cell of row) {
        for (const paragraph of cell.paragraphs) reviveRuns(paragraph);
      }
    }
  }
  for (const block of section.blocks) if (!isDocTable(block)) reviveRuns(block);
  for (const paragraph of [...section.header, ...section.footer]) reviveRuns(paragraph);
}

function reviveRuns(paragraph: DocParagraph): void {
  for (const run of paragraph.runs) {
    const bytes = run.imageBytes as unknown;
    if (!bytes || bytes instanceof Uint8Array) return;
    if (typeof bytes === "object") {
      const record = bytes as { data?: number[] };
      const values = Array.isArray(record.data) ? record.data : Object.values(bytes as Record<string, number>);
      run.imageBytes = Uint8Array.from(values);
    }
  }
}

function spotFrom(node: HTMLElement | undefined): Spot | undefined {
  if (!node) return undefined;
  const block = Number(node.dataset.block);
  if (!Number.isFinite(block)) return undefined;
  const spot: Spot = { section: Number(node.dataset.section ?? "0"), block };
  if (node.dataset.row !== undefined) spot.row = Number(node.dataset.row);
  if (node.dataset.col !== undefined) spot.col = Number(node.dataset.col);
  if (node.dataset.para !== undefined) spot.para = Number(node.dataset.para);
  return spot;
}

function stamp(node: HTMLElement, spot: Spot): void {
  node.dataset.section = String(spot.section);
  node.dataset.block = String(spot.block);
  if (spot.row !== undefined) node.dataset.row = String(spot.row);
  if (spot.col !== undefined) node.dataset.col = String(spot.col);
  if (spot.para !== undefined) node.dataset.para = String(spot.para);
}

function sameSpot(a: Spot, b: Spot): boolean {
  return a.section === b.section && a.block === b.block && a.row === b.row && a.col === b.col && a.para === b.para;
}

function sides(margin: { top: number; bottom: number; left: number; right: number }): string {
  return `${twips(margin.top)} ${twips(margin.right)} ${twips(margin.bottom)} ${twips(margin.left)}`;
}

function twips(value: number): string {
  return `${(value * 96) / 1440}px`;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function writeClipboard(text: string): Promise<void> {
  const clip = navigator.clipboard;
  if (clip) await clip.writeText(text);
}

async function readClipboard(): Promise<string> {
  const clip = navigator.clipboard;
  return clip ? clip.readText() : "";
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
