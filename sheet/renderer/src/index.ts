import type { Workbook, Worksheet } from "@sliiu/sheet-core";

export interface SheetGrid {
  destroy(): void;
}

/** Read-only grid. Editing and formula evaluation come later, so this view never changes the workbook. */
export function mountWorkbook(host: HTMLElement, workbook: Workbook): SheetGrid {
  host.replaceChildren();
  const root = el("div", "sheet-view");
  const tabs = el("div", "sheet-tabs");
  const frame = el("div", "sheet-frame");
  const sheets = workbook.sheets.length ? workbook.sheets : [{ name: "Sheet1", cells: [] }];
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
  return { destroy: () => host.replaceChildren() };

  function show(active: number): void {
    buttons.forEach((button, index) => button.classList.toggle("is-active", index === active));
    frame.replaceChildren(grid(sheets[active] ?? sheets[0]!));
  }
}

function grid(sheet: Worksheet): HTMLElement {
  const table = el("table", "sheet-grid");
  const columns = sheet.cells.reduce((widest, row) => Math.max(widest, row.length), 1);
  const rows = Math.max(sheet.cells.length, 1);
  const head = document.createElement("tr");
  head.append(cell("th", ""));
  for (let column = 0; column < columns; column += 1) head.append(cell("th", columnName(column)));
  table.append(head);
  for (let row = 0; row < rows; row += 1) {
    const line = document.createElement("tr");
    line.append(cell("th", String(row + 1)));
    for (let column = 0; column < columns; column += 1) {
      const item = sheet.cells[row]?.[column];
      const td = cell("td", item?.value ?? "");
      if (item?.bold) td.style.fontWeight = "700";
      line.append(td);
    }
    table.append(line);
  }
  return table;
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
