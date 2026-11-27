import { consolidateRanges, evaluate, formatNumber, recalculate } from "@sliiu/sheet-formula";
import { renderCharts, slicerValues } from "./charts.js";
import { cfLook } from "./cf.js";
const FROZEN_HEADER = 24;
const FROZEN_GUTTER = 36;
const FROZEN_ROW = 22;
const FROZEN_COLUMN = 88;
/** Editable grid with Home-tab commands and formula recalculation. */
export function mountWorkbook(host, workbook, options = {}) {
    const locale = options.locale ?? "en";
    const zh = locale === "zh-CN";
    const sheets = workbook.sheets.length ? workbook.sheets : [{ name: "Sheet1", cells: [] }];
    if (!workbook.sheets.length)
        workbook.sheets = sheets;
    if (workbook.calcMode !== "manual")
        recalculate(workbook);
    const undoStack = [];
    const redoStack = [];
    let active = 0;
    let selected = { row: 0, col: 0 };
    let armed = false;
    let showFormulaBar = true;
    let zoomFactor = 1;
    let clipboard;
    let painter;
    const root = el("div", "sheet-view");
    const bar = el("div", "sheet-formula-bar");
    const refLabel = el("div", "sheet-ref");
    const formulaInput = document.createElement("input");
    formulaInput.className = "sheet-formula-input";
    formulaInput.addEventListener("change", () => commitFormula(formulaInput.value));
    bar.append(refLabel, formulaInput);
    const tabs = el("div", "sheet-tabs");
    const frame = el("div", "sheet-frame");
    const buttons = [];
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
        filterBy,
        slicerBy,
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
        toggleTotals,
        toggleHeader,
        renameTable,
        resizeTable,
        deleteTable,
        tableFilter,
        totalsFunction,
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
    function rebuildTabs() {
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
    function show(index) {
        active = index;
        buttons.forEach((button, item) => button.classList.toggle("is-active", item === index));
        paint();
    }
    function paint() {
        if (workbook.calcMode !== "manual")
            recalculate(workbook);
        const sheet = currentSheet();
        const charts = renderCharts(sheet);
        for (const button of charts.querySelectorAll(".sheet-slicer-item")) {
            button.addEventListener("click", () => toggleSlicer(button));
        }
        frame.replaceChildren(grid(sheet), charts);
        frame.style.zoom = String(zoomFactor);
        frame.dataset.zoom = String(zoomFactor);
        frame.classList.toggle("is-print-preview", !!sheet.pageSetup?.orientation);
        frame.style.fontFamily = workbook.theme?.fonts?.minor ?? "";
        const accent = workbook.theme?.colors?.[4];
        if (accent)
            frame.style.setProperty("--sheet-accent", accent);
        else
            frame.style.removeProperty("--sheet-accent");
        const scale = sheet.pageSetup?.scale ?? (sheet.pageSetup?.fitToWidth || sheet.pageSetup?.fitToHeight ? 100 : undefined);
        frame.dataset.scale = scale != null ? String(scale) : "";
        syncBar();
    }
    function syncBar() {
        bar.hidden = !showFormulaBar;
        refLabel.textContent = `${columnName(selected.col)}${selected.row + 1}`;
        const cell = currentCell();
        formulaInput.value = cell?.formula ? `=${cell.formula}` : (cell?.value ?? "");
    }
    function grid(sheet) {
        const table = el("table", "sheet-grid");
        if (sheet.showGrid === false)
            table.classList.add("no-grid");
        const columns = Math.max(1, sheet.cells.reduce((widest, row) => Math.max(widest, row?.length ?? 0), 1), ...(sheet.merges ?? []).map((m) => m.c2 + 1));
        const rows = Math.max(sheet.cells.length, 1, ...(sheet.merges ?? []).map((m) => m.r2 + 1));
        const head = document.createElement("tr");
        head.append(cell("th", ""));
        for (let column = 0; column < columns; column += 1) {
            if (sheet.hiddenCols?.includes(column) || columnHiddenByTable(sheet, column))
                continue;
            const th = cell("th", columnName(column));
            const width = sheet.colWidths?.[column] ?? columnWidthFromTable(sheet, column);
            if (width)
                th.style.width = `${width * 8}px`;
            head.append(th);
        }
        table.append(head);
        for (let row = 0; row < rows; row += 1) {
            if (sheet.hiddenRows?.includes(row))
                continue;
            if (filteredOut(sheet, row))
                continue;
            const line = document.createElement("tr");
            if (sheet.rowHeights?.[row])
                line.style.height = `${sheet.rowHeights[row]}pt`;
            line.append(cell("th", String(row + 1)));
            for (let column = 0; column < columns; column += 1) {
                if (sheet.hiddenCols?.includes(column) || columnHiddenByTable(sheet, column))
                    continue;
                if (coveredByMerge(sheet, row, column))
                    continue;
                line.append(dataCell(sheet, row, column));
            }
            table.append(line);
        }
        return table;
    }
    /** A row drops out when any filtered column, or any slicer, holds a value it does not list. The header row always stays. */
    function filteredOut(sheet, row) {
        if (row === 0)
            return false;
        if ((sheet.slicers ?? []).some((slicer) => slicerHides(sheet, slicer, row)))
            return true;
        if ((sheet.tables ?? []).some((table) => tableHides(sheet, table, row)))
            return true;
        const filter = sheet.filter;
        if (!filter?.columns?.length || row === filter.r1 || row < filter.r1 || row > filter.r2)
            return false;
        return filter.columns.some((column) => {
            const value = sheet.cells[row]?.[filter.c1 + column.col]?.value ?? "";
            return !column.values.includes(value);
        });
    }
    /** A table column with no filter shows everything. The header and the totals row always stay. */
    function tableHides(sheet, table, row) {
        const columns = table.filterColumns;
        if (!columns?.length || row < table.r1 || row > table.r2)
            return false;
        if (table.headerRow !== false && row === table.r1)
            return false;
        if (table.totalsRow && row === table.r2)
            return false;
        return columns.some((column) => {
            const value = sheet.cells[row]?.[table.c1 + column.col]?.value ?? "";
            return !column.values.includes(value);
        });
    }
    /** A slicer with no selection shows everything. Otherwise the row must hold one of the values it keeps. */
    function slicerHides(sheet, slicer, row) {
        if (!slicer.values)
            return false;
        const column = (sheet.cells[0] ?? []).findIndex((cell) => cell?.value === slicer.field);
        if (column < 0)
            return false;
        return !slicer.values.includes(sheet.cells[row]?.[column]?.value ?? "");
    }
    function coveredByMerge(sheet, row, column) {
        return (sheet.merges ?? []).some((m) => row >= m.r1 && row <= m.r2 && column >= m.c1 && column <= m.c2 && !(row === m.r1 && column === m.c1));
    }
    function mergeSpan(sheet, row, column) {
        return (sheet.merges ?? []).find((m) => m.r1 === row && m.c1 === column);
    }
    function dataCell(sheet, row, column) {
        const item = sheet.cells[row]?.[column];
        const td = document.createElement("td");
        td.textContent = shown(item, sheet, row, column);
        td.dataset.row = String(row);
        td.dataset.col = String(column);
        applyLook(td, item, row, column);
        const look = cfLook(sheet, row, column, item);
        if (look.fill)
            td.style.background = look.fill;
        if (look.color)
            td.style.color = look.color;
        if (look.icon)
            td.textContent = `${look.icon} ${td.textContent}`;
        if (look.bar != null) {
            const bar = document.createElement("span");
            bar.className = "sheet-data-bar";
            bar.style.width = `${Math.round(look.bar * 100)}%`;
            bar.style.background = look.fill ?? "#638ec6";
            td.append(bar);
        }
        const span = mergeSpan(sheet, row, column);
        if (span) {
            td.colSpan = span.c2 - span.c1 + 1;
            td.rowSpan = span.r2 - span.r1 + 1;
        }
        const note = [item?.comment, validationHint(sheet, row, column)].filter((text) => text).join("\n");
        if (note)
            td.title = note;
        const rule = validationAt(sheet, row, column);
        if (rule)
            td.dataset.validation = rule.type;
        if (item?.formula)
            td.classList.add("is-formula");
        if (item?.array)
            td.dataset.array = "1";
        if (item?.spill)
            td.dataset.spill = "1";
        const tableRange = tableRangeAt(sheet, row, column);
        if (tableRange) {
            td.dataset.table = tableRange.name;
            if (tableRange.headerRow && row === tableRange.r1)
                td.classList.add("is-table-header");
            if (tableRange.totalsRow && row === tableRange.r2)
                td.classList.add("is-table-total");
            // Data rows alternate their shading. The header and the totals row stay out of the count.
            const stripeTop = tableRange.headerRow === false ? tableRange.r1 : tableRange.r1 + 1;
            const stripeBottom = tableRange.totalsRow ? tableRange.r2 - 1 : tableRange.r2;
            if (tableRange.rowStripes !== false && row >= stripeTop && row <= stripeBottom && (row - stripeTop) % 2 === 1) {
                td.classList.add("is-table-stripe");
            }
            // Data columns alternate the same way, starting from the table's first column.
            if (tableRange.colStripes && row >= stripeTop && row <= stripeBottom && (column - tableRange.c1) % 2 === 1) {
                td.classList.add("is-table-col-stripe");
            }
            // The first and last column stand out, including the header and the totals row.
            if (tableRange.firstColumn && column === tableRange.c1)
                td.classList.add("is-table-first-col");
            if (tableRange.lastColumn && column === tableRange.c2)
                td.classList.add("is-table-last-col");
        }
        if (inPrintArea(sheet, row, column))
            td.dataset.printArea = "1";
        const consolidation = sheet.consolidation;
        if (consolidation && inConsolidation(consolidation, row, column))
            td.dataset.consolidation = consolidation.func;
        if (sheet.outline?.rows?.includes(row))
            td.dataset.outline = "row";
        if (sheet.outline?.cols?.includes(column))
            td.dataset.outline = "col";
        if (sheet.pageBreaks?.rows?.includes(row + 1))
            td.dataset.pageBreak = "row";
        if (sheet.pageBreaks?.cols?.includes(column + 1))
            td.dataset.pageBreak = "col";
        const table = dataTableAt(sheet, row, column);
        if (table)
            td.dataset.dataTable = [table.rowInput, table.colInput].filter((part) => part).join(" ");
        // A table carries its own filter on the header row, separate from the sheet's one filter. It can be switched off.
        const tableHeader = tableRange?.headerRow && tableRange.filter !== false && row === tableRange.r1;
        if (tableHeader || (sheet.filter && row === sheet.filter.r1 && column >= sheet.filter.c1 && column <= sheet.filter.c2)) {
            td.classList.add("is-filter-header");
        }
        if (item?.hyperlink) {
            td.classList.add("is-link");
            td.title = [td.title, item.hyperlink].filter((text) => text).join("\n");
        }
        if (sheet.freeze && (row < sheet.freeze.row || column < sheet.freeze.col)) {
            td.classList.add("is-frozen");
            if (row < sheet.freeze.row)
                td.style.top = `${FROZEN_HEADER + row * FROZEN_ROW}px`;
            if (column < sheet.freeze.col)
                td.style.left = `${FROZEN_GUTTER + column * FROZEN_COLUMN}px`;
        }
        if (selected.row === row && selected.col === column)
            td.classList.add("is-selected");
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
            const rule = validationAt(sheet, row, column);
            if (rule && !acceptsValidation(rule, next, row, column)) {
                td.classList.add("is-invalid");
                td.title = rule.error || (zh ? "输入不符合数据验证" : "The value breaks the data validation.");
                return;
            }
            td.classList.remove("is-invalid");
            const cell = ensure(row, column);
            // Typing into a spilled cell makes it the user's own value, which blocks the spill next time.
            delete cell.spill;
            if (next.startsWith("=")) {
                cell.formula = next.slice(1);
                cell.value = next;
            }
            else {
                delete cell.formula;
                cell.value = next;
            }
            // Renaming a header renames the column, so Table1[数量] follows the text the user typed.
            const table = tableRangeAt(sheet, row, column);
            if (table?.headerRow && row === table.r1 && table.columns) {
                const at = column - table.c1;
                table.columns[at] = columnTitle(next, column, table.columns.filter((_, index) => index !== at));
            }
            // A formula typed into a data cell becomes the column's formula and fills the other data rows.
            if (cell.formula && table && fillColumnFormula(table, row, column, cell.formula))
                paint();
            // Typing into the row just below a table pulls that row in. A totals row stays last.
            if (!table && next.trim() && growTable(sheet, row, column))
                paint();
            touch();
        });
        return td;
    }
    /** A table column marked hidden drops out of the grid. */
    function columnHiddenByTable(sheet, column) {
        return (sheet.tables ?? []).some((item) => column >= item.c1 && column <= item.c2 && item.hidden?.[column - item.c1] === true);
    }
    /** The width a table gives one column, in characters. Nothing when the table leaves it to the sheet. */
    function columnWidthFromTable(sheet, column) {
        for (const item of sheet.tables ?? []) {
            if (column < item.c1 || column > item.c2)
                continue;
            const width = item.widths?.[column - item.c1];
            if (width && width > 0)
                return width;
        }
        return undefined;
    }
    /** The row just under a table becomes part of it. A totals row moves down so the new row stays data. */
    function growTable(sheet, row, column) {
        const table = (sheet.tables ?? []).find((item) => row === item.r2 + 1 && column >= item.c1 && column <= item.c2);
        if (!table)
            return false;
        const typed = sheet.cells[row]?.[column];
        // With a totals row the new data row opens above it, and the cell just typed moves up with it.
        const dataRow = table.totalsRow ? table.r2 : row;
        if (table.totalsRow) {
            const totals = sheet.cells[table.r2];
            sheet.cells.splice(table.r2, 0, []);
            if (totals)
                sheet.cells[table.r2 + 1] = totals;
            const slid = sheet.cells[row + 1];
            if (slid)
                slid[column] = undefined;
        }
        table.r2 += 1;
        if (typed) {
            const line = sheet.cells[dataRow] ?? [];
            line[column] = typed;
            sheet.cells[dataRow] = line;
        }
        // The new row picks up each column's formula. The cell just typed keeps what the user entered.
        fillRowFormulas(sheet, table, dataRow, column);
        return true;
    }
    /** The formulas a table's columns already share, written into one data row. `skip` keeps what was just typed. */
    function fillRowFormulas(sheet, table, row, skip = -1) {
        (table.formulas ?? []).forEach((formula, index) => {
            if (!formula)
                return;
            const column = table.c1 + index;
            if (column === skip)
                return;
            const line = sheet.cells[row] ?? [];
            const cell = line[column];
            if (cell?.formula || cell?.value)
                return;
            const item = cell ?? { value: "" };
            item.formula = formula;
            item.value = `=${formula}`;
            line[column] = item;
            sheet.cells[row] = line;
        });
    }
    function tableRangeAt(sheet, row, column) {
        return sheet.tables?.find((item) => row >= item.r1 && row <= item.r2 && column >= item.c1 && column <= item.c2);
    }
    /** A formula typed into a data cell becomes the column's formula and fills the other data rows. */
    function fillColumnFormula(table, row, column, formula) {
        const dataTop = table.headerRow === false ? table.r1 : table.r1 + 1;
        const dataBottom = table.totalsRow ? table.r2 - 1 : table.r2;
        if (row < dataTop || row > dataBottom)
            return false;
        const at = column - table.c1;
        const formulas = table.formulas ?? [];
        table.formulas = formulas;
        formulas[at] = formula;
        for (let line = dataTop; line <= dataBottom; line += 1) {
            if (line === row)
                continue;
            const item = ensure(line, column);
            item.formula = formula;
            item.value = `=${formula}`;
            // The cell now holds the column's formula, so a spill no longer owns it.
            delete item.spill;
        }
        return true;
    }
    function editRangeAt(sheet, row, column) {
        return (sheet.allowEditRanges ?? []).some((item) => {
            const range = rangeOf(item.range);
            return !!range && row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2;
        });
    }
    function inConsolidation(consolidation, row, column) {
        const dest = rangeOf(consolidation.dest.split("!").pop() ?? "");
        if (!dest)
            return false;
        const rows = consolidation.rows ?? 1;
        const cols = consolidation.cols ?? 1;
        return row >= dest.r1 && row < dest.r1 + rows && column >= dest.c1 && column < dest.c1 + cols;
    }
    function inPrintArea(sheet, row, column) {
        const area = sheet.pageSetup?.printArea;
        if (!area)
            return false;
        const range = rangeOf(area.split("!").pop() ?? "");
        return !!range && row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2;
    }
    function dataTableAt(sheet, row, column) {
        return sheet.dataTables?.find((item) => {
            const range = rangeOf(item.ref);
            return !!range && row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2;
        });
    }
    function rangeOf(ref) {
        const parts = ref.split(":");
        const start = parseA1(parts[0] ?? "");
        const end = parseA1(parts[1] ?? parts[0] ?? "");
        if (!start || !end)
            return undefined;
        return { r1: Math.min(start.row, end.row), c1: Math.min(start.col, end.col), r2: Math.max(start.row, end.row), c2: Math.max(start.col, end.col) };
    }
    function parseA1(ref) {
        const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim());
        if (!match)
            return undefined;
        let col = 0;
        for (const letter of (match[1] ?? "").toUpperCase())
            col = col * 26 + letter.charCodeAt(0) - 64;
        return { row: Number(match[2]) - 1, col: col - 1 };
    }
    function validationAt(sheet, row, column) {
        return sheet.validations?.find((item) => row >= item.r1 && row <= item.r2 && column >= item.c1 && column <= item.c2);
    }
    /** A typed value passes the rule, or the cell is left untouched and marked invalid. */
    function acceptsValidation(rule, text, row, column) {
        if (text === "")
            return rule.allowBlank !== false;
        if (rule.type === "list") {
            const options = (rule.formula1 ?? "").split(",").map((item) => item.trim());
            return options.includes(text);
        }
        if (rule.type === "custom")
            return customValidation(rule, text, row, column);
        const value = rule.type === "textLength" ? text.length : Number(text);
        if (rule.type === "whole" && !Number.isInteger(value))
            return false;
        if (rule.type === "decimal" && !Number.isFinite(value))
            return false;
        return within(rule, value);
    }
    /** A custom rule passes when its formula comes back true. The typed text stands in for the cell. */
    function customValidation(rule, text, row, column) {
        const formula = rule.formula1?.trim();
        if (!formula)
            return true;
        const sheet = currentSheet();
        const probe = { ...sheet, cells: sheet.cells.map((line) => line?.slice()) };
        const line = probe.cells[row]?.slice() ?? [];
        line[column] = { ...(line[column] ?? { value: "" }), value: text };
        probe.cells[row] = line;
        const result = evaluate(formula, { workbook: { sheets: [probe] }, sheetIndex: 0, row, col: column });
        return result === true;
    }
    /** Compare against the two bounds. No operator means the type check above is the whole rule. */
    function within(rule, value) {
        const low = Number(rule.formula1 ?? "");
        const high = Number(rule.formula2 ?? "");
        if (!rule.op)
            return true;
        if (!Number.isFinite(low))
            return false;
        if (rule.op === "gt")
            return value > low;
        if (rule.op === "gte")
            return value >= low;
        if (rule.op === "lt")
            return value < low;
        if (rule.op === "lte")
            return value <= low;
        if (rule.op === "eq")
            return value === low;
        if (rule.op === "neq")
            return value !== low;
        return Number.isFinite(high) && value >= Math.min(low, high) && value <= Math.max(low, high);
    }
    function validationHint(sheet, row, column) {
        const rule = validationAt(sheet, row, column);
        if (!rule)
            return "";
        if (rule.type === "list")
            return rule.formula1 ?? "";
        return [rule.type, rule.formula1, rule.formula2].filter((part) => part).join(" ");
    }
    function shown(item, sheet, row = 0, column = 0) {
        const value = item?.value ?? "";
        // A cell's own format wins. Otherwise a table column's format covers its data cells.
        const format = item?.numFmt || (sheet ? columnFormat(sheet, row, column) : "");
        if (!format || format === "@" || !/^-?\d+(?:\.\d+)?$/.test(value))
            return value;
        return formatNumber(Number(value), format);
    }
    /** The number format a table column gives one data cell. Empty outside the data rows. */
    function columnFormat(sheet, row, column) {
        for (const table of sheet.tables ?? []) {
            if (column < table.c1 || column > table.c2)
                continue;
            const dataTop = table.headerRow === false ? table.r1 : table.r1 + 1;
            const dataBottom = table.totalsRow ? table.r2 - 1 : table.r2;
            if (row < dataTop || row > dataBottom)
                continue;
            const format = table.formats?.[column - table.c1];
            if (format)
                return format;
        }
        return "";
    }
    function applyLook(td, item, row = selected.row, column = selected.col) {
        const cf = cfLook(currentSheet(), row, column, item);
        if (item?.bold)
            td.style.fontWeight = "700";
        if (item?.italic)
            td.style.fontStyle = "italic";
        if (item?.underline)
            td.style.textDecoration = `${td.style.textDecoration} underline`.trim();
        if (item?.strike)
            td.style.textDecoration = `${td.style.textDecoration} line-through`.trim();
        if (item?.font)
            td.style.fontFamily = item.font;
        if (item?.fontSize)
            td.style.fontSize = `${item.fontSize}px`;
        if (item?.color || cf.color)
            td.style.color = item?.color ?? cf.color ?? "";
        if (item?.fill || cf.fill)
            td.style.background = item?.fill ?? cf.fill ?? "";
        if (item?.align)
            td.style.textAlign = item.align;
        if (item?.valign)
            td.style.verticalAlign = item.valign === "middle" ? "middle" : item.valign;
        if (item?.border) {
            if (item.border.top)
                td.style.borderTop = cssBorder(item.border.top);
            if (item.border.right)
                td.style.borderRight = cssBorder(item.border.right);
            if (item.border.bottom)
                td.style.borderBottom = cssBorder(item.border.bottom);
            if (item.border.left)
                td.style.borderLeft = cssBorder(item.border.left);
        }
        if (item?.wrap)
            td.style.whiteSpace = "normal";
        if (item?.indent)
            td.style.paddingLeft = `${8 + item.indent * 12}px`;
        if (cf.bar != null) {
            td.style.backgroundImage = `linear-gradient(90deg, ${cf.fill ?? "#93c5fd"} ${(cf.bar * 100).toFixed(1)}%, transparent 0)`;
        }
        if (cf.icon)
            td.dataset.icon = cf.icon;
    }
    function toggleFlag(flag) {
        const item = ensure(selected.row, selected.col);
        remember();
        if (item[flag])
            delete item[flag];
        else
            item[flag] = true;
        finish();
    }
    function setStyle(patch) {
        const item = ensure(selected.row, selected.col);
        remember();
        Object.assign(item, patch);
        finish();
    }
    function clearCell() {
        const item = currentSheet().cells[selected.row]?.[selected.col];
        if (!item)
            return;
        remember();
        item.value = "";
        delete item.formula;
        finish();
    }
    function clearFormat() {
        const item = currentCell();
        if (!item)
            return;
        remember();
        const value = item.value;
        const formula = item.formula;
        const next = { value };
        if (formula)
            next.formula = formula;
        currentSheet().cells[selected.row][selected.col] = next;
        finish();
    }
    function insertRow() {
        remember();
        currentSheet().cells.splice(selected.row, 0, []);
        shiftRanges(1, 0);
        // The selected cell moved down with the row, so the selection follows it.
        selected = { row: selected.row + 1, col: selected.col };
        finish();
    }
    function insertColumn() {
        remember();
        for (const row of currentSheet().cells)
            row?.splice(selected.col, 0, undefined);
        shiftRanges(0, 1);
        selected = { row: selected.row, col: selected.col + 1 };
        finish();
    }
    function deleteRow() {
        remember();
        currentSheet().cells.splice(selected.row, 1);
        shiftRanges(-1, 0);
        finish();
    }
    function deleteColumn() {
        remember();
        for (const row of currentSheet().cells)
            row?.splice(selected.col, 1);
        shiftRanges(0, -1);
        finish();
    }
    /**
     * Move every range with the inserted or deleted row or column.
     * A range that starts at the change or below it moves as a whole. One that contains the change
     * grows when a row is inserted and shrinks when a row is deleted. A range emptied by a deletion is dropped.
     */
    function shiftRanges(rowDelta, colDelta) {
        const sheet = currentSheet();
        const at = rowDelta ? selected.row : selected.col;
        const delta = rowDelta || colDelta;
        const move = (range) => {
            const start = rowDelta ? range.r1 : range.c1;
            const end = rowDelta ? range.r2 : range.c2;
            // A change above the range moves it. A change on its first row or inside it grows or shrinks it,
            // so inserting at the header keeps the header and the rows below it together.
            if (start > at) {
                if (rowDelta) {
                    range.r1 += delta;
                    range.r2 += delta;
                }
                else {
                    range.c1 += delta;
                    range.c2 += delta;
                }
            }
            else if (end >= at) {
                if (rowDelta)
                    range.r2 += delta;
                else
                    range.c2 += delta;
            }
            return (rowDelta ? range.r1 : range.c1) <= (rowDelta ? range.r2 : range.c2);
        };
        sheet.merges = (sheet.merges ?? []).filter(move);
        sheet.tables = (sheet.tables ?? []).filter((table) => {
            // The name comes off before the range shrinks, so the index still matches the deleted column.
            if (colDelta < 0 && table.columns && selected.col >= table.c1 && selected.col <= table.c2) {
                table.columns.splice(selected.col - table.c1, 1);
            }
            const kept = move(table);
            // A row inserted among the data rows takes each column's formula. The header and the totals row do not.
            if (kept && rowDelta > 0) {
                const dataTop = table.headerRow === false ? table.r1 : table.r1 + 1;
                const dataBottom = table.totalsRow ? table.r2 - 1 : table.r2;
                if (selected.row >= dataTop && selected.row <= dataBottom)
                    fillRowFormulas(sheet, table, selected.row);
            }
            return kept;
        });
        sheet.conditionalFormats = (sheet.conditionalFormats ?? []).filter(move);
        sheet.validations = (sheet.validations ?? []).filter(move);
        if (sheet.filter && !move(sheet.filter))
            sheet.filter = null;
    }
    function find(query) {
        const needle = query.trim().toLowerCase();
        let count = 0;
        for (const node of frame.querySelectorAll("td")) {
            const hit = needle.length > 0 && (node.textContent ?? "").toLowerCase().includes(needle);
            node.classList.toggle("is-hit", hit);
            if (hit)
                count += 1;
        }
        frame.querySelector(".is-hit")?.scrollIntoView({ block: "nearest" });
        return count;
    }
    function replace(query, next) {
        const needle = query.trim();
        if (!needle)
            return 0;
        remember();
        let count = 0;
        for (const row of currentSheet().cells) {
            for (const item of row ?? []) {
                if (!item || item.formula)
                    continue;
                if (!item.value.includes(needle))
                    continue;
                item.value = item.value.split(needle).join(next);
                count += 1;
            }
        }
        finish();
        return count;
    }
    function sum() {
        let total = 0;
        let count = 0;
        for (const row of currentSheet().cells) {
            for (const item of row ?? []) {
                if (!item || item.formula)
                    continue;
                if (!/^-?\d+(?:\.\d+)?$/.test(item.value))
                    continue;
                total += Number(item.value);
                count += 1;
            }
        }
        const shown = Number.isInteger(total) ? String(total) : String(Math.round(total * 1000) / 1000);
        options.onStatus?.(zh ? `合计 ${shown}（${count}）` : `Sum ${shown} (${count})`);
    }
    function autoSum() {
        remember();
        const sheet = currentSheet();
        let r = selected.row - 1;
        while (r >= 0 && /^-?\d+(?:\.\d+)?$/.test(sheet.cells[r]?.[selected.col]?.value ?? ""))
            r -= 1;
        const start = r + 1;
        const end = selected.row - 1;
        const cell = ensure(selected.row, selected.col);
        if (end >= start) {
            cell.formula = `SUM(${columnName(selected.col)}${start + 1}:${columnName(selected.col)}${end + 1})`;
        }
        else {
            cell.formula = `SUM(${columnName(selected.col)}1:${columnName(selected.col)}${selected.row})`;
        }
        recalculate(workbook);
        finish();
    }
    function numFmt(pattern) {
        remember();
        let count = 0;
        for (const row of currentSheet().cells) {
            for (const item of row ?? []) {
                if (!item || item.formula)
                    continue;
                if (!/^-?\d+(?:\.\d+)?$/.test(item.value))
                    continue;
                item.numFmt = pattern;
                if (pattern === "0.00")
                    item.value = Number(item.value).toFixed(2);
                if (pattern === "0%")
                    item.value = `${Math.round(Number(item.value) * 100)}%`;
                if (pattern === "#,##0.00")
                    item.value = Number(item.value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                count += 1;
            }
        }
        finish();
        options.onStatus?.(zh ? `已格式化 ${count} 个` : `Formatted ${count}`);
    }
    function merge() {
        remember();
        const sheet = currentSheet();
        const merges = sheet.merges ?? [];
        merges.push({ r1: selected.row, c1: selected.col, r2: selected.row, c2: selected.col + 1 });
        sheet.merges = merges;
        const left = ensure(selected.row, selected.col);
        left.align = "center";
        finish();
    }
    function unmerge() {
        remember();
        const sheet = currentSheet();
        sheet.merges = (sheet.merges ?? []).filter((m) => !(selected.row >= m.r1 && selected.row <= m.r2 && selected.col >= m.c1 && selected.col <= m.c2));
        finish();
    }
    function fillDown() {
        remember();
        const src = currentSheet().cells[selected.row]?.[selected.col];
        if (!src)
            return;
        const dest = ensure(selected.row + 1, selected.col);
        Object.assign(dest, structuredClone(src));
        finish();
    }
    function fillRight() {
        remember();
        const src = currentSheet().cells[selected.row]?.[selected.col];
        if (!src)
            return;
        const dest = ensure(selected.row, selected.col + 1);
        Object.assign(dest, structuredClone(src));
        finish();
    }
    function sort(ascending = true) {
        remember();
        const sheet = currentSheet();
        const col = selected.col;
        const table = tableRangeAt(sheet, selected.row, col);
        // Inside a table only the data rows move. The header and the totals row stay where they are.
        const dataTop = table ? (table.headerRow === false ? table.r1 : table.r1 + 1) : 0;
        const dataBottom = table ? (table.totalsRow ? table.r2 - 1 : table.r2) : sheet.cells.length - 1;
        const body = sheet.cells.slice(dataTop, dataBottom + 1);
        body.sort((a, b) => {
            const av = a?.[col]?.value ?? "";
            const bv = b?.[col]?.value ?? "";
            const an = Number(av);
            const bn = Number(bv);
            if (Number.isFinite(an) && Number.isFinite(bn))
                return ascending ? an - bn : bn - an;
            return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
        sheet.cells.splice(dataTop, body.length, ...body);
        if (table) {
            const key = { col: col - table.c1, ...(ascending ? {} : { descending: true }) };
            table.sort = [key, ...(table.sort ?? []).filter((item) => item.col !== key.col)];
        }
        finish();
    }
    function freeze() {
        remember();
        currentSheet().freeze = { row: selected.row, col: selected.col };
        finish();
        options.onStatus?.(zh ? `已冻结到 ${columnName(selected.col)}${selected.row + 1}` : `Frozen at ${columnName(selected.col)}${selected.row + 1}`);
    }
    function addSheet(name) {
        remember();
        const label = name ?? `Sheet${workbook.sheets.length + 1}`;
        workbook.sheets.push({ name: label, cells: [] });
        const source = workbook.source;
        if (source) {
            const index = workbook.sheets.length;
            const bytes = source.get("xl/worksheets/sheet1.xml");
            if (bytes)
                source.set(`xl/worksheets/sheet${index}.xml`, bytes.slice());
            const rels = textOfSource(source, "xl/_rels/workbook.xml.rels");
            if (rels && !rels.includes(`sheet${index}.xml`)) {
                source.set("xl/_rels/workbook.xml.rels", bytesOf(rels.replace("</Relationships>", `<Relationship Id="rId${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index}.xml"/></Relationships>`)));
            }
        }
        rebuildTabs();
        show(workbook.sheets.length - 1);
        touch();
    }
    function symbol(text) {
        remember();
        const cell = ensure(selected.row, selected.col);
        delete cell.formula;
        cell.value = (cell.value ?? "") + text;
        finish();
    }
    function applyStyle(name) {
        remember();
        const cell = ensure(selected.row, selected.col);
        cell.styleName = name;
        finish();
    }
    function formatCell(patch) {
        remember();
        const cell = ensure(selected.row, selected.col);
        if (patch.numFmt != null)
            cell.numFmt = patch.numFmt;
        if (patch.font != null)
            cell.font = patch.font;
        if (patch.fontSize != null)
            cell.fontSize = patch.fontSize;
        if (patch.color != null)
            cell.color = patch.color;
        if (patch.fill != null)
            cell.fill = patch.fill;
        if (patch.align != null)
            cell.align = patch.align;
        if (patch.bold != null)
            cell.bold = patch.bold;
        finish();
    }
    function printArea() {
        remember();
        const sheet = currentSheet();
        const setup = sheet.pageSetup ?? {};
        setup.printArea = `'${sheet.name}'!${inferRange(sheet)}`;
        sheet.pageSetup = setup;
        finish();
        options.onStatus?.(zh ? `打印区域 ${setup.printArea}` : `Print area ${setup.printArea}`);
    }
    function fitTo(width, height) {
        remember();
        const sheet = currentSheet();
        sheet.pageSetup = { ...(sheet.pageSetup ?? {}), fitToWidth: width, ...(height != null ? { fitToHeight: height } : {}) };
        finish();
    }
    function removeDuplicates() {
        remember();
        const sheet = currentSheet();
        const seen = new Set();
        const next = [];
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
    function textToColumns(delimiter = ",") {
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
    function listMacros() {
        const names = workbook.vbaModules ?? [];
        options.onStatus?.(names.length ? (zh ? `宏 ${names.join("、")}` : `Macros: ${names.join(", ")}`) : zh ? "未找到宏" : "No macros found");
        return names;
    }
    function addChart(kind = "column", range, title) {
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
    /** A click flips one value. The slicer then keeps whichever buttons stay pressed. */
    function toggleSlicer(button) {
        const box = button.closest(".sheet-slicer");
        const name = box?.querySelector(".sheet-slicer-title")?.textContent ?? "";
        button.classList.toggle("is-on");
        const values = [...(box?.querySelectorAll(".sheet-slicer-item.is-on") ?? [])].map((item) => item.dataset.value ?? "");
        slicerBy(name, values);
    }
    /** Keep the rows a slicer shows. No values, or every value, clears it so the whole column shows again. */
    function slicerBy(name, values) {
        const sheet = currentSheet();
        const slicer = (sheet.slicers ?? []).find((item) => item.name === name);
        if (!slicer)
            return;
        remember();
        const all = slicerValues(sheet, slicer);
        slicer.values = values?.length && values.length < all.length ? values : undefined;
        finish();
    }
    /** Narrow the current column to the given values, or drop that column's filter when none are given. */
    function filterBy(values) {
        remember();
        const sheet = currentSheet();
        const filter = sheet.filter ?? { r1: 0, c1: 0, r2: Math.max(0, sheet.cells.length - 1), c2: Math.max(0, (sheet.cells[0]?.length ?? 1) - 1) };
        const col = selected.col - filter.c1;
        const columns = (filter.columns ?? []).filter((column) => column.col !== col);
        if (values?.length && col >= 0)
            columns.push({ col, values });
        sheet.filter = { ...filter, columns: columns.length ? columns : undefined };
        finish();
    }
    function addSparkline(kind = "line", data) {
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
    function addConditionalFormat(rule, rows = 10, cols = 1) {
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
    function addTable(name) {
        remember();
        const sheet = currentSheet();
        const tables = sheet.tables ?? [];
        const r2 = Math.max(selected.row, sheet.cells.length - 1);
        const c2 = Math.max(selected.col, (sheet.cells[selected.row]?.length ?? 1) - 1);
        // The header row names the columns, so a formula can say Table1[数量] about a table just made.
        const columns = [];
        for (let col = selected.col; col <= c2; col += 1) {
            columns.push(columnTitle(sheet.cells[selected.row]?.[col]?.value ?? "", col, columns));
        }
        tables.push({
            id: `table${tables.length + 1}`,
            name: name ?? `Table${tables.length + 1}`,
            r1: selected.row,
            c1: selected.col,
            r2,
            c2,
            headerRow: true,
            columns,
        });
        sheet.tables = tables;
        finish();
    }
    /** The table under the selection gains or loses its header row. The row stays; only the marker moves. */
    function toggleHeader() {
        const sheet = currentSheet();
        const table = tableRangeAt(sheet, selected.row, selected.col);
        if (!table)
            return false;
        remember();
        table.headerRow = table.headerRow === false;
        finish();
        return table.headerRow !== false;
    }
    /** The table under the selection takes a new name. A blank name leaves it, and a name another table holds gains a suffix. */
    function renameTable(name) {
        const sheet = currentSheet();
        const table = tableRangeAt(sheet, selected.row, selected.col);
        const label = name.trim();
        if (!table || !label)
            return false;
        remember();
        const taken = new Set();
        for (const item of workbook.sheets) {
            for (const other of item.tables ?? []) {
                if (other !== table)
                    taken.add(other.name.toUpperCase());
            }
        }
        let next = label;
        while (taken.has(next.toUpperCase()))
            next = `${next}_`;
        table.name = next;
        finish();
        return true;
    }
    /** The table under the selection covers a new range. A column it gains takes its name from the header. */
    function resizeTable(range) {
        const sheet = currentSheet();
        const table = tableRangeAt(sheet, selected.row, selected.col);
        const r1 = Math.min(range.r1, range.r2);
        const r2 = Math.max(range.r1, range.r2);
        const c1 = Math.min(range.c1, range.c2);
        const c2 = Math.max(range.c1, range.c2);
        if (!table || r1 < 0 || c1 < 0)
            return false;
        remember();
        const shift = c1 - table.c1;
        const columns = table.columns ?? [];
        const next = [];
        for (let col = c1; col <= c2; col += 1) {
            const kept = columns[col - table.c1];
            const header = table.headerRow === false ? "" : sheet.cells[r1]?.[col]?.value ?? "";
            next.push(kept ?? columnTitle(header, col, next));
        }
        const realign = (list) => {
            if (!list)
                return undefined;
            const out = [];
            for (let col = c1; col <= c2; col += 1) {
                const value = list[col - c1 + shift];
                if (value !== undefined)
                    out[col - c1] = value;
            }
            return out;
        };
        table.r1 = r1;
        table.r2 = r2;
        table.c1 = c1;
        table.c2 = c2;
        table.columns = next;
        table.formulas = realign(table.formulas);
        table.totals = realign(table.totals);
        table.totalsFormulas = realign(table.totalsFormulas);
        table.widths = realign(table.widths);
        table.hidden = realign(table.hidden);
        table.formats = realign(table.formats);
        finish();
        return true;
    }
    /** The column under the selection keeps the rows holding one of these values. Omit them to show every row again. */
    function tableFilter(values) {
        const sheet = currentSheet();
        const table = tableRangeAt(sheet, selected.row, selected.col);
        if (!table || table.filter === false)
            return false;
        remember();
        const at = selected.col - table.c1;
        const columns = (table.filterColumns ?? []).filter((column) => column.col !== at);
        if (values)
            columns.push({ col: at, values });
        table.filterColumns = columns.length ? columns : undefined;
        finish();
        return true;
    }
    /** The table under the selection goes away. The cells it covered stay as they are. */
    function deleteTable() {
        const sheet = currentSheet();
        const table = tableRangeAt(sheet, selected.row, selected.col);
        if (!table || !sheet.tables)
            return false;
        remember();
        sheet.tables = sheet.tables.filter((item) => item !== table);
        finish();
        return true;
    }
    /** The table's last row becomes a totals row, or stops being one. The row below is pulled in when there is none yet. */
    function toggleTotals() {
        const sheet = currentSheet();
        const table = tableRangeAt(sheet, selected.row, selected.col);
        if (!table)
            return false;
        remember();
        if (table.totalsRow) {
            table.totalsRow = false;
            finish();
            return false;
        }
        table.r2 += 1;
        table.totalsRow = true;
        const corner = ensure(table.r2, table.c1);
        if (!corner.value)
            corner.value = totalsLabel(table);
        // Each column that holds a number sums itself. SUBTOTAL skips the header and this totals row.
        const top = (table.headerRow === false ? table.r1 : table.r1 + 1) + 1;
        const bottom = table.r2;
        for (let col = table.c1 + 1; col <= table.c2; col += 1) {
            const numeric = sheet.cells.slice(top - 1, bottom).some((line) => line?.[col]?.value && !Number.isNaN(Number(line[col].value)));
            if (!numeric)
                continue;
            const cell = ensure(table.r2, col);
            if (cell.value || cell.formula)
                continue;
            cell.formula = totalsFormula("sum", col, top, bottom);
            cell.value = `=${cell.formula}`;
        }
        finish();
        return true;
    }
    /** The totals cell of the column under the selection reduces the way asked. A column with no totals row cannot. */
    function totalsFunction(fn) {
        const sheet = currentSheet();
        const table = tableRangeAt(sheet, selected.row, selected.col);
        if (!table?.totalsRow)
            return false;
        remember();
        const at = selected.col - table.c1;
        const totals = table.totals ?? [];
        table.totals = totals;
        totals[at] = fn;
        const top = (table.headerRow === false ? table.r1 : table.r1 + 1) + 1;
        const cell = ensure(table.r2, selected.col);
        const totalsFormulas = table.totalsFormulas ?? [];
        table.totalsFormulas = totalsFormulas;
        if (fn === "none") {
            delete cell.formula;
            cell.value = "";
            totalsFormulas[at] = "";
        }
        else {
            cell.formula = totalsFormula(fn, selected.col, top, table.r2);
            cell.value = `=${cell.formula}`;
            totalsFormulas[at] = cell.formula;
        }
        // The first column says what the totals row does, unless it holds a total of its own.
        labelTotals(table);
        finish();
        return true;
    }
    /** The word the totals row shows in its first column, taken from the first column that totals something. */
    function totalsLabel(table) {
        const fn = (table.totals ?? []).find((item, index) => index > 0 && item && item !== "none");
        const labels = zh
            ? { sum: "汇总", count: "计数", average: "平均值", max: "最大值", min: "最小值" }
            : { sum: "Total", count: "Count", average: "Average", max: "Max", min: "Min" };
        return labels[fn && fn !== "none" ? fn : "sum"];
    }
    /** Puts that word in the first column. A column that totals on its own keeps its formula. */
    function labelTotals(table) {
        const corner = ensure(table.r2, table.c1);
        if (corner.formula || (table.totals?.[0] && table.totals[0] !== "none"))
            return;
        corner.value = totalsLabel(table);
    }
    /** The SUBTOTAL call for one totals function. The range stops above the totals row. */
    function totalsFormula(fn, column, top, bottom) {
        const code = fn === "count" ? 103 : fn === "average" ? 101 : fn === "max" ? 104 : fn === "min" ? 105 : 109;
        return `SUBTOTAL(${code},${columnName(column)}${top}:${columnName(column)}${bottom})`;
    }
    function addPivot(name) {
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
    function pivotCache(sheet, range) {
        const hit = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(range.trim());
        if (!hit)
            return { headers: [], rows: [] };
        const c1 = columnIndex(hit[1]);
        const r1 = Number(hit[2]) - 1;
        const c2 = hit[3] ? columnIndex(hit[3]) : c1;
        const r2 = hit[4] ? Number(hit[4]) - 1 : r1;
        const headers = [];
        for (let c = c1; c <= c2; c += 1)
            headers.push(sheet.cells[r1]?.[c]?.value || columnName(c));
        const rows = [];
        for (let r = r1 + 1; r <= r2; r += 1) {
            const line = [];
            for (let c = c1; c <= c2; c += 1)
                line.push(sheet.cells[r]?.[c]?.value ?? "");
            if (line.some((item) => item !== ""))
                rows.push(line);
        }
        return { headers, rows };
    }
    function columnIndex(letters) {
        let index = 0;
        for (const ch of letters.toUpperCase())
            index = index * 26 + ch.charCodeAt(0) - 64;
        return index - 1;
    }
    function printPreview() {
        const sheet = currentSheet();
        const setup = sheet.pageSetup ?? { orientation: "portrait", paperSize: "A4" };
        sheet.pageSetup = setup;
        paint();
        const label = `${setup.orientation ?? "portrait"} ${setup.paperSize ?? "A4"}${setup.printArea ? ` ${setup.printArea}` : ""}`;
        options.onStatus?.(zh ? `打印预览 ${label}` : `Print preview ${label}`);
    }
    function setRowHeight(points = 18) {
        remember();
        const sheet = currentSheet();
        const heights = sheet.rowHeights ?? [];
        heights[selected.row] = Math.max(1, points);
        sheet.rowHeights = heights;
        finish();
    }
    function setColumnWidth(chars = 12) {
        remember();
        const sheet = currentSheet();
        const widths = sheet.colWidths ?? [];
        widths[selected.col] = Math.max(1, chars);
        sheet.colWidths = widths;
        finish();
    }
    function insertCells(shift = "right") {
        remember();
        const sheet = currentSheet();
        if (shift === "down") {
            for (let r = sheet.cells.length; r > selected.row; r -= 1) {
                const from = sheet.cells[r - 1] ?? [];
                const line = sheet.cells[r] ?? (sheet.cells[r] = []);
                const moved = from[selected.col];
                if (moved)
                    line[selected.col] = { ...moved };
                else
                    delete line[selected.col];
                delete from[selected.col];
            }
            const cell = ensure(selected.row, selected.col);
            cell.value = "";
            delete cell.formula;
        }
        else {
            const line = sheet.cells[selected.row] ?? (sheet.cells[selected.row] = []);
            line.splice(selected.col, 0, { value: "" });
        }
        finish();
    }
    function deleteCells(shift = "left") {
        remember();
        const sheet = currentSheet();
        if (shift === "up") {
            for (let r = selected.row; r < sheet.cells.length - 1; r += 1) {
                const line = sheet.cells[r] ?? (sheet.cells[r] = []);
                const next = sheet.cells[r + 1] ?? [];
                line[selected.col] = next[selected.col];
                delete next[selected.col];
            }
            const last = sheet.cells[sheet.cells.length - 1];
            if (last)
                delete last[selected.col];
        }
        else {
            const line = sheet.cells[selected.row];
            line?.splice(selected.col, 1);
        }
        finish();
    }
    function bumpDecimals(delta) {
        remember();
        let count = 0;
        for (const row of currentSheet().cells) {
            for (const item of row ?? []) {
                if (!item || item.formula)
                    continue;
                const raw = item.value.replace(/,/g, "");
                if (!/^-?\d+(?:\.\d+)?$/.test(raw))
                    continue;
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
    function defineName(name, refersTo) {
        const label = name?.trim() || (zh ? "名称1" : "Name1");
        const target = refersTo?.trim() || `${columnName(selected.col)}${selected.row + 1}`;
        remember();
        const names = workbook.names ?? [];
        const existing = names.find((item) => item.name.toUpperCase() === label.toUpperCase());
        if (existing)
            existing.refersTo = target.startsWith("=") ? target : `=${target}`;
        else
            names.push({ name: label, refersTo: target.startsWith("=") ? target : `=${target}` });
        workbook.names = names;
        finish();
        options.onStatus?.(zh ? `已定义 ${label}` : `Defined ${label}`);
    }
    function goToSpecial(kind = "blanks") {
        let count = 0;
        let first;
        const sheet = currentSheet();
        const rows = Math.max(sheet.cells.length, 1);
        const cols = Math.max(1, sheet.cells.reduce((w, row) => Math.max(w, row?.length ?? 0), 1));
        for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
                const cell = sheet.cells[r]?.[c];
                const covered = (ranges) => (ranges ?? []).some((item) => r >= item.r1 && r <= item.r2 && c >= item.c1 && c <= item.c2);
                const hit = kind === "blanks" ? !cell || cell.value === "" :
                    kind === "formulas" ? !!cell?.formula :
                        kind === "comments" ? !!cell?.comment :
                            kind === "validation" ? covered(sheet.validations) :
                                kind === "conditional" ? covered(sheet.conditionalFormats) :
                                    !!cell && !cell.formula && cell.value !== "";
                if (!hit)
                    continue;
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
    function border(style = "thin", color = "#18181b") {
        const item = ensure(selected.row, selected.col);
        remember();
        const edge = { style, color };
        item.border = { top: edge, right: edge, bottom: edge, left: edge };
        finish();
    }
    function copyCell() {
        const cell = currentCell();
        if (!cell)
            return;
        clipboard = { cell: cloneCell(cell), cut: false };
        options.onStatus?.(zh ? "已复制" : "Copied");
    }
    function cutCell() {
        const cell = currentCell();
        if (!cell)
            return;
        remember();
        clipboard = { cell: cloneCell(cell), cut: true };
        cell.value = "";
        delete cell.formula;
        finish();
        options.onStatus?.(zh ? "已剪切" : "Cut");
    }
    function pasteCell() {
        if (!clipboard)
            return;
        remember();
        const target = ensure(selected.row, selected.col);
        Object.assign(target, cloneCell(clipboard.cell));
        if (clipboard.cut)
            clipboard = undefined;
        finish();
    }
    function formatPainter() {
        const cell = currentCell();
        if (!painter) {
            if (!cell)
                return;
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
    function workbookStats() {
        let cells = 0;
        let formulas = 0;
        for (const sheet of workbook.sheets) {
            for (const row of sheet.cells) {
                for (const item of row ?? []) {
                    if (!item)
                        continue;
                    cells += 1;
                    if (item.formula)
                        formulas += 1;
                }
            }
        }
        const stats = { sheets: workbook.sheets.length, cells, formulas };
        options.onStatus?.(zh ? `${stats.sheets} 表 / ${stats.cells} 格 / ${stats.formulas} 公式` : `${stats.sheets} sheets / ${stats.cells} cells / ${stats.formulas} formulas`);
        return stats;
    }
    function cloneCell(cell) {
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
    function styleOnly(cell) {
        const next = cloneCell(cell);
        next.value = "";
        delete next.formula;
        return next;
    }
    function cssBorder(edge) {
        const width = edge.style === "thick" ? "2px" : edge.style === "medium" ? "1.5px" : "1px";
        const style = edge.style === "dashed" || edge.style === "dotted" ? edge.style : "solid";
        return `${width} ${style} ${edge.color ?? "#18181b"}`;
    }
    function addShape(kind = "rect", text) {
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
    function setTheme(theme) {
        remember();
        workbook.theme = {
            name: theme.name ?? "Office",
            colors: theme.colors ?? ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"],
            fonts: theme.fonts ?? { major: "Calibri Light", minor: "Calibri" },
        };
        finish();
    }
    function addValidation(rule = {}) {
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
    function addFormControl(kind = "button", label) {
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
    function addSlicer(field) {
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
    function addXmlMap(name) {
        remember();
        const sheet = currentSheet();
        const maps = sheet.xmlMaps ?? [];
        maps.push({ id: `map${maps.length + 1}`, name: name ?? `Map${maps.length + 1}`, root: "root" });
        sheet.xmlMaps = maps;
        options.onStatus?.(zh ? "已添加 XML 映射" : "XML map added");
        finish();
    }
    function groupRows() {
        remember();
        const sheet = currentSheet();
        const outline = sheet.outline ?? { rows: [], summaryBelow: true };
        const rows = new Set(outline.rows ?? []);
        rows.add(selected.row);
        sheet.outline = { ...outline, rows: [...rows].sort((a, b) => a - b) };
        finish();
    }
    function ungroupRows() {
        remember();
        const sheet = currentSheet();
        if (!sheet.outline?.rows)
            return;
        sheet.outline = { ...sheet.outline, rows: sheet.outline.rows.filter((row) => row !== selected.row) };
        finish();
    }
    function subtotal() {
        remember();
        const sheet = currentSheet();
        let total = 0;
        for (const row of sheet.cells) {
            const item = row?.[selected.col];
            if (!item || item.formula)
                continue;
            if (/^-?\d+(?:\.\d+)?$/.test(item.value))
                total += Number(item.value);
        }
        const cell = ensure(sheet.cells.length, selected.col);
        cell.formula = `SUM(${columnName(selected.col)}1:${columnName(selected.col)}${sheet.cells.length})`;
        cell.value = String(total);
        finish();
        options.onStatus?.(zh ? `小计 ${total}` : `Subtotal ${total}`);
    }
    function pageBreak() {
        remember();
        const sheet = currentSheet();
        const breaks = sheet.pageBreaks ?? { rows: [], cols: [] };
        const rows = new Set(breaks.rows ?? []);
        rows.add(selected.row + 1);
        sheet.pageBreaks = { ...breaks, rows: [...rows].sort((a, b) => a - b) };
        finish();
    }
    function alignObjects(mode = "left") {
        remember();
        const sheet = currentSheet();
        const shapes = sheet.shapes ?? [];
        if (!shapes.length) {
            options.onStatus?.(zh ? "没有可对齐的对象" : "No objects to align");
            return;
        }
        if (mode === "left")
            for (const shape of shapes)
                shape.x = Math.min(...shapes.map((item) => item.x));
        if (mode === "right") {
            const right = Math.max(...shapes.map((item) => item.x + item.w));
            for (const shape of shapes)
                shape.x = right - shape.w;
        }
        if (mode === "center") {
            const mid = shapes.reduce((sum, item) => sum + item.x + item.w / 2, 0) / shapes.length;
            for (const shape of shapes)
                shape.x = mid - shape.w / 2;
        }
        finish();
    }
    function spellCheck() {
        const words = new Set(["the", "and", "for", "sheet", "excel", "sum", "total", "name", "date", "value", "数据", "合计", "姓名", "日期"]);
        let count = 0;
        const misses = [];
        for (const row of currentSheet().cells) {
            for (const item of row ?? []) {
                if (!item || item.formula)
                    continue;
                for (const token of item.value.split(/[^A-Za-z一-鿿]+/).filter(Boolean)) {
                    if (token.length < 3)
                        continue;
                    if (words.has(token.toLowerCase()) || words.has(token))
                        continue;
                    count += 1;
                    if (misses.length < 8)
                        misses.push(token);
                }
            }
        }
        options.onStatus?.(count ? (zh ? `拼写可疑 ${count}: ${misses.join(", ")}` : `Spelling suspects ${count}: ${misses.join(", ")}`) : zh ? "未发现拼写问题" : "No spelling issues");
        return count;
    }
    function tracePrecedents() {
        const cell = currentCell();
        if (!cell?.formula) {
            options.onStatus?.(zh ? "当前格没有公式" : "No formula in cell");
            return [];
        }
        const refs = [...cell.formula.matchAll(/\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?/g)].map((match) => match[0]);
        options.onStatus?.(refs.length ? refs.join(", ") : zh ? "无引用" : "No precedents");
        return refs;
    }
    function traceDependents() {
        const target = `${columnName(selected.col)}${selected.row + 1}`;
        const hits = [];
        currentSheet().cells.forEach((row, r) => {
            row?.forEach((item, c) => {
                if (!item?.formula)
                    return;
                if (item.formula.toUpperCase().includes(target.toUpperCase()))
                    hits.push(`${columnName(c)}${r + 1}`);
            });
        });
        options.onStatus?.(hits.length ? hits.join(", ") : zh ? "无从属" : "No dependents");
        return hits;
    }
    function errorCheck() {
        const errors = [];
        currentSheet().cells.forEach((row, r) => {
            row?.forEach((item, c) => {
                if (!item)
                    return;
                if (/^#(DIV\/0|VALUE|REF|N\/A|NAME\?|NUM|NULL)!$/.test(item.value))
                    errors.push(`${columnName(c)}${r + 1}:${item.value}`);
            });
        });
        options.onStatus?.(errors.length ? errors.slice(0, 8).join(", ") : zh ? "无错误" : "No errors");
        return errors;
    }
    function allowEditRange(name, range) {
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
    function setArrayFormula(formula) {
        remember();
        const cell = ensure(selected.row, selected.col);
        const body = (formula ?? formulaInput.value ?? "").replace(/^=/, "");
        if (!body)
            return;
        cell.formula = body;
        cell.array = true;
        recalculate(workbook);
        finish();
    }
    function whatIf(target = 100) {
        remember();
        const cell = ensure(selected.row, selected.col);
        cell.value = String(target);
        delete cell.formula;
        finish();
        options.onStatus?.(zh ? `假设值 ${target}` : `What-if ${target}`);
    }
    function consolidate(spec = {}) {
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
    function forecast() {
        const sheet = currentSheet();
        const values = [];
        for (let r = 0; r < sheet.cells.length; r += 1) {
            const raw = sheet.cells[r]?.[selected.col]?.value ?? "";
            if (/^-?\d+(?:\.\d+)?$/.test(raw))
                values.push(Number(raw));
        }
        if (values.length < 2) {
            options.onStatus?.(zh ? "数据不足" : "Not enough data");
            return;
        }
        const delta = values[values.length - 1] - values[values.length - 2];
        const next = values[values.length - 1] + delta;
        remember();
        const cell = ensure(values.length, selected.col);
        cell.value = String(Math.round(next * 1000) / 1000);
        finish();
        options.onStatus?.(zh ? `预测 ${cell.value}` : `Forecast ${cell.value}`);
    }
    function inferRange(sheet, whole = false) {
        const rows = Math.max(1, sheet.cells.length);
        const cols = Math.max(1, sheet.cells.reduce((w, row) => Math.max(w, row?.length ?? 0), 1));
        if (!whole && selected.row > 0) {
            const start = Math.max(0, selected.row - Math.min(selected.row, 9));
            return `${columnName(selected.col)}${start + 1}:${columnName(selected.col)}${selected.row + 1}`;
        }
        return `A1:${columnName(cols - 1)}${rows}`;
    }
    function commitFormula(text) {
        remember();
        const cell = ensure(selected.row, selected.col);
        if (text.startsWith("=")) {
            cell.formula = text.slice(1);
            cell.value = text;
        }
        else {
            delete cell.formula;
            cell.value = text;
        }
        recalculate(workbook);
        finish();
    }
    function undo() {
        const prev = undoStack.pop();
        if (!prev)
            return;
        redoStack.push(snapshot());
        restore(prev);
    }
    function redo() {
        const next = redoStack.pop();
        if (!next)
            return;
        undoStack.push(snapshot());
        restore(next);
    }
    function restore(json) {
        const parsed = JSON.parse(json);
        workbook.sheets[parsed.index] = parsed.sheet;
        if (parsed.names && parsed.names.length < workbook.sheets.length)
            workbook.sheets.splice(parsed.names.length);
        active = parsed.index;
        rebuildTabs();
        touch();
        show(parsed.index);
        options.onSelection?.();
    }
    function currentSheet() {
        return workbook.sheets[active] ?? workbook.sheets[0];
    }
    function currentCell() {
        return currentSheet().cells[selected.row]?.[selected.col];
    }
    function ensure(row, column) {
        const sheet = currentSheet();
        const line = sheet.cells[row] ?? [];
        sheet.cells[row] = line;
        const item = line[column] ?? { value: "" };
        line[column] = item;
        return item;
    }
    function finish() {
        touch();
        paint();
        options.onSelection?.();
    }
    function touch() {
        workbook.edited = true;
        options.onChange?.();
    }
    function arm() {
        if (armed)
            return;
        remember();
        armed = true;
    }
    function remember() {
        undoStack.push(snapshot());
        if (undoStack.length > 50)
            undoStack.shift();
        redoStack.length = 0;
    }
    function snapshot() {
        return JSON.stringify({ index: active, sheet: currentSheet(), names: workbook.sheets.map((sheet) => sheet.name) });
    }
    function markSelected() {
        for (const node of frame.querySelectorAll("td")) {
            node.classList.toggle("is-selected", node.dataset.row === String(selected.row) && node.dataset.col === String(selected.col));
        }
    }
}
function textOfSource(source, path) {
    const bytes = source.get(path);
    return bytes ? new TextDecoder().decode(bytes) : undefined;
}
function bytesOf(text) {
    return new TextEncoder().encode(text);
}
/** A column's name, taken from its header. A blank header uses the column letter, and a repeat gains a suffix. */
function columnTitle(text, column, taken) {
    let name = text.trim() || columnName(column);
    while (taken.some((item) => item.toUpperCase() === name.toUpperCase()))
        name = `${name}_`;
    return name;
}
function columnName(index) {
    let name = "";
    let next = index + 1;
    while (next > 0) {
        next -= 1;
        name = String.fromCharCode(65 + (next % 26)) + name;
        next = Math.floor(next / 26);
    }
    return name;
}
function cell(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}
function el(tag, className) {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}
