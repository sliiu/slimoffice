import type {
  SheetAlign,
  ConsolidateFunc,
  SheetCell,
  SheetCfRule,
  SheetChartKind,
  SheetFormControl,
  SheetPageSetup,
  SheetShapeKind,
  SheetSparklineKind,
  SheetTheme,
  SheetVAlign,
  SheetValidation,
  Workbook,
  Worksheet,
} from "@sliiu/sheet-core";
import { consolidateRanges, formatNumber, recalculate } from "@sliiu/sheet-formula";
import { renderCharts } from "./charts";
import { cfLook } from "./cf";

const FROZEN_HEADER = 24;
const FROZEN_GUTTER = 36;
const FROZEN_ROW = 22;
const FROZEN_COLUMN = 88;

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
  italic(): void;
  italicOn(): boolean;
  underline(): void;
  underlineOn(): boolean;
  strike(): void;
  strikeOn(): boolean;
  clearCell(): void;
  clearFormat(): void;
  insertRow(): void;
  insertColumn(): void;
  deleteRow(): void;
  deleteColumn(): void;
  find(query: string): number;
  replace(query: string, next: string): number;
  sum(): void;
  autoSum(): void;
  formatNumbers(): void;
  numFmt(pattern: string): void;
  align(value: SheetAlign): void;
  valign(value: SheetVAlign): void;
  wrap(): void;
  wrapOn(): boolean;
  merge(): void;
  unmerge(): void;
  fillDown(): void;
  fillRight(): void;
  sort(ascending?: boolean): void;
  freeze(): void;
  color(hex: string): void;
  fill(hex: string): void;
  font(name: string): void;
  fontSize(pixels: number): void;
  hyperlink(url: string): void;
  comment(text: string): void;
  addSheet(name?: string): void;
  symbol(text: string): void;
  applyStyle(name: string): void;
  formatCell(patch: { numFmt?: string; font?: string; fontSize?: number; color?: string; fill?: string; align?: SheetCell["align"]; bold?: boolean }): void;
  printArea(): void;
  fitTo(width: number, height?: number): void;
  recalculate(): void;
  zoom(factor: number): void;
  zoomOn(): number;
  toggleGrid(): void;
  gridOn(): boolean;
  toggleFormulaBar(): void;
  formulaBarOn(): boolean;
  removeDuplicates(): number;
  textToColumns(delimiter?: string): void;
  protect(on?: boolean): void;
  protectedOn(): boolean;
  filter(): void;
  filterOn(): boolean;
  hideRow(): void;
  hideColumn(): void;
  unhide(): void;
  indent(delta?: number): void;
  listMacros(): string[];
  addChart(kind?: SheetChartKind, range?: string, title?: string): void;
  addSparkline(kind?: SheetSparklineKind, data?: string): void;
  addConditionalFormat(rule: SheetCfRule, rows?: number, cols?: number): void;
  addTable(name?: string): void;
  addPivot(name?: string): void;
  pageSetup(patch: SheetPageSetup): void;
  pageSetupOn(): SheetPageSetup | undefined;
  printPreview(): void;
  setRowHeight(points?: number): void;
  setColumnWidth(chars?: number): void;
  insertCells(shift?: "right" | "down"): void;
  deleteCells(shift?: "left" | "up"): void;
  increaseDecimals(): void;
  decreaseDecimals(): void;
  thousandSeparator(): void;
  defineName(name?: string, refersTo?: string): void;
  goToSpecial(kind?: "blanks" | "formulas" | "constants"): number;
  border(style?: "thin" | "medium" | "thick" | "dashed" | "dotted", color?: string): void;
  copyCell(): void;
  cutCell(): void;
  pasteCell(): void;
  formatPainter(): void;
  workbookStats(): { sheets: number; cells: number; formulas: number };
  addShape(kind?: SheetShapeKind, text?: string): void;
  setTheme(theme: SheetTheme): void;
  themeOn(): SheetTheme | undefined;
  addValidation(rule?: Partial<SheetValidation>): void;
  addFormControl(kind?: SheetFormControl["kind"], label?: string): void;
  addSlicer(field?: string): void;
  addXmlMap(name?: string): void;
  groupRows(): void;
  ungroupRows(): void;
  subtotal(): void;
  pageBreak(): void;
  alignObjects(mode?: "left" | "center" | "right"): void;
  spellCheck(): number;
  tracePrecedents(): string[];
  traceDependents(): string[];
  errorCheck(): string[];
  allowEditRange(name?: string, range?: string): void;
  setArrayFormula(formula?: string): void;
  whatIf(target?: number): void;
  consolidate(spec?: { func?: ConsolidateFunc; sources?: string[]; dest?: string; topRow?: boolean; leftCol?: boolean; links?: boolean }): void;
  forecast(): void;
  reload(): void;
  selected(): { row: number; col: number; sheet: number };
}

/** Editable grid with Home-tab commands and formula recalculation. */
export function mountWorkbook(host: HTMLElement, workbook: Workbook, options: SheetEditOptions = {}): SheetGrid {
  const locale = options.locale ?? "en";
  const zh = locale === "zh-CN";
  const sheets = workbook.sheets.length ? workbook.sheets : [{ name: "Sheet1", cells: [] }];
  if (!workbook.sheets.length) workbook.sheets = sheets;
  if (workbook.calcMode !== "manual") recalculate(workbook);
  const undoStack: string[] = [];
  const redoStack: string[] = [];
  let active = 0;
  let selected = { row: 0, col: 0 };
  let armed = false;
  let showFormulaBar = true;
  let zoomFactor = 1;
  let clipboard: { cell: SheetCell; cut: boolean } | undefined;
  let painter: SheetCell | undefined;

  const root = el("div", "sheet-view");
  const bar = el("div", "sheet-formula-bar");
  const refLabel = el("div", "sheet-ref");
  const formulaInput = document.createElement("input");
  formulaInput.className = "sheet-formula-input";
  formulaInput.addEventListener("change", () => commitFormula(formulaInput.value));
  bar.append(refLabel, formulaInput);
  const tabs = el("div", "sheet-tabs");
  const frame = el("div", "sheet-frame");
  const buttons: HTMLButtonElement[] = [];
  rebuildTabs();
  root.append(bar, frame, tabs);
  host.append(root);
  show(0);

  return {
    destroy: () => root.remove(),
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    bold: () => toggleFlag("bold"),
    boldOn: () => !!currentCell()?.bold,
    italic: () => toggleFlag("italic"),
    italicOn: () => !!currentCell()?.italic,
    underline: () => toggleFlag("underline"),
    underlineOn: () => !!currentCell()?.underline,
    strike: () => toggleFlag("strike"),
    strikeOn: () => !!currentCell()?.strike,
    clearCell,
    clearFormat,
    insertRow,
    insertColumn,
    deleteRow,
    deleteColumn,
    find,
    replace,
    sum,
    autoSum,
    formatNumbers: () => numFmt("0.00"),
    numFmt,
    align: (value) => setStyle({ align: value }),
    valign: (value) => setStyle({ valign: value }),
    wrap: () => {
      const cell = ensure(selected.row, selected.col);
      remember();
      cell.wrap = !cell.wrap;
      finish();
    },
    wrapOn: () => !!currentCell()?.wrap,
    merge,
    unmerge,
    fillDown,
    fillRight,
    sort,
    freeze,
    color: (hex) => setStyle({ color: hex }),
    fill: (hex) => setStyle({ fill: hex }),
    font: (name) => setStyle({ font: name }),
    fontSize: (pixels) => setStyle({ fontSize: pixels }),
    hyperlink: (url) => setStyle({ hyperlink: url }),
    comment: (text) => setStyle({ comment: text }),
    addSheet,
    symbol,
    applyStyle,
    formatCell,
    printArea,
    fitTo,
    recalculate: () => {
      remember();
      recalculate(workbook);
      finish();
    },
    zoom: (factor) => {
      zoomFactor = Math.min(4, Math.max(0.25, factor));
      paint();
    },
    zoomOn: () => zoomFactor,
    toggleGrid: () => {
      const sheet = currentSheet();
      remember();
      sheet.showGrid = sheet.showGrid === false;
      finish();
    },
    gridOn: () => currentSheet().showGrid !== false,
    toggleFormulaBar: () => {
      showFormulaBar = !showFormulaBar;
      syncBar();
    },
    formulaBarOn: () => showFormulaBar,
    removeDuplicates,
    textToColumns,
    protect: (on) => {
      remember();
      currentSheet().protected = on ?? !currentSheet().protected;
      finish();
    },
    protectedOn: () => !!currentSheet().protected,
    filter: () => {
      remember();
      const sheet = currentSheet();
      sheet.filter = sheet.filter
        ? null
        : { r1: 0, c1: 0, r2: Math.max(0, sheet.cells.length - 1), c2: Math.max(0, (sheet.cells[0]?.length ?? 1) - 1) };
      finish();
    },
    filterOn: () => !!currentSheet().filter,
    hideRow: () => {
      remember();
      const sheet = currentSheet();
      const hidden = new Set(sheet.hiddenRows ?? []);
      hidden.add(selected.row);
      sheet.hiddenRows = [...hidden].sort((a, b) => a - b);
      finish();
    },
    hideColumn: () => {
      remember();
      const sheet = currentSheet();
      const hidden = new Set(sheet.hiddenCols ?? []);
      hidden.add(selected.col);
      sheet.hiddenCols = [...hidden].sort((a, b) => a - b);
      finish();
    },
    unhide: () => {
      remember();
      const sheet = currentSheet();
      sheet.hiddenRows = undefined;
      sheet.hiddenCols = undefined;
      finish();
    },
    indent: (delta = 1) => {
      const cell = ensure(selected.row, selected.col);
      remember();
      cell.indent = Math.max(0, (cell.indent ?? 0) + delta);
      finish();
    },
    listMacros,
    addChart,
    addSparkline,
    addConditionalFormat,
    addTable,
    addPivot,
    pageSetup: (patch) => {
      remember();
      currentSheet().pageSetup = { ...(currentSheet().pageSetup ?? {}), ...patch };
      finish();
    },
    pageSetupOn: () => currentSheet().pageSetup,
    printPreview,
    setRowHeight,
    setColumnWidth,
    insertCells,
    deleteCells,
    increaseDecimals: () => bumpDecimals(1),
    decreaseDecimals: () => bumpDecimals(-1),
    thousandSeparator: () => numFmt("#,##0.00"),
    defineName,
    goToSpecial,
    border,
    copyCell,
    cutCell,
    pasteCell,
    formatPainter,
    workbookStats,
    addShape,
    setTheme,
    themeOn: () => workbook.theme,
    addValidation,
    addFormControl,
    addSlicer,
    addXmlMap,
    groupRows,
    ungroupRows,
    subtotal,
    pageBreak,
    alignObjects,
    spellCheck,
    tracePrecedents,
    traceDependents,
    errorCheck,
    allowEditRange,
    setArrayFormula,
    whatIf,
    consolidate,
    forecast,
    reload: paint,
    selected: () => ({ row: selected.row, col: selected.col, sheet: active }),
  };

  function rebuildTabs(): void {
    tabs.replaceChildren();
    buttons.length = 0;
    workbook.sheets.forEach((sheet, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sheet-tab";
      button.textContent = sheet.name;
      button.addEventListener("click", () => show(index));
      buttons.push(button);
      tabs.append(button);
    });
  }

  function show(index: number): void {
    active = index;
    buttons.forEach((button, item) => button.classList.toggle("is-active", item === index));
    paint();
  }

  function paint(): void {
    if (workbook.calcMode !== "manual") recalculate(workbook);
    const sheet = currentSheet();
    frame.replaceChildren(grid(sheet), renderCharts(sheet));
    frame.style.zoom = String(zoomFactor);
    frame.dataset.zoom = String(zoomFactor);
    frame.classList.toggle("is-print-preview", !!sheet.pageSetup?.orientation);
    frame.style.fontFamily = workbook.theme?.fonts?.minor ?? "";
    const accent = workbook.theme?.colors?.[4];
    if (accent) frame.style.setProperty("--sheet-accent", accent);
    else frame.style.removeProperty("--sheet-accent");
    const scale = sheet.pageSetup?.scale ?? (sheet.pageSetup?.fitToWidth || sheet.pageSetup?.fitToHeight ? 100 : undefined);
    frame.dataset.scale = scale != null ? String(scale) : "";
    syncBar();
  }

  function syncBar(): void {
    bar.hidden = !showFormulaBar;
    refLabel.textContent = `${columnName(selected.col)}${selected.row + 1}`;
    const cell = currentCell();
    formulaInput.value = cell?.formula ? `=${cell.formula}` : (cell?.value ?? "");
  }

  function grid(sheet: Worksheet): HTMLElement {
    const table = el("table", "sheet-grid");
    if (sheet.showGrid === false) table.classList.add("no-grid");
    const columns = Math.max(1, sheet.cells.reduce((widest, row) => Math.max(widest, row?.length ?? 0), 1), ...(sheet.merges ?? []).map((m) => m.c2 + 1));
    const rows = Math.max(sheet.cells.length, 1, ...(sheet.merges ?? []).map((m) => m.r2 + 1));
    const head = document.createElement("tr");
    head.append(cell("th", ""));
    for (let column = 0; column < columns; column += 1) {
      if (sheet.hiddenCols?.includes(column)) continue;
      const th = cell("th", columnName(column));
      if (sheet.colWidths?.[column]) th.style.width = `${sheet.colWidths[column]! * 8}px`;
      head.append(th);
    }
    table.append(head);
    for (let row = 0; row < rows; row += 1) {
      if (sheet.hiddenRows?.includes(row)) continue;
      const line = document.createElement("tr");
      if (sheet.rowHeights?.[row]) line.style.height = `${sheet.rowHeights[row]}pt`;
      line.append(cell("th", String(row + 1)));
      for (let column = 0; column < columns; column += 1) {
        if (sheet.hiddenCols?.includes(column)) continue;
        if (coveredByMerge(sheet, row, column)) continue;
        line.append(dataCell(sheet, row, column));
      }
      table.append(line);
    }
    return table;
  }

  function coveredByMerge(sheet: Worksheet, row: number, column: number): boolean {
    return (sheet.merges ?? []).some((m) => row >= m.r1 && row <= m.r2 && column >= m.c1 && column <= m.c2 && !(row === m.r1 && column === m.c1));
  }

  function mergeSpan(sheet: Worksheet, row: number, column: number): SheetMergeHit | undefined {
    return (sheet.merges ?? []).find((m) => m.r1 === row && m.c1 === column);
  }

  function dataCell(sheet: Worksheet, row: number, column: number): HTMLTableCellElement {
    const item = sheet.cells[row]?.[column];
    const td = document.createElement("td");
    td.textContent = shown(item);
    td.dataset.row = String(row);
    td.dataset.col = String(column);
    applyLook(td, item, row, column);
    const look = cfLook(sheet, row, column, item);
    if (look.icon) td.textContent = `${look.icon} ${td.textContent}`;

    const span = mergeSpan(sheet, row, column);
    if (span) {
      td.colSpan = span.c2 - span.c1 + 1;
      td.rowSpan = span.r2 - span.r1 + 1;
    }
    const note = [item?.comment, validationHint(sheet, row, column)].filter((text) => text).join("\n");
    if (note) td.title = note;
    const rule = validationAt(sheet, row, column);
    if (rule) td.dataset.validation = rule.type;
    if (item?.formula) td.classList.add("is-formula");
    if (item?.array) td.dataset.array = "1";
    const tableRange = tableRangeAt(sheet, row, column);
    if (tableRange) {
      td.dataset.table = tableRange.name;
      if (tableRange.headerRow && row === tableRange.r1) td.classList.add("is-table-header");
    }
    if (inPrintArea(sheet, row, column)) td.dataset.printArea = "1";
    const consolidation = sheet.consolidation;
    if (consolidation && inConsolidation(consolidation, row, column)) td.dataset.consolidation = consolidation.func;
    if (sheet.outline?.rows?.includes(row)) td.dataset.outline = "row";
    if (sheet.outline?.cols?.includes(column)) td.dataset.outline = "col";
    if (sheet.pageBreaks?.rows?.includes(row + 1)) td.dataset.pageBreak = "row";
    if (sheet.pageBreaks?.cols?.includes(column + 1)) td.dataset.pageBreak = "col";
    const table = dataTableAt(sheet, row, column);
    if (table) td.dataset.dataTable = [table.rowInput, table.colInput].filter((part) => part).join(" ");
    if (sheet.filter && row === sheet.filter.r1 && column >= sheet.filter.c1 && column <= sheet.filter.c2) {
      td.classList.add("is-filter-header");
    }
    if (item?.hyperlink) {
      td.classList.add("is-link");
      td.title = [td.title, item.hyperlink].filter((text) => text).join("\n");
    }
    if (sheet.freeze && (row < sheet.freeze.row || column < sheet.freeze.col)) {
      td.classList.add("is-frozen");
      if (row < sheet.freeze.row) td.style.top = `${FROZEN_HEADER + row * FROZEN_ROW}px`;
      if (column < sheet.freeze.col) td.style.left = `${FROZEN_GUTTER + column * FROZEN_COLUMN}px`;
    }
    if (selected.row === row && selected.col === column) td.classList.add("is-selected");
    td.contentEditable = sheet.protected && !editRangeAt(sheet, row, column) ? "false" : "true";
    td.addEventListener("focus", () => {
      selected = { row, col: column };
      arm();
      markSelected();
      syncBar();
      options.onSelection?.();
    });
    td.addEventListener("blur", () => {
      armed = false;
    });
    td.addEventListener("input", () => {
      const next = td.textContent ?? "";
      const cell = ensure(row, column);
      if (next.startsWith("=")) {
        cell.formula = next.slice(1);
        cell.value = next;
      } else {
        delete cell.formula;
        cell.value = next;
      }
      touch();
    });
    return td;
  }

  function tableRangeAt(sheet: Worksheet, row: number, column: number): NonNullable<Worksheet["tables"]>[number] | undefined {
    return sheet.tables?.find((item) => row >= item.r1 && row <= item.r2 && column >= item.c1 && column <= item.c2);
  }

  function editRangeAt(sheet: Worksheet, row: number, column: number): boolean {
    return (sheet.allowEditRanges ?? []).some((item) => {
      const range = rangeOf(item.range);
      return !!range && row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2;
    });
  }

  function inConsolidation(consolidation: NonNullable<Worksheet["consolidation"]>, row: number, column: number): boolean {
    const dest = rangeOf(consolidation.dest.split("!").pop() ?? "");
    if (!dest) return false;
    const rows = consolidation.rows ?? 1;
    const cols = consolidation.cols ?? 1;
    return row >= dest.r1 && row < dest.r1 + rows && column >= dest.c1 && column < dest.c1 + cols;
  }

  function inPrintArea(sheet: Worksheet, row: number, column: number): boolean {
    const area = sheet.pageSetup?.printArea;
    if (!area) return false;
    const range = rangeOf(area.split("!").pop() ?? "");
    return !!range && row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2;
  }

  function dataTableAt(sheet: Worksheet, row: number, column: number): NonNullable<Worksheet["dataTables"]>[number] | undefined {
    return sheet.dataTables?.find((item) => {
      const range = rangeOf(item.ref);
      return !!range && row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2;
    });
  }

  function rangeOf(ref: string): { r1: number; c1: number; r2: number; c2: number } | undefined {
    const parts = ref.split(":");
    const start = parseA1(parts[0] ?? "");
    const end = parseA1(parts[1] ?? parts[0] ?? "");
    if (!start || !end) return undefined;
    return { r1: Math.min(start.row, end.row), c1: Math.min(start.col, end.col), r2: Math.max(start.row, end.row), c2: Math.max(start.col, end.col) };
  }

  function parseA1(ref: string): { row: number; col: number } | undefined {
    const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim());
    if (!match) return undefined;
    let col = 0;
    for (const letter of (match[1] ?? "").toUpperCase()) col = col * 26 + letter.charCodeAt(0) - 64;
    return { row: Number(match[2]) - 1, col: col - 1 };
  }

  function validationAt(sheet: Worksheet, row: number, column: number): SheetValidation | undefined {
    return sheet.validations?.find((item) => row >= item.r1 && row <= item.r2 && column >= item.c1 && column <= item.c2);
  }

  function validationHint(sheet: Worksheet, row: number, column: number): string {
    const rule = validationAt(sheet, row, column);
    if (!rule) return "";
    if (rule.type === "list") return rule.formula1 ?? "";
    return [rule.type, rule.formula1, rule.formula2].filter((part) => part).join(" ");
  }

  function shown(item: SheetCell | undefined): string {
    const value = item?.value ?? "";
    if (!item?.numFmt || item.numFmt === "@" || !/^-?\d+(?:\.\d+)?$/.test(value)) return value;
    return formatNumber(Number(value), item.numFmt);
  }

  function applyLook(td: HTMLTableCellElement, item: SheetCell | undefined, row = selected.row, column = selected.col): void {
    const cf = cfLook(currentSheet(), row, column, item);
    if (item?.bold) td.style.fontWeight = "700";
    if (item?.italic) td.style.fontStyle = "italic";
    if (item?.underline) td.style.textDecoration = `${td.style.textDecoration} underline`.trim();
    if (item?.strike) td.style.textDecoration = `${td.style.textDecoration} line-through`.trim();
    if (item?.font) td.style.fontFamily = item.font;
    if (item?.fontSize) td.style.fontSize = `${item.fontSize}px`;
    if (item?.color || cf.color) td.style.color = item?.color ?? cf.color ?? "";
    if (item?.fill || cf.fill) td.style.background = item?.fill ?? cf.fill ?? "";
    if (item?.align) td.style.textAlign = item.align;
    if (item?.valign) td.style.verticalAlign = item.valign === "middle" ? "middle" : item.valign;
    if (item?.border) {
      if (item.border.top) td.style.borderTop = cssBorder(item.border.top);
      if (item.border.right) td.style.borderRight = cssBorder(item.border.right);
      if (item.border.bottom) td.style.borderBottom = cssBorder(item.border.bottom);
      if (item.border.left) td.style.borderLeft = cssBorder(item.border.left);
    }
    if (item?.wrap) td.style.whiteSpace = "normal";
    if (item?.indent) td.style.paddingLeft = `${8 + item.indent * 12}px`;
    if (cf.bar != null) {
      td.style.backgroundImage = `linear-gradient(90deg, ${cf.fill ?? "#93c5fd"} ${(cf.bar * 100).toFixed(1)}%, transparent 0)`;
    }
    if (cf.icon) td.dataset.icon = cf.icon;
  }

  function toggleFlag(flag: "bold" | "italic" | "underline" | "strike"): void {
    const item = ensure(selected.row, selected.col);
    remember();
    if (item[flag]) delete item[flag];
    else item[flag] = true;
    finish();
  }

  function setStyle(patch: Partial<SheetCell>): void {
    const item = ensure(selected.row, selected.col);
    remember();
    Object.assign(item, patch);
    finish();
  }

  function clearCell(): void {
    const item = currentSheet().cells[selected.row]?.[selected.col];
    if (!item) return;
    remember();
    item.value = "";
    delete item.formula;
    finish();
  }

  function clearFormat(): void {
    const item = currentCell();
    if (!item) return;
    remember();
    const value = item.value;
    const formula = item.formula;
    const next: SheetCell = { value };
    if (formula) next.formula = formula;
    currentSheet().cells[selected.row]![selected.col] = next;
    finish();
  }

  function insertRow(): void {
    remember();
    currentSheet().cells.splice(selected.row, 0, []);
    shiftMerges(1, 0);
    finish();
  }

  function insertColumn(): void {
    remember();
    for (const row of currentSheet().cells) row?.splice(selected.col, 0, undefined as unknown as SheetCell);
    shiftMerges(0, 1);
    finish();
  }

  function deleteRow(): void {
    remember();
    currentSheet().cells.splice(selected.row, 1);
    finish();
  }

  function deleteColumn(): void {
    remember();
    for (const row of currentSheet().cells) row?.splice(selected.col, 1);
    finish();
  }

  function shiftMerges(rowDelta: number, colDelta: number): void {
    const sheet = currentSheet();
    if (!sheet.merges) return;
    for (const merge of sheet.merges) {
      if (rowDelta && merge.r1 >= selected.row) {
        merge.r1 += rowDelta;
        merge.r2 += rowDelta;
      }
      if (colDelta && merge.c1 >= selected.col) {
        merge.c1 += colDelta;
        merge.c2 += colDelta;
      }
    }
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

  function replace(query: string, next: string): number {
    const needle = query.trim();
    if (!needle) return 0;
    remember();
    let count = 0;
    for (const row of currentSheet().cells) {
      for (const item of row ?? []) {
        if (!item || item.formula) continue;
        if (!item.value.includes(needle)) continue;
        item.value = item.value.split(needle).join(next);
        count += 1;
      }
    }
    finish();
    return count;
  }

  function sum(): void {
    let total = 0;
    let count = 0;
    for (const row of currentSheet().cells) {
      for (const item of row ?? []) {
        if (!item || item.formula) continue;
        if (!/^-?\d+(?:\.\d+)?$/.test(item.value)) continue;
        total += Number(item.value);
        count += 1;
      }
    }
    const shown = Number.isInteger(total) ? String(total) : String(Math.round(total * 1000) / 1000);
    options.onStatus?.(zh ? `合计 ${shown}（${count}）` : `Sum ${shown} (${count})`);
  }

  function autoSum(): void {
    remember();
    const sheet = currentSheet();
    let r = selected.row - 1;
    while (r >= 0 && /^-?\d+(?:\.\d+)?$/.test(sheet.cells[r]?.[selected.col]?.value ?? "")) r -= 1;
    const start = r + 1;
    const end = selected.row - 1;
    const cell = ensure(selected.row, selected.col);
    if (end >= start) {
      cell.formula = `SUM(${columnName(selected.col)}${start + 1}:${columnName(selected.col)}${end + 1})`;
    } else {
      cell.formula = `SUM(${columnName(selected.col)}1:${columnName(selected.col)}${selected.row})`;
    }
    recalculate(workbook);
    finish();
  }

  function numFmt(pattern: string): void {
    remember();
    let count = 0;
    for (const row of currentSheet().cells) {
      for (const item of row ?? []) {
        if (!item || item.formula) continue;
        if (!/^-?\d+(?:\.\d+)?$/.test(item.value)) continue;
        item.numFmt = pattern;
        if (pattern === "0.00") item.value = Number(item.value).toFixed(2);
        if (pattern === "0%") item.value = `${Math.round(Number(item.value) * 100)}%`;
        if (pattern === "#,##0.00") item.value = Number(item.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        count += 1;
      }
    }
    finish();
    options.onStatus?.(zh ? `已格式化 ${count} 个` : `Formatted ${count}`);
  }

  function merge(): void {
    remember();
    const sheet = currentSheet();
    const merges = sheet.merges ?? [];
    merges.push({ r1: selected.row, c1: selected.col, r2: selected.row, c2: selected.col + 1 });
    sheet.merges = merges;
    const left = ensure(selected.row, selected.col);
    left.align = "center";
    finish();
  }

  function unmerge(): void {
    remember();
    const sheet = currentSheet();
    sheet.merges = (sheet.merges ?? []).filter((m) => !(selected.row >= m.r1 && selected.row <= m.r2 && selected.col >= m.c1 && selected.col <= m.c2));
    finish();
  }

  function fillDown(): void {
    remember();
    const src = currentSheet().cells[selected.row]?.[selected.col];
    if (!src) return;
    const dest = ensure(selected.row + 1, selected.col);
    Object.assign(dest, structuredClone(src));
    finish();
  }

  function fillRight(): void {
    remember();
    const src = currentSheet().cells[selected.row]?.[selected.col];
    if (!src) return;
    const dest = ensure(selected.row, selected.col + 1);
    Object.assign(dest, structuredClone(src));
    finish();
  }

  function sort(ascending = true): void {
    remember();
    const sheet = currentSheet();
    const col = selected.col;
    const body = sheet.cells.slice();
    body.sort((a, b) => {
      const av = a?.[col]?.value ?? "";
      const bv = b?.[col]?.value ?? "";
      const an = Number(av);
      const bn = Number(bv);
      if (Number.isFinite(an) && Number.isFinite(bn)) return ascending ? an - bn : bn - an;
      return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    sheet.cells = body;
    finish();
  }

  function freeze(): void {
    remember();
    currentSheet().freeze = { row: selected.row, col: selected.col };
    finish();
    options.onStatus?.(zh ? `已冻结到 ${columnName(selected.col)}${selected.row + 1}` : `Frozen at ${columnName(selected.col)}${selected.row + 1}`);
  }

  function addSheet(name?: string): void {
    remember();
    const label = name ?? `Sheet${workbook.sheets.length + 1}`;
    workbook.sheets.push({ name: label, cells: [] });
    const source = workbook.source;
    if (source) {
      const index = workbook.sheets.length;
      const bytes = source.get("xl/worksheets/sheet1.xml");
      if (bytes) source.set(`xl/worksheets/sheet${index}.xml`, bytes.slice());
      const rels = textOfSource(source, "xl/_rels/workbook.xml.rels");
      if (rels && !rels.includes(`sheet${index}.xml`)) {
        source.set(
          "xl/_rels/workbook.xml.rels",
          bytesOf(rels.replace("</Relationships>", `<Relationship Id="rId${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index}.xml"/></Relationships>`)),
        );
      }
    }
    rebuildTabs();
    show(workbook.sheets.length - 1);
    touch();
  }

  function symbol(text: string): void {
    remember();
    const cell = ensure(selected.row, selected.col);
    delete cell.formula;
    cell.value = (cell.value ?? "") + text;
    finish();
  }

  function applyStyle(name: string): void {
    remember();
    const cell = ensure(selected.row, selected.col);
    cell.styleName = name;
    finish();
  }

  function formatCell(patch: { numFmt?: string; font?: string; fontSize?: number; color?: string; fill?: string; align?: SheetCell["align"]; bold?: boolean }): void {
    remember();
    const cell = ensure(selected.row, selected.col);
    if (patch.numFmt != null) cell.numFmt = patch.numFmt;
    if (patch.font != null) cell.font = patch.font;
    if (patch.fontSize != null) cell.fontSize = patch.fontSize;
    if (patch.color != null) cell.color = patch.color;
    if (patch.fill != null) cell.fill = patch.fill;
    if (patch.align != null) cell.align = patch.align;
    if (patch.bold != null) cell.bold = patch.bold;
    finish();
  }

  function printArea(): void {
    remember();
    const sheet = currentSheet();
    const setup = sheet.pageSetup ?? {};
    setup.printArea = `'${sheet.name}'!${inferRange(sheet)}`;
    sheet.pageSetup = setup;
    finish();
    options.onStatus?.(zh ? `打印区域 ${setup.printArea}` : `Print area ${setup.printArea}`);
  }

  function fitTo(width: number, height?: number): void {
    remember();
    const sheet = currentSheet();
    sheet.pageSetup = { ...(sheet.pageSetup ?? {}), fitToWidth: width, ...(height != null ? { fitToHeight: height } : {}) };
    finish();
  }

  function removeDuplicates(): number {
    remember();
    const sheet = currentSheet();
    const seen = new Set<string>();
    const next: SheetCell[][] = [];
    let removed = 0;
    for (const row of sheet.cells) {
      const key = (row ?? []).map((cell) => cell?.value ?? "").join("\u0000");
      if (seen.has(key)) {
        removed += 1;
        continue;
      }
      seen.add(key);
      next.push(row ?? []);
    }
    sheet.cells = next;
    finish();
    options.onStatus?.(zh ? `已删除 ${removed} 行重复` : `Removed ${removed} duplicates`);
    return removed;
  }

  function textToColumns(delimiter = ","): void {
    remember();
    const sheet = currentSheet();
    const source = sheet.cells[selected.row]?.[selected.col]?.value ?? "";
    const parts = source.split(delimiter);
    parts.forEach((part, index) => {
      const cell = ensure(selected.row, selected.col + index);
      delete cell.formula;
      cell.value = part.trim();
    });
    finish();
  }

  /** Read-only preview of the VBA module names. The module code is never run. */
  function listMacros(): string[] {
    const names = workbook.vbaModules ?? [];
    options.onStatus?.(names.length ? (zh ? `宏 ${names.join("、")}` : `Macros: ${names.join(", ")}`) : zh ? "未找到宏" : "No macros found");
    return names;
  }

  function addChart(kind: SheetChartKind = "column", range?: string, title?: string): void {
    remember();
    const sheet = currentSheet();
    const charts = sheet.charts ?? [];
    const auto = inferRange(sheet);
    charts.push({
      id: `chart${charts.length + 1}`,
      kind,
      title: title ?? (zh ? "图表" : "Chart"),
      range: range ?? auto,
    });
    sheet.charts = charts;
    finish();
  }

  function addSparkline(kind: SheetSparklineKind = "line", data?: string): void {
    remember();
    const sheet = currentSheet();
    const sparklines = sheet.sparklines ?? [];
    sparklines.push({
      id: `spark${sparklines.length + 1}`,
      kind,
      data: data ?? inferRange(sheet),
      location: `${columnName(selected.col)}${selected.row + 1}`,
    });
    sheet.sparklines = sparklines;
    finish();
  }

  function addConditionalFormat(rule: SheetCfRule, rows = 10, cols = 1): void {
    remember();
    const sheet = currentSheet();
    const list = sheet.conditionalFormats ?? [];
    list.push({
      id: `cf${list.length + 1}`,
      r1: selected.row,
      c1: selected.col,
      r2: selected.row + Math.max(0, rows - 1),
      c2: selected.col + Math.max(0, cols - 1),
      rule,
    });
    sheet.conditionalFormats = list;
    finish();
  }

  function addTable(name?: string): void {
    remember();
    const sheet = currentSheet();
    const tables = sheet.tables ?? [];
    const r2 = Math.max(selected.row, sheet.cells.length - 1);
    const c2 = Math.max(selected.col, (sheet.cells[selected.row]?.length ?? 1) - 1);
    tables.push({
      id: `table${tables.length + 1}`,
      name: name ?? `Table${tables.length + 1}`,
      r1: selected.row,
      c1: selected.col,
      r2,
      c2,
      headerRow: true,
    });
    sheet.tables = tables;
    sheet.filter = { r1: selected.row, c1: selected.col, r2, c2 };
    finish();
  }

  function addPivot(name?: string): void {
    remember();
    const sheet = currentSheet();
    const pivots = sheet.pivots ?? [];
    const source = inferRange(sheet);
    const cache = pivotCache(sheet, source);
    pivots.push({
      id: `pivot${pivots.length + 1}`,
      name: name ?? `Pivot${pivots.length + 1}`,
      source,
      rows: cache.headers.slice(0, 1),
      columns: [],
      values: cache.headers.slice(1, 2),
      fields: cache.headers,
      cache: cache.rows,
    });
    sheet.pivots = pivots;
    options.onStatus?.(zh ? `透视缓存 ${cache.rows.length} 行` : `Pivot cache ${cache.rows.length} rows`);
    finish();
  }

  function pivotCache(sheet: Worksheet, range: string): { headers: string[]; rows: string[][] } {
    const hit = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(range.trim());
    if (!hit) return { headers: [], rows: [] };
    const c1 = columnIndex(hit[1]!);
    const r1 = Number(hit[2]) - 1;
    const c2 = hit[3] ? columnIndex(hit[3]) : c1;
    const r2 = hit[4] ? Number(hit[4]) - 1 : r1;
    const headers: string[] = [];
    for (let c = c1; c <= c2; c += 1) headers.push(sheet.cells[r1]?.[c]?.value || columnName(c));
    const rows: string[][] = [];
    for (let r = r1 + 1; r <= r2; r += 1) {
      const line: string[] = [];
      for (let c = c1; c <= c2; c += 1) line.push(sheet.cells[r]?.[c]?.value ?? "");
      if (line.some((item) => item !== "")) rows.push(line);
    }
    return { headers, rows };
  }

  function columnIndex(letters: string): number {
    let index = 0;
    for (const ch of letters.toUpperCase()) index = index * 26 + ch.charCodeAt(0) - 64;
    return index - 1;
  }

  function printPreview(): void {
    const sheet = currentSheet();
    const setup = sheet.pageSetup ?? { orientation: "portrait", paperSize: "A4" };
    sheet.pageSetup = setup;
    paint();
    const label = `${setup.orientation ?? "portrait"} ${setup.paperSize ?? "A4"}${setup.printArea ? ` ${setup.printArea}` : ""}`;
    options.onStatus?.(zh ? `打印预览 ${label}` : `Print preview ${label}`);
  }

  function setRowHeight(points = 18): void {
    remember();
    const sheet = currentSheet();
    const heights = sheet.rowHeights ?? [];
    heights[selected.row] = Math.max(1, points);
    sheet.rowHeights = heights;
    finish();
  }

  function setColumnWidth(chars = 12): void {
    remember();
    const sheet = currentSheet();
    const widths = sheet.colWidths ?? [];
    widths[selected.col] = Math.max(1, chars);
    sheet.colWidths = widths;
    finish();
  }

  function insertCells(shift: "right" | "down" = "right"): void {
    remember();
    const sheet = currentSheet();
    if (shift === "down") {
      for (let r = sheet.cells.length; r > selected.row; r -= 1) {
        const from = sheet.cells[r - 1] ?? [];
        const line = sheet.cells[r] ?? (sheet.cells[r] = []);
        const moved = from[selected.col];
        if (moved) line[selected.col] = { ...moved };
        else delete line[selected.col];
        delete from[selected.col];
      }
      const cell = ensure(selected.row, selected.col);
      cell.value = "";
      delete cell.formula;
    } else {
      const line = sheet.cells[selected.row] ?? (sheet.cells[selected.row] = []);
      line.splice(selected.col, 0, { value: "" });
    }
    finish();
  }

  function deleteCells(shift: "left" | "up" = "left"): void {
    remember();
    const sheet = currentSheet();
    if (shift === "up") {
      for (let r = selected.row; r < sheet.cells.length - 1; r += 1) {
        const line = sheet.cells[r] ?? (sheet.cells[r] = []);
        const next = sheet.cells[r + 1] ?? [];
        line[selected.col] = next[selected.col]!;
        delete next[selected.col];
      }
      const last = sheet.cells[sheet.cells.length - 1];
      if (last) delete last[selected.col];
    } else {
      const line = sheet.cells[selected.row];
      line?.splice(selected.col, 1);
    }
    finish();
  }

  function bumpDecimals(delta: number): void {
    remember();
    let count = 0;
    for (const row of currentSheet().cells) {
      for (const item of row ?? []) {
        if (!item || item.formula) continue;
        const raw = item.value.replace(/,/g, "");
        if (!/^-?\d+(?:\.\d+)?$/.test(raw)) continue;
        const current = /\.(\d+)/.exec(raw)?.[1]?.length ?? 0;
        const next = Math.max(0, current + delta);
        item.value = Number(raw).toFixed(next);
        item.numFmt = next === 0 ? "0" : `0.${"0".repeat(next)}`;
        count += 1;
      }
    }
    finish();
    options.onStatus?.(zh ? `已调整 ${count} 个小数位` : `Adjusted ${count} decimals`);
  }

  function defineName(name?: string, refersTo?: string): void {
    const label = name?.trim() || (zh ? "名称1" : "Name1");
    const target = refersTo?.trim() || `${columnName(selected.col)}${selected.row + 1}`;
    remember();
    const names = workbook.names ?? [];
    const existing = names.find((item) => item.name.toUpperCase() === label.toUpperCase());
    if (existing) existing.refersTo = target.startsWith("=") ? target : `=${target}`;
    else names.push({ name: label, refersTo: target.startsWith("=") ? target : `=${target}` });
    workbook.names = names;
    finish();
    options.onStatus?.(zh ? `已定义 ${label}` : `Defined ${label}`);
  }

  function goToSpecial(kind: "blanks" | "formulas" | "constants" = "blanks"): number {
    let count = 0;
    let first: { row: number; col: number } | undefined;
    const sheet = currentSheet();
    const rows = Math.max(sheet.cells.length, 1);
    const cols = Math.max(1, sheet.cells.reduce((w, row) => Math.max(w, row?.length ?? 0), 1));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const cell = sheet.cells[r]?.[c];
        const hit =
          kind === "blanks" ? !cell || cell.value === "" :
          kind === "formulas" ? !!cell?.formula :
          !!cell && !cell.formula && cell.value !== "";
        if (!hit) continue;
        count += 1;
        first ??= { row: r, col: c };
      }
    }
    if (first) {
      selected = first;
      paint();
    }
    options.onStatus?.(zh ? `定位 ${count}` : `Found ${count}`);
    return count;
  }

  function border(style: "thin" | "medium" | "thick" | "dashed" | "dotted" = "thin", color = "#18181b"): void {
    const item = ensure(selected.row, selected.col);
    remember();
    const edge = { style, color };
    item.border = { top: edge, right: edge, bottom: edge, left: edge };
    finish();
  }

  function copyCell(): void {
    const cell = currentCell();
    if (!cell) return;
    clipboard = { cell: cloneCell(cell), cut: false };
    options.onStatus?.(zh ? "已复制" : "Copied");
  }

  function cutCell(): void {
    const cell = currentCell();
    if (!cell) return;
    remember();
    clipboard = { cell: cloneCell(cell), cut: true };
    cell.value = "";
    delete cell.formula;
    finish();
    options.onStatus?.(zh ? "已剪切" : "Cut");
  }

  function pasteCell(): void {
    if (!clipboard) return;
    remember();
    const target = ensure(selected.row, selected.col);
    Object.assign(target, cloneCell(clipboard.cell));
    if (clipboard.cut) clipboard = undefined;
    finish();
  }

  function formatPainter(): void {
    const cell = currentCell();
    if (!painter) {
      if (!cell) return;
      painter = styleOnly(cell);
      options.onStatus?.(zh ? "格式刷已取" : "Format painter armed");
      return;
    }
    remember();
    const target = ensure(selected.row, selected.col);
    Object.assign(target, painter, { value: target.value, formula: target.formula });
    painter = undefined;
    finish();
  }

  function workbookStats(): { sheets: number; cells: number; formulas: number } {
    let cells = 0;
    let formulas = 0;
    for (const sheet of workbook.sheets) {
      for (const row of sheet.cells) {
        for (const item of row ?? []) {
          if (!item) continue;
          cells += 1;
          if (item.formula) formulas += 1;
        }
      }
    }
    const stats = { sheets: workbook.sheets.length, cells, formulas };
    options.onStatus?.(zh ? `${stats.sheets} 表 / ${stats.cells} 格 / ${stats.formulas} 公式` : `${stats.sheets} sheets / ${stats.cells} cells / ${stats.formulas} formulas`);
    return stats;
  }

  function cloneCell(cell: SheetCell): SheetCell {
    return {
      ...cell,
      border: cell.border
        ? {
            top: cell.border.top ? { ...cell.border.top } : undefined,
            right: cell.border.right ? { ...cell.border.right } : undefined,
            bottom: cell.border.bottom ? { ...cell.border.bottom } : undefined,
            left: cell.border.left ? { ...cell.border.left } : undefined,
          }
        : undefined,
    };
  }

  function styleOnly(cell: SheetCell): SheetCell {
    const next = cloneCell(cell);
    next.value = "";
    delete next.formula;
    return next;
  }

  function cssBorder(edge: { color?: string; style?: string }): string {
    const width = edge.style === "thick" ? "2px" : edge.style === "medium" ? "1.5px" : "1px";
    const style = edge.style === "dashed" || edge.style === "dotted" ? edge.style : "solid";
    return `${width} ${style} ${edge.color ?? "#18181b"}`;
  }

  function addShape(kind: SheetShapeKind = "rect", text?: string): void {
    remember();
    const sheet = currentSheet();
    const shapes = sheet.shapes ?? [];
    shapes.push({
      id: `shape${shapes.length + 1}`,
      kind,
      text: text ?? (kind === "textBox" || kind === "smartArt" || kind === "icon" ? kind : undefined),
      x: 24 + shapes.length * 12,
      y: 24 + shapes.length * 12,
      w: kind === "line" || kind === "arrow" ? 120 : 96,
      h: kind === "line" || kind === "arrow" ? 2 : 64,
      fill: kind === "image" ? "#e4e4e7" : "#dbeafe",
      stroke: "#1d4ed8",
    });
    sheet.shapes = shapes;
    finish();
  }

  function setTheme(theme: SheetTheme): void {
    remember();
    workbook.theme = {
      name: theme.name ?? "Office",
      colors: theme.colors ?? ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"],
      fonts: theme.fonts ?? { major: "Calibri Light", minor: "Calibri" },
    };
    finish();
  }

  function addValidation(rule: Partial<SheetValidation> = {}): void {
    remember();
    const sheet = currentSheet();
    const list = sheet.validations ?? [];
    list.push({
      id: `dv${list.length + 1}`,
      r1: selected.row,
      c1: selected.col,
      r2: selected.row,
      c2: selected.col,
      type: rule.type ?? "list",
      formula1: rule.formula1 ?? "Yes,No",
      formula2: rule.formula2,
      allowBlank: rule.allowBlank ?? true,
      error: rule.error,
    });
    sheet.validations = list;
    finish();
  }

  function addFormControl(kind: SheetFormControl["kind"] = "button", label?: string): void {
    remember();
    const sheet = currentSheet();
    const controls = sheet.formControls ?? [];
    controls.push({
      id: `fc${controls.length + 1}`,
      kind,
      label: label ?? (zh ? "控件" : "Control"),
      linked: `${columnName(selected.col)}${selected.row + 1}`,
      checked: kind === "checkbox" ? false : undefined,
    });
    sheet.formControls = controls;
    finish();
  }

  function addSlicer(field?: string): void {
    remember();
    const sheet = currentSheet();
    const slicers = sheet.slicers ?? [];
    slicers.push({
      id: `slicer${slicers.length + 1}`,
      name: field ?? (zh ? "切片器" : "Slicer"),
      source: inferRange(sheet),
      field: field ?? "Field1",
    });
    sheet.slicers = slicers;
    finish();
  }

  function addXmlMap(name?: string): void {
    remember();
    const sheet = currentSheet();
    const maps = sheet.xmlMaps ?? [];
    maps.push({ id: `map${maps.length + 1}`, name: name ?? `Map${maps.length + 1}`, root: "root" });
    sheet.xmlMaps = maps;
    options.onStatus?.(zh ? "已添加 XML 映射" : "XML map added");
    finish();
  }

  function groupRows(): void {
    remember();
    const sheet = currentSheet();
    const outline = sheet.outline ?? { rows: [], summaryBelow: true };
    const rows = new Set(outline.rows ?? []);
    rows.add(selected.row);
    sheet.outline = { ...outline, rows: [...rows].sort((a, b) => a - b) };
    finish();
  }

  function ungroupRows(): void {
    remember();
    const sheet = currentSheet();
    if (!sheet.outline?.rows) return;
    sheet.outline = { ...sheet.outline, rows: sheet.outline.rows.filter((row) => row !== selected.row) };
    finish();
  }

  function subtotal(): void {
    remember();
    const sheet = currentSheet();
    let total = 0;
    for (const row of sheet.cells) {
      const item = row?.[selected.col];
      if (!item || item.formula) continue;
      if (/^-?\d+(?:\.\d+)?$/.test(item.value)) total += Number(item.value);
    }
    const cell = ensure(sheet.cells.length, selected.col);
    cell.formula = `SUM(${columnName(selected.col)}1:${columnName(selected.col)}${sheet.cells.length})`;
    cell.value = String(total);
    finish();
    options.onStatus?.(zh ? `小计 ${total}` : `Subtotal ${total}`);
  }

  function pageBreak(): void {
    remember();
    const sheet = currentSheet();
    const breaks = sheet.pageBreaks ?? { rows: [], cols: [] };
    const rows = new Set(breaks.rows ?? []);
    rows.add(selected.row + 1);
    sheet.pageBreaks = { ...breaks, rows: [...rows].sort((a, b) => a - b) };
    finish();
  }

  function alignObjects(mode: "left" | "center" | "right" = "left"): void {
    remember();
    const sheet = currentSheet();
    const shapes = sheet.shapes ?? [];
    if (!shapes.length) {
      options.onStatus?.(zh ? "没有可对齐的对象" : "No objects to align");
      return;
    }
    if (mode === "left") for (const shape of shapes) shape.x = Math.min(...shapes.map((item) => item.x));
    if (mode === "right") {
      const right = Math.max(...shapes.map((item) => item.x + item.w));
      for (const shape of shapes) shape.x = right - shape.w;
    }
    if (mode === "center") {
      const mid = shapes.reduce((sum, item) => sum + item.x + item.w / 2, 0) / shapes.length;
      for (const shape of shapes) shape.x = mid - shape.w / 2;
    }
    finish();
  }

  function spellCheck(): number {
    const words = new Set(["the", "and", "for", "sheet", "excel", "sum", "total", "name", "date", "value", "数据", "合计", "姓名", "日期"]);
    let count = 0;
    const misses: string[] = [];
    for (const row of currentSheet().cells) {
      for (const item of row ?? []) {
        if (!item || item.formula) continue;
        for (const token of item.value.split(/[^A-Za-z一-鿿]+/).filter(Boolean)) {
          if (token.length < 3) continue;
          if (words.has(token.toLowerCase()) || words.has(token)) continue;
          count += 1;
          if (misses.length < 8) misses.push(token);
        }
      }
    }
    options.onStatus?.(count ? (zh ? `拼写可疑 ${count}: ${misses.join(", ")}` : `Spelling suspects ${count}: ${misses.join(", ")}`) : zh ? "未发现拼写问题" : "No spelling issues");
    return count;
  }

  function tracePrecedents(): string[] {
    const cell = currentCell();
    if (!cell?.formula) {
      options.onStatus?.(zh ? "当前格没有公式" : "No formula in cell");
      return [];
    }
    const refs = [...cell.formula.matchAll(/\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?/g)].map((match) => match[0]!);
    options.onStatus?.(refs.length ? refs.join(", ") : zh ? "无引用" : "No precedents");
    return refs;
  }

  function traceDependents(): string[] {
    const target = `${columnName(selected.col)}${selected.row + 1}`;
    const hits: string[] = [];
    currentSheet().cells.forEach((row, r) => {
      row?.forEach((item, c) => {
        if (!item?.formula) return;
        if (item.formula.toUpperCase().includes(target.toUpperCase())) hits.push(`${columnName(c)}${r + 1}`);
      });
    });
    options.onStatus?.(hits.length ? hits.join(", ") : zh ? "无从属" : "No dependents");
    return hits;
  }

  function errorCheck(): string[] {
    const errors: string[] = [];
    currentSheet().cells.forEach((row, r) => {
      row?.forEach((item, c) => {
        if (!item) return;
        if (/^#(DIV\/0|VALUE|REF|N\/A|NAME\?|NUM|NULL)!$/.test(item.value)) errors.push(`${columnName(c)}${r + 1}:${item.value}`);
      });
    });
    options.onStatus?.(errors.length ? errors.slice(0, 8).join(", ") : zh ? "无错误" : "No errors");
    return errors;
  }

  function allowEditRange(name?: string, range?: string): void {
    remember();
    const sheet = currentSheet();
    const list = sheet.allowEditRanges ?? [];
    list.push({
      name: name ?? `Range${list.length + 1}`,
      range: range ?? `${columnName(selected.col)}${selected.row + 1}`,
    });
    sheet.allowEditRanges = list;
    finish();
  }

  function setArrayFormula(formula?: string): void {
    remember();
    const cell = ensure(selected.row, selected.col);
    const body = (formula ?? formulaInput.value ?? "").replace(/^=/, "");
    if (!body) return;
    cell.formula = body;
    cell.array = true;
    recalculate(workbook);
    finish();
  }

  function whatIf(target = 100): void {
    remember();
    const cell = ensure(selected.row, selected.col);
    cell.value = String(target);
    delete cell.formula;
    finish();
    options.onStatus?.(zh ? `假设值 ${target}` : `What-if ${target}`);
  }

  function consolidate(spec: { func?: ConsolidateFunc; sources?: string[]; dest?: string; topRow?: boolean; leftCol?: boolean; links?: boolean } = {}): void {
    remember();
    const sheet = currentSheet();
    const sources = spec.sources ?? workbook.sheets
      .filter((item) => item !== sheet)
      .map((item) => `'${item.name.replace(/'/g, "''")}'!${inferRange(item, true)}`);
    if (!sources.length) {
      options.onStatus?.(zh ? "没有可合并的区域" : "No ranges to consolidate");
      return;
    }
    const dest = spec.dest ?? `'${sheet.name.replace(/'/g, "''")}'!${columnName(selected.col)}${selected.row + 1}`;
    const result = consolidateRanges(workbook, { func: spec.func ?? "sum", sources, dest, topRow: spec.topRow, leftCol: spec.leftCol, links: spec.links });
    finish();
    options.onStatus?.(zh ? `合并计算 ${result.rows ?? 0} 行` : `Consolidated ${result.rows ?? 0} rows`);
  }

  function forecast(): void {
    const sheet = currentSheet();
    const values: number[] = [];
    for (let r = 0; r < sheet.cells.length; r += 1) {
      const raw = sheet.cells[r]?.[selected.col]?.value ?? "";
      if (/^-?\d+(?:\.\d+)?$/.test(raw)) values.push(Number(raw));
    }
    if (values.length < 2) {
      options.onStatus?.(zh ? "数据不足" : "Not enough data");
      return;
    }
    const delta = values[values.length - 1]! - values[values.length - 2]!;
    const next = values[values.length - 1]! + delta;
    remember();
    const cell = ensure(values.length, selected.col);
    cell.value = String(Math.round(next * 1000) / 1000);
    finish();
    options.onStatus?.(zh ? `预测 ${cell.value}` : `Forecast ${cell.value}`);
  }

  function inferRange(sheet: Worksheet, whole = false): string {
    const rows = Math.max(1, sheet.cells.length);
    const cols = Math.max(1, sheet.cells.reduce((w, row) => Math.max(w, row?.length ?? 0), 1));
    if (!whole && selected.row > 0) {
      const start = Math.max(0, selected.row - Math.min(selected.row, 9));
      return `${columnName(selected.col)}${start + 1}:${columnName(selected.col)}${selected.row + 1}`;
    }
    return `A1:${columnName(cols - 1)}${rows}`;
  }

  function commitFormula(text: string): void {
    remember();
    const cell = ensure(selected.row, selected.col);
    if (text.startsWith("=")) {
      cell.formula = text.slice(1);
      cell.value = text;
    } else {
      delete cell.formula;
      cell.value = text;
    }
    recalculate(workbook);
    finish();
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
    const parsed = JSON.parse(json) as { index: number; sheet: Worksheet; names?: string[] };
    workbook.sheets[parsed.index] = parsed.sheet;
    if (parsed.names && parsed.names.length < workbook.sheets.length) workbook.sheets.splice(parsed.names.length);
    active = parsed.index;
    rebuildTabs();
    touch();
    show(parsed.index);
    options.onSelection?.();
  }

  function currentSheet(): Worksheet {
    return workbook.sheets[active] ?? workbook.sheets[0]!;
  }

  function currentCell(): SheetCell | undefined {
    return currentSheet().cells[selected.row]?.[selected.col];
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
    return JSON.stringify({ index: active, sheet: currentSheet(), names: workbook.sheets.map((sheet) => sheet.name) });
  }

  function markSelected(): void {
    for (const node of frame.querySelectorAll<HTMLElement>("td")) {
      node.classList.toggle("is-selected", node.dataset.row === String(selected.row) && node.dataset.col === String(selected.col));
    }
  }
}

type SheetMergeHit = { r1: number; c1: number; r2: number; c2: number };

function textOfSource(source: Map<string, Uint8Array>, path: string): string | undefined {
  const bytes = source.get(path);
  return bytes ? new TextDecoder().decode(bytes) : undefined;
}

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
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
