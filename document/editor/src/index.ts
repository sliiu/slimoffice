import {
  DEFAULT_PAGE,
  isDocTable,
  type DocBlock,
  type DocParagraph,
  type DocRun,
  type DocSection,
  type Document,
} from "@sliiu/document-core";
import { paginate } from "@sliiu/document-renderer";

export interface DocumentEditOptions {
  locale?: "zh-CN" | "en";
  onChange?: () => void;
  onStatus?: (text: string) => void;
  onSelection?: () => void;
}

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
  align(value: "left" | "center"): void;
  alignOn(value: "left" | "center"): boolean;
  insertParagraph(): void;
  insertTable(): void;
  find(query: string): number;
  wordCount(): void;
  speak(): void;
  reload(): void;
}

interface Spot {
  block: number;
  row?: number;
  col?: number;
  para?: number;
}

/** Pages you can edit. Headers and footers stay as opened; the story is what gets written back. */
export function mountDocument(host: HTMLElement, doc: Document, options: DocumentEditOptions = {}): DocumentView {
  const locale = options.locale ?? "en";
  const zh = locale === "zh-CN";
  if (!doc.sections[0]) {
    doc.sections.push({ page: DEFAULT_PAGE, header: [], footer: [], blocks: [] });
  }
  const section: DocSection = doc.sections[0]!;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  let selected: Spot = { block: 0 };
  let armed = false;
  let root: HTMLElement = el("div", "doc-view");

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
    align,
    alignOn,
    insertParagraph,
    insertTable,
    find,
    wordCount,
    speak,
    reload: render,
  };
  render();
  return view;

  function render(): void {
    root = el("div", "doc-view");
    for (const page of paginate(doc)) {
      const paper = el("section", "doc-page");
      paper.style.width = `${page.width}px`;
      paper.style.minHeight = `${page.height}px`;
      paper.style.padding = sides(page.margin);
      if (page.header.length) paper.append(story("header", page.header));
      for (const block of page.blocks) paper.append(renderBlock(block));
      if (page.footer.length) paper.append(story("footer", page.footer));
      root.append(paper);
    }
    const bar = host.querySelector(":scope > .office-toolbar");
    host.replaceChildren(...(bar ? [bar, root] : [root]));
  }

  function renderBlock(block: DocBlock): HTMLElement {
    const blockIndex = section.blocks.indexOf(block);
    if (!isDocTable(block)) return paragraph(block, { block: blockIndex }, true);
    const table = el("table", "doc-table");
    block.rows.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");
      row.forEach((cell, colIndex) => {
        const td = document.createElement("td");
        cell.forEach((item, paraIndex) => {
          td.append(paragraph(item, { block: blockIndex, row: rowIndex, col: colIndex, para: paraIndex }, true));
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
    const locked = item.runs.some((run) => run.image);
    if (editable && !locked) {
      node.contentEditable = "true";
      node.addEventListener("focus", () => {
        selected = spot;
        arm();
        options.onSelection?.();
      });
      node.addEventListener("blur", () => {
        armed = false;
      });
      node.addEventListener("input", () => {
        writeText(item, node.textContent ?? "");
        touch();
      });
    }
    for (const run of item.runs) node.append(runNode(run));
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

  function restore(json: string): void {
    section.blocks = JSON.parse(json) as DocBlock[];
    touch();
    render();
    options.onSelection?.();
  }

  function toggleMark(mark: "bold" | "italic"): void {
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

  function markOn(mark: "bold" | "italic"): boolean {
    const runs = textRuns(current());
    return runs.length > 0 && runs.every((run) => run[mark]);
  }

  function align(value: "left" | "center"): void {
    const item = current();
    if (!item) return;
    remember();
    if (value === "left") delete item.align;
    else item.align = value;
    finish();
  }

  function alignOn(value: "left" | "center"): boolean {
    return (current()?.align ?? "left") === value;
  }

  function insertParagraph(): void {
    remember();
    const at = Math.min(selected.block, section.blocks.length - 1);
    section.blocks.splice(at + 1, 0, { runs: [{ text: "" }] });
    selected = { block: at + 1 };
    finish();
  }

  function insertTable(): void {
    remember();
    const cell = (): DocParagraph[] => [{ runs: [{ text: "" }] }];
    const at = Math.min(selected.block, section.blocks.length - 1);
    section.blocks.splice(at + 1, 0, { rows: [[cell(), cell()], [cell(), cell()]] });
    selected = { block: at + 1, row: 0, col: 0, para: 0 };
    finish();
  }

  function find(query: string): number {
    const needle = query.trim().toLowerCase();
    let count = 0;
    for (const node of root.querySelectorAll<HTMLElement>(".doc-paragraph")) {
      const hit = needle.length > 0 && (node.textContent ?? "").toLowerCase().includes(needle);
      node.classList.toggle("is-hit", hit);
      if (hit) count += 1;
    }
    root.querySelector(".is-hit")?.scrollIntoView({ block: "nearest" });
    return count;
  }

  function wordCount(): void {
    const text = storyText();
    const chars = text.replace(/\s/g, "").length;
    options.onStatus?.(zh ? `${chars} 字` : `${chars} characters`);
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

  function current(): DocParagraph | undefined {
    const block = section.blocks[selected.block];
    if (!block) return undefined;
    if (!isDocTable(block)) return block;
    if (selected.row === undefined || selected.col === undefined || selected.para === undefined) return undefined;
    return block.rows[selected.row]?.[selected.col]?.[selected.para];
  }

  function storyText(): string {
    const parts: string[] = [];
    for (const block of section.blocks) {
      if (!isDocTable(block)) {
        parts.push(block.runs.map((run) => run.text).join(""));
        continue;
      }
      for (const row of block.rows) {
        for (const cell of row) {
          for (const item of cell) parts.push(item.runs.map((run) => run.text).join(""));
        }
      }
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

  function snapshot(): string {
    return JSON.stringify(section.blocks);
  }
}

function textRuns(item: DocParagraph | undefined): DocRun[] {
  return item?.runs.filter((run) => !run.image) ?? [];
}

function writeText(item: DocParagraph, text: string): void {
  const style = item.runs.find((run) => !run.image);
  const run: DocRun = { text };
  if (style?.bold) run.bold = true;
  if (style?.italic) run.italic = true;
  if (style?.fontSize) run.fontSize = style.fontSize;
  if (style?.color) run.color = style.color;
  item.runs = [run];
}

function runNode(run: DocRun): HTMLElement {
  if (run.image) {
    const mark = el("span", "doc-image");
    mark.textContent = "[图]";
    return mark;
  }
  const span = document.createElement("span");
  span.textContent = run.text;
  if (run.bold) span.style.fontWeight = "700";
  if (run.italic) span.style.fontStyle = "italic";
  if (run.fontSize) span.style.fontSize = `${run.fontSize}px`;
  if (run.color) span.style.color = run.color;
  return span;
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

function stamp(node: HTMLElement, spot: Spot): void {
  node.dataset.block = String(spot.block);
  if (spot.row !== undefined) node.dataset.row = String(spot.row);
  if (spot.col !== undefined) node.dataset.col = String(spot.col);
  if (spot.para !== undefined) node.dataset.para = String(spot.para);
}

function sameSpot(a: Spot, b: Spot): boolean {
  return a.block === b.block && a.row === b.row && a.col === b.col && a.para === b.para;
}

function sides(margin: { top: number; bottom: number; left: number; right: number }): string {
  const px = (twips: number) => `${(twips * 96) / 1440}px`;
  return `${px(margin.top)} ${px(margin.right)} ${px(margin.bottom)} ${px(margin.left)}`;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
