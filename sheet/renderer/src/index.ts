import type { SheetCell, Workbook, Worksheet } from "@sliiu/sheet-core";

export interface SheetEditOptions {
  locale?: "zh-CN" | "en";
  onChange?: () => void;
  onStatus?: (text: string) => void;
  onSelection?: () => void;
}

export interface SheetGrid {
  destroy(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  bold(): void;
  boldOn(): boolean;
  clearCell(): void;
  insertRow(): void;
  find(query: string): number;
  sum(): void;
  formatNumbers(): void;
  reload(): void;
}

/** Grid you can edit. A value that starts with "=" is left as typed; nothing is calculated until Sum. */
export function mountWorkbook(host: HTMLElement, workbook: Workbook, options: SheetEditOptions = {}): SheetGrid {
  const locale = options.locale ?? "en";
  const zh = locale === "zh-CN";
  const sheets = workbook.sheets.length ? workbook.sheets : [{ name: "Sheet1", cells: [] }];
  if (!workbook.sheets.length) workbook.sheets = sheets;
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  let active = 0;
  let selected = { row: 0, col: 0 };
  let armed = false;

  const root = el("div", "sheet-view");
  const tabs = el("div", "sheet-tabs");
  const frame = el("div", "sheet-frame");
  const buttons: HTMLButtonElement[] = [];
  sheets.forEach((sheet, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-tab";
    button.textContent = sheet.name;
    button.addEventListener("click", () => show(index));
    buttons.push(button);
    tabs.append(button);
  });
  root.append(frame, tabs);
  host.append(root);
  show(0);

  return {
    destroy: () => root.remove(),
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    bold,
    boldOn,
    clearCell,
    insertRow,
    find,
    sum,
    formatNumbers,
    reload: paint,
  };

  function show(index: number): void {
    active = index;
    buttons.forEach((button, item) => button.classList.toggle("is-active", item === index));
    paint();
  }

  function paint(): void {
    frame.replaceChildren(grid(currentSheet()));
  }

  function grid(sheet: Worksheet): HTMLElement {
    const table = el("table", "sheet-grid");
    const columns = Math.max(1, sheet.cells.reduce((widest, row) => Math.max(widest, row.length), 1));
    const rows = Math.max(sheet.cells.length, 1);
    const head = document.createElement("tr");
    head.append(cell("th", ""));
    for (let column = 0; column < columns; column += 1) head.append(cell("th", columnName(column)));
    table.append(head);
    for (let row = 0; row < rows; row += 1) {
      const line = document.createElement("tr");
      line.append(cell("th", String(row + 1)));
      for (let column = 0; column < columns; column += 1) {
        line.append(dataCell(sheet, row, column));
      }
      table.append(line);
    }
    return table;
  }

  function dataCell(sheet: Worksheet, row: number, column: number): HTMLTableCellElement {
    const item = sheet.cells[row]?.[column];
    const td = document.createElement("td");
    td.textContent = item?.value ?? "";
    td.dataset.row = String(row);
    td.dataset.col = String(column);
    if (item?.bold) td.style.fontWeight = "700";
    if (item?.value.startsWith("=")) td.classList.add("is-formula");
    if (selected.row === row && selected.col === column) td.classList.add("is-selected");
    if (!item?.value.startsWith("=")) {
      td.contentEditable = "true";
      td.addEventListener("focus", () => {
        selected = { row, col: column };
        arm();
        markSelected();
        options.onSelection?.();
      });
      td.addEventListener("blur", () => {
        armed = false;
      });
      td.addEventListener("input", () => {
        ensure(row, column).value = td.textContent ?? "";
        touch();
      });
    }
    return td;
  }

  function bold(): void {
    const item = ensure(selected.row, selected.col);
    if (item.value.startsWith("=")) return;
    remember();
    if (item.bold) delete item.bold;
    else item.bold = true;
    finish();
  }

  function boldOn(): boolean {
    return currentSheet().cells[selected.row]?.[selected.col]?.bold === true;
  }

  function clearCell(): void {
    const item = currentSheet().cells[selected.row]?.[selected.col];
    if (!item || item.value.startsWith("=")) return;
    remember();
    item.value = "";
    finish();
  }

  function insertRow(): void {
    remember();
    currentSheet().cells.splice(selected.row, 0, []);
    finish();
  }

  function find(query: string): number {
    const needle = query.trim().toLowerCase();
    let count = 0;
    for (const node of frame.querySelectorAll<HTMLElement>("td")) {
      const hit = needle.length > 0 && (node.textContent ?? "").toLowerCase().includes(needle);
      node.classList.toggle("is-hit", hit);
      if (hit) count += 1;
    }
    frame.querySelector(".is-hit")?.scrollIntoView({ block: "nearest" });
    return count;
  }

  function sum(): void {
    let total = 0;
    let count = 0;
    for (const row of currentSheet().cells) {
      for (const item of row) {
        if (!item || item.value.startsWith("=")) continue;
        if (!/^-?\d+(?:\.\d+)?$/.test(item.value)) continue;
        total += Number(item.value);
        count += 1;
      }
    }
    const shown = Number.isInteger(total) ? String(total) : String(Math.round(total * 1000) / 1000);
    options.onStatus?.(zh ? `合计 ${shown}（${count}）` : `Sum ${shown} (${count})`);
  }

  function formatNumbers(): void {
    remember();
    let count = 0;
    for (const row of currentSheet().cells) {
      for (const item of row) {
        if (!item || item.value.startsWith("=")) continue;
        if (!/^-?\d+(?:\.\d+)?$/.test(item.value)) continue;
        item.value = Number(item.value).toFixed(2);
        count += 1;
      }
    }
    finish();
    options.onStatus?.(zh ? `已格式化 ${count} 个` : `Formatted ${count}`);
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
    const parsed = JSON.parse(json) as { index: number; cells: SheetCell[][] };
    const sheet = sheets[parsed.index];
    if (!sheet) return;
    sheet.cells = parsed.cells;
    active = parsed.index;
    touch();
    show(parsed.index);
    options.onSelection?.();
  }

  function currentSheet(): Worksheet {
    return workbook.sheets[active] ?? workbook.sheets[0]!;
  }

  function ensure(row: number, column: number): SheetCell {
    const sheet = currentSheet();
    const line = sheet.cells[row] ?? [];
    sheet.cells[row] = line;
    const item = line[column] ?? { value: "" };
    line[column] = item;
    return item;
  }

  function finish(): void {
    touch();
    paint();
    options.onSelection?.();
  }

  function touch(): void {
    workbook.edited = true;
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
    return JSON.stringify({ index: active, cells: currentSheet().cells });
  }

  function markSelected(): void {
    for (const node of frame.querySelectorAll<HTMLElement>("td")) {
      node.classList.toggle("is-selected", node.dataset.row === String(selected.row) && node.dataset.col === String(selected.col));
    }
  }
}

function columnName(index: number): string {
  let name = "";
  let next = index + 1;
  while (next > 0) {
    next -= 1;
    name = String.fromCharCode(65 + (next % 26)) + name;
    next = Math.floor(next / 26);
  }
  return name;
}

function cell(tag: "th" | "td", text: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}
