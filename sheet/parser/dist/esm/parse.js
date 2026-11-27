import { hasLook, readCellStyles } from "./styles.js";
import { vbaModuleNames } from "./vba.js";
import { loadArchive } from "./zip.js";
import { attr, child, children, parseXml } from "./xml.js";
export class XlsxOpenError extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = "XlsxOpenError";
        this.code = code;
    }
}
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** Reads a .xlsx into sheets. Formula cells keep `formula` and show the cached value until recalculate. */
export async function parseXlsx(input, options = {}) {
    let bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : new Uint8Array(input);
    if (isOle(bytes)) {
        const text = new TextDecoder("utf-16le").decode(bytes);
        if (!text.includes("EncryptedPackage"))
            throw new XlsxOpenError("LEGACY_XLS");
        if (!options.password)
            throw new XlsxOpenError("ENCRYPTED_XLSX");
        try {
            const { decryptAgile } = await import("./crypto.js");
            bytes = new Uint8Array(await decryptAgile(bytes, options.password));
        }
        catch (err) {
            if (err && typeof err === "object" && "code" in err && err.code === "WRONG_PASSWORD") {
                throw new XlsxOpenError("WRONG_PASSWORD");
            }
            throw new XlsxOpenError("ENCRYPTED_XLSX");
        }
    }
    const archive = loadArchive(bytes);
    const shared = sharedStrings(archive);
    const theme = readTheme(archive.getText("xl/theme/theme1.xml"));
    const styleBook = readCellStyles(archive.getText("xl/styles.xml"), theme.colors);
    const styles = styleBook.looks;
    const names = definedNames(archive);
    const vbaModules = vbaModuleNames(archive.files.get("xl/vbaProject.bin") ?? archive.files.get("xl/vbaproject.bin"));
    return {
        sheets: sheetsFrom(archive, shared, styles, styleBook.names, styleBook.dxfs),
        ...(names.length ? { names } : {}),
        ...(vbaModules.length ? { vbaModules } : {}),
        ...(theme.present ? { theme: { ...(theme.name ? { name: theme.name } : {}), colors: (theme.colors ?? []).filter((color) => color !== ""), fonts: theme.fonts } } : {}),
        source: archive.files,
    };
}
function isOle(bytes) {
    return bytes.length >= OLE_MAGIC.length && OLE_MAGIC.every((byte, index) => bytes[index] === byte);
}
function sheetsFrom(archive, shared, styles, styleNames, dxfs) {
    const workbook = child(parseXml(archive.getText("xl/workbook.xml") ?? ""), "workbook");
    const named = children(child(workbook, "sheets"), "sheet").map((sheet) => attr(sheet, "name") ?? "");
    const paths = [...archive.files.keys()]
        .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
        .sort((a, b) => sheetNumber(a) - sheetNumber(b));
    return paths.map((path, index) => sheetFrom(archive, path, named[index] || `Sheet${index + 1}`, shared, styles, styleNames, dxfs));
}
function sheetFrom(archive, path, name, shared, styles, styleNames, dxfs) {
    const root = child(parseXml(archive.getText(path) ?? ""), "worksheet") ?? { name: "worksheet", attrs: {}, children: [], text: "" };
    const cells = [];
    const dataTables = [];
    for (const row of children(child(root, "sheetData"), "row")) {
        for (const cell of children(row, "c")) {
            const ref = attr(cell, "r") ?? "";
            const where = cellRef(ref);
            if (!where)
                continue;
            const formulaNode = child(cell, "f");
            const formulaText = formulaNode?.text?.trim() ?? "";
            const array = attr(formulaNode, "t") === "array" || attr(formulaNode, "t") === "dataTable";
            rememberDataTable(formulaNode, dataTables);
            const cached = cellValue(cell, attr(cell, "t") ?? "", shared);
            const styleIndex = Number(attr(cell, "s"));
            const look = styles[styleIndex];
            const styleName = styleNames[styleIndex];
            const link = hyperlinkOf(root, ref);
            const note = commentOf(archive, path, ref);
            if (!formulaText && !cached && !hasLook(look) && !link && !note)
                continue;
            const item = {
                // Formula cells keep the expression for the formula bar; the grid shows the cache until recalculate.
                value: formulaText ? cached || `=${formulaText}` : cached,
                ...look,
            };
            if (formulaText)
                item.formula = formulaText.replace(/^\=/, "");
            if (array)
                item.array = true;
            // Only an array formula's ref is a spill. A data table uses ref for its result block.
            if (attr(formulaNode, "t") === "array" && attr(formulaNode, "ref"))
                item.spillRef = attr(formulaNode, "ref");
            if (link)
                item.hyperlink = link;
            if (note)
                item.comment = note;
            if (styleName)
                item.styleName = styleName;
            const line = cells[where.row] ?? [];
            line[where.column] = item;
            cells[where.row] = line;
        }
    }
    // Cells inside an array formula's ref were filled by the spill, so a recalculation may replace them.
    cells.forEach((row, rowIndex) => {
        row?.forEach((cell, column) => {
            if (cell?.spillRef)
                markSpilled(cells, rowIndex, column, cell.spillRef);
        });
    });
    const sheet = { name, cells, ...sheetShape(root, archive, path, dxfs) };
    if (dataTables.length)
        sheet.dataTables = dataTables;
    // A calculated column's formula fills the data cells that do not already hold one.
    fillColumnFormulas(sheet);
    return sheet;
}
function sheetShape(root, archive, path, dxfs) {
    const shape = {};
    const merges = children(child(root, "mergeCells"), "mergeCell")
        .map((item) => rangeOf(attr(item, "ref") ?? ""))
        .filter((item) => !!item);
    if (merges.length)
        shape.merges = merges;
    const widths = new Map();
    const hiddenCols = [];
    for (const col of children(child(root, "cols"), "col")) {
        const from = Number(attr(col, "min")) - 1;
        const to = Number(attr(col, "max")) - 1;
        if (from < 0 || to < from || to - from > 256)
            continue;
        const width = Number(attr(col, "width"));
        const hidden = attr(col, "hidden") === "1" || attr(col, "hidden") === "true";
        for (let column = from; column <= to; column += 1) {
            if (width > 0)
                widths.set(column, width);
            if (hidden)
                hiddenCols.push(column);
        }
    }
    if (widths.size) {
        const list = [];
        for (const [column, width] of widths)
            list[column] = width;
        shape.colWidths = list;
    }
    if (hiddenCols.length)
        shape.hiddenCols = hiddenCols;
    const heights = [];
    const hiddenRows = [];
    for (const row of children(child(root, "sheetData"), "row")) {
        const index = Number(attr(row, "r")) - 1;
        if (index < 0)
            continue;
        const height = Number(attr(row, "ht"));
        if (height > 0)
            heights[index] = height;
        if (attr(row, "hidden") === "1" || attr(row, "hidden") === "true")
            hiddenRows.push(index);
    }
    if (heights.some((height) => height != null))
        shape.rowHeights = heights;
    if (hiddenRows.length)
        shape.hiddenRows = hiddenRows;
    const pane = children(child(root, "sheetViews"), "sheetView").flatMap((view) => children(child(view, "pane"), "pane").concat(child(view, "pane") ?? []))[0];
    const frozenRow = Number(attr(pane, "ySplit"));
    const frozenCol = Number(attr(pane, "xSplit"));
    if (frozenRow > 0 || frozenCol > 0)
        shape.freeze = { row: frozenRow > 0 ? frozenRow : 0, col: frozenCol > 0 ? frozenCol : 0 };
    const filter = filterOf(root);
    if (filter)
        shape.filter = filter;
    const page = pageSetup(root);
    if (page)
        shape.pageSetup = page;
    const heads = headerFooterOf(root);
    if (heads.header || heads.footer)
        shape.pageSetup = { ...shape.pageSetup, ...heads };
    if (child(root, "sheetProtection"))
        shape.protected = true;
    const drawn = shapeList(archive, path);
    if (drawn.length)
        shape.shapes = drawn;
    const formats = conditionalFormats(root, dxfs);
    if (formats.length)
        shape.conditionalFormats = formats;
    const checks = validations(root);
    if (checks.length)
        shape.validations = checks;
    const lists = tables(root, archive, path, dxfs);
    if (lists.length)
        shape.tables = lists;
    const charts = chartList(archive, path);
    if (charts.length)
        shape.charts = charts;
    const sparklines = sparklineList(root);
    if (sparklines.length)
        shape.sparklines = sparklines;
    const pivots = pivotList(archive, path);
    if (pivots.length)
        shape.pivots = pivots;
    const outline = outlineOf(root);
    if (outline)
        shape.outline = outline;
    const breaks = pageBreaksOf(root);
    if (breaks)
        shape.pageBreaks = breaks;
    const slicers = slicerList(archive, path);
    if (slicers.length)
        shape.slicers = slicers;
    const controls = formControlsOf(archive, path);
    if (controls.length)
        shape.formControls = controls;
    const maps = xmlMapsOf(archive, path);
    if (maps.length)
        shape.xmlMaps = maps;
    const consolidation = consolidationOf(archive, path);
    if (consolidation)
        shape.consolidation = consolidation;
    const editable = allowEditRangesOf(root);
    if (editable.length)
        shape.allowEditRanges = editable;
    const area = printAreaOf(archive, path);
    if (area) {
        shape.pageSetup = { ...shape.pageSetup, printArea: area.area, ...(area.titles ? { printTitles: area.titles } : {}) };
    }
    return shape;
}
function rememberDataTable(formula, tables) {
    if (attr(formula, "t") !== "dataTable")
        return;
    const ref = attr(formula, "ref");
    if (!ref || tables.some((item) => item.ref === ref))
        return;
    const rowInput = attr(formula, "r1");
    const colInput = attr(formula, "r2") ?? (attr(formula, "dt2D") !== "1" ? attr(formula, "r1") : undefined);
    tables.push({
        ref,
        ...(attr(formula, "dtr") === "1" && rowInput ? { rowInput } : {}),
        ...(attr(formula, "dt2D") === "1" || attr(formula, "dtr") !== "1" ? (colInput ? { colInput } : {}) : {}),
    });
}
function pageBreaksOf(root) {
    const rows = children(child(root, "rowBreaks"), "brk").map((item) => Number(attr(item, "id"))).filter((id) => id > 0);
    const cols = children(child(root, "colBreaks"), "brk").map((item) => Number(attr(item, "id"))).filter((id) => id > 0);
    if (!rows.length && !cols.length)
        return undefined;
    return { ...(rows.length ? { rows } : {}), ...(cols.length ? { cols } : {}) };
}
function slicerList(archive, path) {
    const targets = [...relTargets(archive, path).values()].filter((target) => /\/slicers?\d*\.xml$/i.test(target));
    return targets.flatMap((target) => {
        const list = child(parseXml(archive.getText(target) ?? ""), "slicers");
        const cache = slicerCache(archive, target);
        return children(list, "slicer").map((item, index) => {
            const name = attr(item, "name") ?? `Slicer${index + 1}`;
            const cached = cache.get(attr(item, "cache") ?? "");
            return {
                id: name,
                name,
                source: cached?.source ?? "",
                field: cached?.field ?? attr(item, "caption") ?? "",
                ...(cached?.values ? { values: cached.values } : {}),
            };
        });
    });
}
function slicerCache(archive, slicerPath) {
    const caches = new Map();
    for (const target of relTargets(archive, slicerPath).values()) {
        if (!/slicerCache/i.test(target))
            continue;
        const def = child(parseXml(archive.getText(target) ?? ""), "slicerCacheDefinition");
        const name = attr(def, "name");
        if (!name)
            continue;
        // A value with no `nd` flag is one the slicer still shows. None at all means every value shows.
        const items = children(child(def, "data"), "i");
        const kept = items.filter((item) => attr(item, "nd") !== "1").map((item) => attr(item, "v") ?? "").filter((value) => value !== "");
        caches.set(name, {
            source: attr(def, "sourceName") ?? "",
            field: attr(child(def, "data"), "name") ?? "",
            ...(items.length && kept.length < items.length ? { values: kept } : {}),
        });
    }
    return caches;
}
function outlineOf(root) {
    const rows = [];
    const cols = [];
    for (const row of children(child(root, "sheetData"), "row")) {
        const level = Number(attr(row, "outlineLevel"));
        const index = Number(attr(row, "r")) - 1;
        if (level > 0 && index >= 0)
            rows.push(index);
    }
    for (const col of children(child(root, "cols"), "col")) {
        if (Number(attr(col, "outlineLevel")) <= 0)
            continue;
        const from = Number(attr(col, "min")) - 1;
        const to = Number(attr(col, "max")) - 1;
        for (let column = from; column <= to && column - from < 256; column += 1)
            cols.push(column);
    }
    if (!rows.length && !cols.length)
        return undefined;
    const sheetPr = child(root, "sheetPr");
    const summary = attr(child(sheetPr, "outlinePr"), "summaryBelow");
    return {
        ...(rows.length ? { rows } : {}),
        ...(cols.length ? { cols } : {}),
        summaryBelow: summary !== "0",
    };
}
function printAreaOf(archive, path) {
    const index = sheetNumber(path) - 1;
    const names = definedNames(archive).filter((item) => item.localSheet === index);
    const area = names.find((item) => item.name === "_xlnm.Print_Area")?.refersTo;
    const titles = names.find((item) => item.name === "_xlnm.Print_Titles")?.refersTo;
    if (!area && !titles)
        return undefined;
    return { area: area ?? "", ...(titles ? { titles } : {}) };
}
function readTheme(xml) {
    const theme = child(parseXml(xml ?? ""), "theme");
    const scheme = child(child(theme, "themeElements"), "clrScheme");
    const order = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"];
    const colors = order.map((name) => {
        const slot = child(scheme, name);
        const raw = attr(child(slot, "srgbClr"), "val") ?? attr(child(slot, "sysClr"), "lastClr");
        return raw ? `#${raw.toLowerCase()}` : "";
    });
    const fonts = child(child(theme, "themeElements"), "fontScheme");
    const major = attr(child(child(fonts, "majorFont"), "latin"), "typeface");
    const minor = attr(child(child(fonts, "minorFont"), "latin"), "typeface");
    const name = attr(theme, "name");
    return {
        present: colors.some((color) => color !== "") || !!major || !!minor,
        ...(name ? { name } : {}),
        colors,
        fonts: { ...(major ? { major } : {}), ...(minor ? { minor } : {}) },
    };
}
function commentOf(archive, path, ref) {
    const target = [...relTargets(archive, path).values()].find((item) => /\/comments\d*\.xml$/i.test(item));
    if (!target)
        return undefined;
    const list = child(parseXml(archive.getText(target) ?? ""), "comments");
    for (const item of children(child(list, "commentList"), "comment")) {
        if (attr(item, "ref") !== ref)
            continue;
        const text = children(child(item, "text"), "r").map((run) => child(run, "t")?.text ?? "").join("").trim();
        if (text)
            return text;
    }
    return undefined;
}
function pivotList(archive, path) {
    return [...relTargets(archive, path).values()]
        .filter((target) => /\/pivotTables\/pivotTable\d+\.xml$/i.test(target))
        .flatMap((target, index) => {
        const table = child(parseXml(archive.getText(target) ?? ""), "pivotTableDefinition");
        if (!table)
            return [];
        const cache = pivotCache(archive, attr(table, "cacheId"));
        const fields = children(child(table, "pivotFields"), "pivotField");
        const names = cache.fields.length ? cache.fields : fields.map((_, at) => `F${at + 1}`);
        const fieldsOf = (tag) => {
            const parent = child(table, tag);
            const data = children(parent, "dataField");
            return data.length ? data : children(parent, "field");
        };
        const picked = (tag) => fieldsOf(tag).flatMap((field) => {
            const name = names[Number(attr(field, "x") ?? attr(field, "fld"))];
            return name ? [name] : [];
        });
        // dataFields carries the aggregation on subtotal. Anything else falls back to a sum.
        const subtotal = attr(fieldsOf("dataFields")[0], "subtotal");
        const agg = subtotal === "count" || subtotal === "average" || subtotal === "max" || subtotal === "min" || subtotal === "product" ? subtotal : undefined;
        return [{
                id: attr(table, "name") ?? `pivot${index + 1}`,
                name: attr(table, "name") ?? `Pivot${index + 1}`,
                source: cache.source,
                rows: picked("rowFields"),
                columns: picked("colFields"),
                values: picked("dataFields"),
                ...(agg ? { agg } : {}),
                fields: cache.fields,
                cache: cache.rows,
            }];
    });
}
function pivotCache(archive, cacheId) {
    const empty = { source: "", fields: [], rows: [] };
    const workbookRels = relTargets(archive, "xl/workbook.xml");
    const defTarget = [...workbookRels.entries()]
        .filter(([, target]) => /pivotCache\/pivotCacheDefinition\d+\.xml$/i.test(target))
        .find(([, target]) => !cacheId || target.includes(`pivotCacheDefinition${cacheId}.xml`))?.[1];
    if (!defTarget)
        return empty;
    const def = child(parseXml(archive.getText(defTarget) ?? ""), "pivotCacheDefinition");
    const source = attr(child(child(def, "cacheSource"), "worksheetSource"), "ref") ?? "";
    const fields = children(child(def, "cacheFields"), "cacheField").map((field) => attr(field, "name") ?? "");
    const recordsTarget = [...relTargets(archive, defTarget).values()].find((target) => /pivotCacheRecords\d+\.xml$/i.test(target));
    const records = child(parseXml(recordsTarget ? archive.getText(recordsTarget) ?? "" : ""), "pivotCacheRecords");
    const rows = children(records, "r").map((row) => row.children.map((item) => attr(item, "v") ?? item.text));
    return { source, fields, rows };
}
function hyperlinkOf(root, ref) {
    for (const link of children(child(root, "hyperlinks"), "hyperlink")) {
        if (attr(link, "ref") !== ref)
            continue;
        const target = attr(link, "location") ?? attr(link, "display");
        if (target)
            return target;
    }
    return undefined;
}
function conditionalFormats(root, dxfs) {
    const out = [];
    for (const block of children(root, "conditionalFormatting")) {
        const range = rangeOf(attr(block, "sqref")?.split(/\s+/)[0] ?? "");
        if (!range)
            continue;
        children(block, "cfRule").forEach((rule, index) => {
            const parsed = cfRule(rule, dxfs);
            if (parsed)
                out.push({ id: `cf${out.length + index + 1}`, ...range, rule: parsed });
        });
    }
    return out;
}
/** The fill and font color live in `styles.xml`, pointed at by `dxfId`. Only rules that paint a cell take them. */
function dxfLook(rule, dxfs) {
    const id = Number(attr(rule, "dxfId"));
    const look = dxfs[id];
    if (!look)
        return {};
    return { ...(look.fill ? { fill: look.fill } : {}), ...(look.color ? { color: look.color } : {}) };
}
function cfRule(rule, dxfs) {
    const type = attr(rule, "type");
    const formulas = children(rule, "formula").map((item) => item.text.trim());
    if (type === "cellIs") {
        const op = cellOp(attr(rule, "operator") ?? "");
        if (!op || !formulas[0])
            return undefined;
        return { type: "cellValue", op, formula1: formulas[0], ...(formulas[1] ? { formula2: formulas[1] } : {}), ...dxfLook(rule, dxfs) };
    }
    if (type === "expression" && formulas[0])
        return { type: "expression", formula: formulas[0], ...dxfLook(rule, dxfs) };
    if (type === "colorScale") {
        const colors = children(child(rule, "colorScale"), "color").map(colorOf).filter((item) => !!item);
        const [first, second, third] = colors;
        if (first && second && third)
            return { type: "colorScale", colors: [first, second, third] };
        if (first && second)
            return { type: "colorScale", colors: [first, second] };
    }
    if (type === "dataBar") {
        const color = colorOf(children(child(rule, "dataBar"), "color")[0]);
        return { type: "dataBar", color: color ?? "#638ec6" };
    }
    if (type === "iconSet") {
        const set = attr(child(rule, "iconSet"), "iconSet");
        if (set === "3TrafficLights" || set === "3Arrows" || set === "3Symbols")
            return { type: "iconSet", set };
    }
    if (type === "duplicateValues" || type === "uniqueValues")
        return { type: type === "duplicateValues" ? "duplicate" : "unique", ...dxfLook(rule, dxfs) };
    if (type === "top10") {
        const rank = Number(attr(rule, "rank"));
        return {
            type: "top10",
            rank: Number.isFinite(rank) && rank > 0 ? rank : 10,
            ...(attr(rule, "percent") === "1" ? { percent: true } : {}),
            ...(attr(rule, "bottom") === "1" ? { bottom: true } : {}),
            ...dxfLook(rule, dxfs),
        };
    }
    if (type === "aboveAverage") {
        return {
            type: "aboveAverage",
            ...(attr(rule, "aboveAverage") === "0" ? { above: false } : {}),
            ...(attr(rule, "equalAverage") === "1" ? { equal: true } : {}),
            ...dxfLook(rule, dxfs),
        };
    }
    if (type === "containsText" || type === "notContainsText" || type === "beginsWith" || type === "endsWith") {
        const op = type === "notContainsText" ? "notContains" : type === "beginsWith" ? "beginsWith" : type === "endsWith" ? "endsWith" : "contains";
        return { type: "containsText", op, text: attr(rule, "text") ?? "", ...dxfLook(rule, dxfs) };
    }
    return undefined;
}
function cellOp(name) {
    if (name === "greaterThan")
        return "gt";
    if (name === "greaterThanOrEqual")
        return "gte";
    if (name === "lessThan")
        return "lt";
    if (name === "lessThanOrEqual")
        return "lte";
    if (name === "equal")
        return "eq";
    if (name === "notEqual")
        return "neq";
    if (name === "between")
        return "between";
    return undefined;
}
function colorOf(node) {
    const rgb = attr(node, "rgb");
    if (!rgb || !/^[0-9a-fA-F]{6,8}$/.test(rgb))
        return undefined;
    return `#${rgb.slice(-6).toLowerCase()}`;
}
function validations(root) {
    const types = ["list", "whole", "decimal", "textLength", "custom"];
    return children(child(root, "dataValidations"), "dataValidation").flatMap((item, index) => {
        const range = rangeOf(attr(item, "sqref")?.split(/\s+/)[0] ?? "");
        const type = types.find((name) => name === attr(item, "type"));
        if (!range || !type)
            return [];
        const formula1 = child(item, "formula1")?.text.trim();
        const formula2 = child(item, "formula2")?.text.trim();
        const op = cellOp(attr(item, "operator") ?? "");
        return [{
                id: `dv${index + 1}`,
                ...range,
                type,
                ...(op ? { op } : {}),
                ...(formula1 ? { formula1 } : {}),
                ...(formula2 ? { formula2 } : {}),
                allowBlank: attr(item, "allowBlank") !== "0",
            }];
    });
}
function tables(root, archive, path, dxfs) {
    const rels = relTargets(archive, path);
    return children(child(root, "tableParts"), "tablePart").flatMap((part, index) => {
        const target = rels.get(attr(part, "id") ?? "");
        const xml = target ? archive.getText(target) : undefined;
        if (!xml)
            return [];
        const table = child(parseXml(xml), "table");
        const range = rangeOf(attr(table, "ref") ?? "");
        if (!table || !range)
            return [];
        const columnNodes = children(child(table, "tableColumns"), "tableColumn");
        const columns = columnNodes.map((column) => attr(column, "name") ?? "");
        const formulas = columnNodes.map((column) => child(column, "calculatedColumnFormula")?.text.trim().replace(/^=/, "") ?? "");
        const totals = columnNodes.map((column) => totalsFunction(attr(column, "totalsRowFunction")));
        const totalsFormulas = columnNodes.map((column) => child(column, "totalsRowFormula")?.text.trim().replace(/^=/, "") ?? "");
        const widths = columnNodes.map((column) => Number(attr(column, "width")));
        const hidden = columnNodes.map((column) => attr(column, "hidden") === "1");
        const formats = columnNodes.map((column) => dxfs[Number(attr(column, "dataDxfId"))]?.numFmt ?? "");
        const style = child(table, "tableStyleInfo");
        return [{
                id: attr(table, "id") ?? `table${index + 1}`,
                name: attr(table, "displayName") ?? attr(table, "name") ?? `Table${index + 1}`,
                ...range,
                headerRow: attr(table, "headerRowCount") !== "0",
                ...(attr(table, "totalsRowCount") === "1" ? { totalsRow: true } : {}),
                ...(attr(style, "name") ? { style: attr(style, "name") } : {}),
                rowStripes: attr(style, "showRowStripes") !== "0",
                ...(attr(style, "showColumnStripes") === "1" ? { colStripes: true } : {}),
                ...(attr(style, "showFirstColumn") === "1" ? { firstColumn: true } : {}),
                ...(attr(style, "showLastColumn") === "1" ? { lastColumn: true } : {}),
                filter: child(table, "autoFilter") !== undefined,
                ...tableFilterColumns(child(table, "autoFilter")),
                ...tableFilterRules(child(table, "autoFilter")),
                ...tableFilterTop(child(table, "autoFilter")),
                ...tableFilterDynamic(child(table, "autoFilter")),
                ...tableSort(child(table, "sortState"), range),
                ...(columns.length ? { columns } : {}),
                ...(formulas.some((formula) => formula) ? { formulas } : {}),
                ...(totals.some((fn) => fn !== "sum") ? { totals } : {}),
                ...(totalsFormulas.some((formula) => formula) ? { totalsFormulas } : {}),
                ...(widths.some((width) => width > 0) ? { widths } : {}),
                ...(hidden.some((flag) => flag) ? { hidden } : {}),
                ...(formats.some((format) => format) ? { formats } : {}),
            }];
    });
}
function chartList(archive, path) {
    const kinds = { barChart: "column", lineChart: "line", pieChart: "pie", areaChart: "area", scatterChart: "scatter" };
    return [...relTargets(archive, path).values()]
        .filter((target) => /\/drawings\/drawing\d+\.xml$/i.test(target))
        .flatMap((target) => [...relTargets(archive, target).values()])
        .filter((target) => /\/charts\/chart\d+\.xml$/i.test(target))
        .flatMap((target, index) => {
        const chart = child(parseXml(archive.getText(target) ?? ""), "chartSpace");
        const plot = child(child(chart, "chart"), "plotArea");
        const node = plot?.children.find((item) => item.name in kinds);
        if (!node)
            return [];
        const series = chartSeries(node);
        return [{ id: `chart${index + 1}`, kind: kinds[node.name] ?? "column", range: series[0] ?? "", ...(series.length > 1 ? { series } : {}) }];
    });
}
/** Each series keeps its own range, so two columns stay two series instead of one mixed list. */
function chartSeries(node) {
    return node.children
        .filter((item) => item.name === "ser")
        .flatMap((ser) => {
        const values = child(ser, "val") ?? child(ser, "yVal");
        const ref = values ? findNamed(values, "f") : undefined;
        const range = ref?.text.trim().replace(/^[^!]*!/, "");
        return range ? [range] : [];
    });
}
function findNamed(node, name) {
    if (node.name === name)
        return node;
    for (const item of node.children) {
        const found = findNamed(item, name);
        if (found)
            return found;
    }
    return undefined;
}
function sparklineList(root) {
    const kinds = { line: "line", column: "column", stacked: "winLoss" };
    return children(root, "extLst").flatMap((list) => children(list, "ext")).flatMap((ext) => ext.children
        .filter((item) => item.name === "sparklineGroups")
        .flatMap((groups) => children(groups, "sparklineGroup"))
        .flatMap((group, index) => {
        const spark = child(child(group, "sparklines"), "sparkline");
        const data = child(spark, "f")?.text.trim();
        const location = child(spark, "sqref")?.text.trim();
        if (!data || !location)
            return [];
        return [{ id: `spark${index + 1}`, kind: kinds[attr(group, "type") ?? "line"] ?? "line", data, location }];
    }));
}
function definedNames(archive) {
    const workbook = child(parseXml(archive.getText("xl/workbook.xml") ?? ""), "workbook");
    return children(child(workbook, "definedNames"), "definedName").flatMap((item) => {
        const name = attr(item, "name");
        if (!name || !item.text.trim())
            return [];
        const local = Number(attr(item, "localSheetId"));
        return [{ name, refersTo: item.text.trim(), ...(Number.isInteger(local) && local >= 0 ? { localSheet: local } : {}) }];
    });
}
function relTargets(archive, part) {
    const dir = part.slice(0, part.lastIndexOf("/"));
    const file = part.slice(part.lastIndexOf("/") + 1);
    const rels = parseXml(archive.getText(`${dir}/_rels/${file}.rels`) ?? "");
    const targets = new Map();
    for (const rel of children(child(rels, "Relationships"), "Relationship")) {
        const id = attr(rel, "Id");
        const target = attr(rel, "Target");
        if (!id || !target)
            continue;
        targets.set(id, target.startsWith("/") ? target.slice(1) : normalizeRel(dir, target));
    }
    return targets;
}
function normalizeRel(dir, target) {
    const parts = `${dir}/${target}`.split("/");
    const out = [];
    for (const part of parts) {
        if (part === "..")
            out.pop();
        else if (part !== ".")
            out.push(part);
    }
    return out.join("/");
}
function formControlsOf(archive, path) {
    const kinds = new Set(["button", "checkbox", "list", "spin"]);
    return [...relTargets(archive, path).values()]
        .filter((target) => /ctrlProp\d*\.xml$/i.test(target))
        .flatMap((target) => children(child(parseXml(archive.getText(target) ?? ""), "formControlPr"), "control"))
        .flatMap((item, index) => {
        const kind = attr(item, "objectType") ?? "";
        if (!kinds.has(kind))
            return [];
        return [{
                id: attr(item, "id") ?? `fc${index + 1}`,
                kind: kind,
                ...(attr(item, "name") ? { label: attr(item, "name") } : {}),
                ...(attr(item, "fmlaLink") ? { linked: attr(item, "fmlaLink") } : {}),
                ...(attr(item, "checked") === "1" ? { checked: true } : {}),
            }];
    });
}
function consolidationOf(archive, path) {
    const funcs = new Set(["sum", "count", "average", "max", "min", "product", "countNums", "stdev", "stdevp", "var", "varp"]);
    const target = [...relTargets(archive, path).values()].find((item) => /consolidation\d*\.xml$/i.test(item));
    if (!target)
        return undefined;
    const node = child(parseXml(archive.getText(target) ?? ""), "consolidation");
    const func = attr(node, "func") ?? "";
    const dest = attr(node, "dest");
    if (!funcs.has(func) || !dest)
        return undefined;
    const sources = children(node, "source").flatMap((item) => {
        const ref = attr(item, "ref");
        return ref ? [ref] : [];
    });
    return {
        func: func,
        sources,
        dest,
        ...(attr(node, "topRow") === "1" ? { topRow: true } : {}),
        ...(attr(node, "leftCol") === "1" ? { leftCol: true } : {}),
        ...(attr(node, "links") === "1" ? { links: true } : {}),
    };
}
function xmlMapsOf(archive, path) {
    return [...relTargets(archive, path).values()]
        .filter((target) => /xmlMap\d*\.xml$/i.test(target))
        .flatMap((target) => children(child(parseXml(archive.getText(target) ?? ""), "MapInfo"), "Map"))
        .map((item, index) => ({
        id: attr(item, "ID") ?? `map${index + 1}`,
        name: attr(item, "Name") ?? `Map${index + 1}`,
        ...(attr(item, "RootElement") ? { root: attr(item, "RootElement") } : {}),
    }));
}
function allowEditRangesOf(root) {
    return children(child(root, "protectedRanges"), "protectedRange").flatMap((item) => {
        const range = attr(item, "sqref");
        if (!range)
            return [];
        return [{ name: attr(item, "name") ?? "Range", range }];
    });
}
function headerFooterOf(root) {
    const node = child(root, "headerFooter");
    const header = child(node, "oddHeader")?.text.trim();
    const footer = child(node, "oddFooter")?.text.trim();
    return { ...(header ? { header } : {}), ...(footer ? { footer } : {}) };
}
function shapeList(archive, path) {
    const presets = {
        rect: "rect",
        roundRect: "rect",
        ellipse: "ellipse",
        line: "line",
        straightConnector1: "line",
        rightArrow: "arrow",
        leftArrow: "arrow",
    };
    return [...relTargets(archive, path).values()]
        .filter((target) => /\/drawings\/drawing\d+\.xml$/i.test(target))
        .flatMap((target) => {
        const drawing = child(parseXml(archive.getText(target) ?? ""), "wsDr");
        return children(drawing, "twoCellAnchor").concat(children(drawing, "oneCellAnchor"));
    })
        .flatMap((anchor, index) => {
        const body = child(anchor, "sp") ?? child(anchor, "pic");
        if (!body)
            return [];
        const preset = attr(child(child(body, "spPr"), "prstGeom"), "prst") ?? "rect";
        const textBox = attr(child(child(body, "nvSpPr"), "cNvSpPr"), "txBox") === "1";
        const from = child(anchor, "from");
        const to = child(anchor, "to");
        const ext = child(anchor, "ext");
        const across = (node, name) => Number(child(node, name)?.text ?? 0);
        const width = Number(attr(ext, "cx") ?? 0) / 9525 || Math.max(8, (across(to, "col") - across(from, "col")) * 64);
        const height = Number(attr(ext, "cy") ?? 0) / 9525 || Math.max(8, (across(to, "row") - across(from, "row")) * 20);
        const text = shapeText(child(body, "txBody"));
        return [{
                id: attr(child(child(body, "nvSpPr"), "cNvPr"), "name") ?? `shape${index + 1}`,
                kind: body.name === "pic" ? "image" : textBox ? "textBox" : presets[preset] ?? "rect",
                ...(text ? { text } : {}),
                x: across(from, "colOff") / 9525,
                y: across(from, "rowOff") / 9525,
                w: width,
                h: height,
            }];
    });
}
function shapeText(node) {
    if (!node)
        return "";
    return (node.name === "t" ? node.text : "") + node.children.map((item) => shapeText(item)).join("");
}
function pageSetup(root) {
    const setup = child(root, "pageSetup");
    const margins = child(root, "pageMargins");
    const options = child(root, "printOptions");
    if (!setup && !margins && !options)
        return undefined;
    const page = {};
    const orientation = attr(setup, "orientation");
    if (orientation === "portrait" || orientation === "landscape")
        page.orientation = orientation;
    const paper = attr(setup, "paperSize");
    if (paper === "1")
        page.paperSize = "Letter";
    else if (paper === "5")
        page.paperSize = "Legal";
    else if (paper === "9")
        page.paperSize = "A4";
    const width = Number(attr(setup, "fitToWidth"));
    const height = Number(attr(setup, "fitToHeight"));
    const scale = Number(attr(setup, "scale"));
    if (Number.isFinite(width) && attr(setup, "fitToWidth"))
        page.fitToWidth = width;
    if (Number.isFinite(height) && attr(setup, "fitToHeight"))
        page.fitToHeight = height;
    if (scale > 0)
        page.scale = scale;
    if (margins) {
        page.margins = {
            left: Number(attr(margins, "left")) || 0,
            right: Number(attr(margins, "right")) || 0,
            top: Number(attr(margins, "top")) || 0,
            bottom: Number(attr(margins, "bottom")) || 0,
        };
    }
    if (options) {
        page.gridlines = attr(options, "gridLines") === "1";
        page.headings = attr(options, "headings") === "1";
    }
    return page;
}
/** The columns a table was last sorted by. Nothing when the table has no sort. */
function tableSort(node, range) {
    const keys = children(node, "sortCondition").flatMap((condition) => {
        const column = cellRef(attr(condition, "ref")?.split(":")[0] ?? "")?.column;
        if (column == null || column < range.c1 || column > range.c2)
            return [];
        return [{ col: column - range.c1, ...(attr(condition, "descending") === "1" ? { descending: true } : {}) }];
    });
    return keys.length ? { sort: keys } : undefined;
}
/** The comparisons a table column keeps. Two on one column both have to pass when `and` is set. */
function tableFilterRules(node) {
    const ops = { equal: "eq", notEqual: "ne", greaterThan: "gt", greaterThanOrEqual: "gte", lessThan: "lt", lessThanOrEqual: "lte" };
    const rules = children(node, "filterColumn").flatMap((column) => {
        const col = Number(attr(column, "colId"));
        const custom = child(column, "customFilters");
        const and = attr(custom, "and") === "1";
        return children(custom, "customFilter").flatMap((rule) => {
            const op = ops[attr(rule, "operator") ?? "equal"];
            const value = attr(rule, "val");
            if (!Number.isInteger(col) || col < 0 || !op || value == null)
                return [];
            return [{ col, op, value, ...(and ? { and: true } : {}) }];
        });
    });
    return rules.length ? { filterRules: rules } : undefined;
}
/** The largest or smallest numbers a table column keeps. Nothing when no column ranks. */
function tableFilterTop(node) {
    const tops = children(node, "filterColumn").flatMap((column) => {
        const col = Number(attr(column, "colId"));
        const top = child(column, "top10");
        const count = Number(attr(top, "val"));
        if (!top || !Number.isInteger(col) || col < 0 || !Number.isFinite(count) || count <= 0)
            return [];
        return [{ col, count, ...(attr(top, "percent") === "1" ? { percent: true } : {}), ...(attr(top, "top") === "0" ? { bottom: true } : {}) }];
    });
    return tops.length ? { filterTop: tops } : undefined;
}
/** A column that keeps numbers above or below its average. Nothing when no column does. */
function tableFilterDynamic(node) {
    const kinds = { aboveAverage: "aboveAverage", belowAverage: "belowAverage" };
    const items = children(node, "filterColumn").flatMap((column) => {
        const col = Number(attr(column, "colId"));
        const kind = kinds[attr(child(column, "dynamicFilter"), "type") ?? ""];
        if (!Number.isInteger(col) || col < 0 || !kind)
            return [];
        return [{ col, kind }];
    });
    return items.length ? { filterDynamic: items } : undefined;
}
/** The values a table column still shows. Nothing when every column shows everything. */
function tableFilterColumns(node) {
    const columns = children(node, "filterColumn").flatMap((column) => {
        const col = Number(attr(column, "colId"));
        const values = children(child(column, "filters"), "filter").map((item) => attr(item, "val")).filter((value) => value != null);
        if (!Number.isInteger(col) || col < 0 || !values.length)
            return [];
        return [{ col, values }];
    });
    return columns.length ? { filterColumns: columns } : undefined;
}
/** A column filter lists the values that stay visible. A column without one shows everything. */
function filterOf(root) {
    const node = child(root, "autoFilter");
    const range = rangeOf(attr(node, "ref") ?? "");
    if (!range)
        return undefined;
    const columns = children(node, "filterColumn").flatMap((column) => {
        const col = Number(attr(column, "colId"));
        const values = children(child(column, "filters"), "filter").map((item) => attr(item, "val")).filter((value) => value != null);
        if (!Number.isInteger(col) || col < 0 || !values.length)
            return [];
        return [{ col, values }];
    });
    return { ...range, ...(columns.length ? { columns } : {}) };
}
function rangeOf(ref) {
    const parts = ref.split(":");
    const start = cellRef(parts[0] ?? "");
    const end = cellRef(parts[1] ?? parts[0] ?? "");
    if (!start || !end)
        return undefined;
    return { r1: start.row, c1: start.column, r2: end.row, c2: end.column };
}
function cellValue(cell, type, shared) {
    if (type === "inlineStr")
        return textOf(child(cell, "is"));
    const raw = child(cell, "v")?.text ?? "";
    if (type === "s")
        return shared[Number(raw)] ?? "";
    if (type === "b")
        return raw === "1" ? "TRUE" : "FALSE";
    return raw;
}
function sharedStrings(archive) {
    const root = child(parseXml(archive.getText("xl/sharedStrings.xml") ?? ""), "sst");
    return children(root, "si").map(textOf);
}
function textOf(node) {
    if (!node)
        return "";
    const direct = node.children.filter((item) => item.name === "t").map((item) => item.text).join("");
    if (direct)
        return direct;
    return node.children.filter((item) => item.name === "r").map((run) => child(run, "t")?.text ?? "").join("");
}
/** Marks the other cells of an array formula's ref as spilled from its anchor. */
function markSpilled(cells, anchorRow, anchorColumn, ref) {
    const [startText, endText] = ref.replace(/\$/g, "").split(":");
    const start = cellRef(startText ?? "");
    const end = cellRef(endText ?? startText ?? "");
    if (!start || !end)
        return;
    const anchor = a1(anchorRow, anchorColumn);
    for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
        for (let column = Math.min(start.column, end.column); column <= Math.max(start.column, end.column); column += 1) {
            if (row === anchorRow && column === anchorColumn)
                continue;
            const cell = cells[row]?.[column];
            if (!cell || cell.formula)
                continue;
            cell.spill = anchor;
        }
    }
}
function a1(row, column) {
    let name = "";
    let rest = column + 1;
    while (rest > 0) {
        rest -= 1;
        name = String.fromCharCode(65 + (rest % 26)) + name;
        rest = Math.floor(rest / 26);
    }
    return `${name}${row + 1}`;
}
/** The totals function a column names. Anything not listed, including the default sum, stays a sum. */
function totalsFunction(name) {
    if (name === "count" || name === "average" || name === "max" || name === "min" || name === "none")
        return name;
    return "sum";
}
/** A column's formula fills its data cells, leaving the header, the totals row, and anything already typed. */
function fillColumnFormulas(sheet) {
    for (const table of sheet.tables ?? []) {
        const formulas = table.formulas ?? [];
        const dataTop = table.headerRow === false ? table.r1 : table.r1 + 1;
        const dataBottom = table.totalsRow ? table.r2 - 1 : table.r2;
        formulas.forEach((formula, index) => {
            if (!formula)
                return;
            for (let row = dataTop; row <= dataBottom; row += 1) {
                const column = table.c1 + index;
                const line = sheet.cells[row] ?? [];
                const cell = line[column];
                if (cell?.formula)
                    continue;
                const item = cell ?? { value: "" };
                item.formula = formula;
                if (!item.value)
                    item.value = `=${formula}`;
                line[column] = item;
                sheet.cells[row] = line;
            }
        });
        // A column's number format reaches the data cells that do not name one of their own.
        (table.formats ?? []).forEach((format, index) => {
            if (!format)
                return;
            for (let row = dataTop; row <= dataBottom; row += 1) {
                const column = table.c1 + index;
                const line = sheet.cells[row] ?? [];
                const cell = line[column];
                if (cell?.numFmt)
                    continue;
                const item = cell ?? { value: "" };
                item.numFmt = format;
                line[column] = item;
                sheet.cells[row] = line;
            }
        });
        // The totals formula fills the totals cell when that cell does not already hold one.
        if (!table.totalsRow)
            continue;
        (table.totalsFormulas ?? []).forEach((formula, index) => {
            if (!formula)
                return;
            const column = table.c1 + index;
            const line = sheet.cells[table.r2] ?? [];
            const cell = line[column];
            if (cell?.formula)
                return;
            const item = cell ?? { value: "" };
            item.formula = formula;
            if (!item.value)
                item.value = `=${formula}`;
            line[column] = item;
            sheet.cells[table.r2] = line;
        });
    }
}
function cellRef(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!match)
        return undefined;
    let column = 0;
    for (const letter of match[1] ?? "")
        column = column * 26 + letter.charCodeAt(0) - 64;
    return { row: Number(match[2]) - 1, column: column - 1 };
}
function sheetNumber(path) {
    return Number(/(\d+)\.xml$/i.exec(path)?.[1] ?? 0);
}
