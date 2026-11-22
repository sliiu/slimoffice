import { hasLook, readCellStyles } from "./styles.js";
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
    return {
        sheets: sheetsFrom(archive, shared, styles, styleBook.names),
        ...(names.length ? { names } : {}),
        ...(theme.present ? { theme: { ...(theme.name ? { name: theme.name } : {}), colors: (theme.colors ?? []).filter((color) => color !== ""), fonts: theme.fonts } } : {}),
        source: archive.files,
    };
}
function isOle(bytes) {
    return bytes.length >= OLE_MAGIC.length && OLE_MAGIC.every((byte, index) => bytes[index] === byte);
}
function sheetsFrom(archive, shared, styles, styleNames) {
    const workbook = child(parseXml(archive.getText("xl/workbook.xml") ?? ""), "workbook");
    const named = children(child(workbook, "sheets"), "sheet").map((sheet) => attr(sheet, "name") ?? "");
    const paths = [...archive.files.keys()]
        .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
        .sort((a, b) => sheetNumber(a) - sheetNumber(b));
    return paths.map((path, index) => sheetFrom(archive, path, named[index] || `Sheet${index + 1}`, shared, styles, styleNames));
}
function sheetFrom(archive, path, name, shared, styles, styleNames) {
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
    const sheet = { name, cells, ...sheetShape(root, archive, path) };
    if (dataTables.length)
        sheet.dataTables = dataTables;
    return sheet;
}
function sheetShape(root, archive, path) {
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
    const filter = rangeOf(attr(child(root, "autoFilter"), "ref") ?? "");
    if (filter)
        shape.filter = { r1: filter.r1, c1: filter.c1, r2: filter.r2, c2: filter.c2 };
    const page = pageSetup(root);
    if (page)
        shape.pageSetup = page;
    const formats = conditionalFormats(root);
    if (formats.length)
        shape.conditionalFormats = formats;
    const checks = validations(root);
    if (checks.length)
        shape.validations = checks;
    const lists = tables(root, archive, path);
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
        caches.set(name, { source: attr(def, "sourceName") ?? "", field: attr(child(def, "data"), "name") ?? "" });
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
        const picked = (tag) => children(child(table, tag), "field").flatMap((field) => {
            const name = names[Number(attr(field, "x"))];
            return name ? [name] : [];
        });
        return [{
                id: attr(table, "name") ?? `pivot${index + 1}`,
                name: attr(table, "name") ?? `Pivot${index + 1}`,
                source: cache.source,
                rows: picked("rowFields"),
                columns: picked("colFields"),
                values: picked("dataFields"),
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
function conditionalFormats(root) {
    const out = [];
    for (const block of children(root, "conditionalFormatting")) {
        const range = rangeOf(attr(block, "sqref")?.split(/\s+/)[0] ?? "");
        if (!range)
            continue;
        children(block, "cfRule").forEach((rule, index) => {
            const parsed = cfRule(rule);
            if (parsed)
                out.push({ id: `cf${out.length + index + 1}`, ...range, rule: parsed });
        });
    }
    return out;
}
function cfRule(rule) {
    const type = attr(rule, "type");
    const formulas = children(rule, "formula").map((item) => item.text.trim());
    if (type === "cellIs") {
        const op = cellOp(attr(rule, "operator") ?? "");
        if (!op || !formulas[0])
            return undefined;
        return { type: "cellValue", op, formula1: formulas[0], ...(formulas[1] ? { formula2: formulas[1] } : {}) };
    }
    if (type === "expression" && formulas[0])
        return { type: "expression", formula: formulas[0] };
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
        return [{
                id: `dv${index + 1}`,
                ...range,
                type,
                ...(formula1 ? { formula1 } : {}),
                ...(formula2 ? { formula2 } : {}),
                allowBlank: attr(item, "allowBlank") !== "0",
            }];
    });
}
function tables(root, archive, path) {
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
        return [{
                id: attr(table, "id") ?? `table${index + 1}`,
                name: attr(table, "displayName") ?? attr(table, "name") ?? `Table${index + 1}`,
                ...range,
                headerRow: attr(table, "headerRowCount") !== "0",
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
        const range = chartRange(node) ?? "";
        return [{ id: `chart${index + 1}`, kind: kinds[node.name] ?? "column", range }];
    });
}
function chartRange(node) {
    const ref = findNamed(node, "f");
    return ref?.text.trim().replace(/^[^!]*!/, "");
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
