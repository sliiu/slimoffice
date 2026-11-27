"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.styleBook = styleBook;
exports.sheetFrameXml = sheetFrameXml;
exports.autoFilterXml = autoFilterXml;
exports.pageSetupXml = pageSetupXml;
exports.conditionalFormattingXml = conditionalFormattingXml;
/** Build or extend styles.xml so edited fonts/fills/numFmts round-trip. */
function styleBook(stylesXml, sheets) {
    const fonts = collect(stylesXml, "fonts", /<font\b[^>]*\/>|<font\b[\s\S]*?<\/font>/gi, [
        '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>',
    ]);
    const fills = collect(stylesXml, "fills", /<fill\b[^>]*\/>|<fill\b[\s\S]*?<\/fill>/gi, [
        '<fill><patternFill patternType="none"/></fill>',
        '<fill><patternFill patternType="gray125"/></fill>',
    ]);
    const borders = collect(stylesXml, "borders", /<border\b[^>]*\/>|<border\b[\s\S]*?<\/border>/gi, ["<border/>"]);
    const numFmts = [...(stylesXml?.match(/<numFmt\b[^>]*\/>/gi) ?? [])];
    const cellXfs = collect(stylesXml, "cellXfs", /<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/gi, [
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    ]);
    const dxfs = [...(block(stylesXml ?? "", "dxfs").match(/<dxf\b[\s\S]*?<\/dxf>/gi) ?? [])];
    const lookup = new Map();
    function ensureFont(cell) {
        const xml = fontXml(cell);
        const found = fonts.indexOf(xml);
        if (found >= 0)
            return found;
        fonts.push(xml);
        return fonts.length - 1;
    }
    function ensureFill(cell) {
        if (!cell.fill)
            return 0;
        const xml = `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(cell.fill)}"/></patternFill></fill>`;
        const found = fills.indexOf(xml);
        if (found >= 0)
            return found;
        fills.push(xml);
        return fills.length - 1;
    }
    function ensureBorder(cell) {
        if (!cell.border)
            return 0;
        const edgeXml = (name, edge) => {
            if (!edge)
                return `<${name}/>`;
            return `<${name} style="${edge.style ?? "thin"}"><color rgb="${rgb(edge.color ?? "#000000")}"/></${name}>`;
        };
        const xml = `<border>${edgeXml("left", cell.border.left)}${edgeXml("right", cell.border.right)}${edgeXml("top", cell.border.top)}${edgeXml("bottom", cell.border.bottom)}</border>`;
        const found = borders.indexOf(xml);
        if (found >= 0)
            return found;
        borders.push(xml);
        return borders.length - 1;
    }
    function numFmtId(code) {
        const existing = numFmts.findIndex((item) => item.includes(`formatCode="${escapeXml(code)}"`));
        if (existing >= 0)
            return Number(/numFmtId="(\d+)"/i.exec(numFmts[existing])?.[1] ?? 164 + existing);
        const id = 164 + numFmts.length;
        numFmts.push(`<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`);
        return id;
    }
    function ensureNumFmt(cell) {
        if (!cell.numFmt)
            return 0;
        return numFmtId(cell.numFmt);
    }
    /** A differential style holding just a number format, so a table column can point at it. */
    function dxfForFormat(format) {
        const id = numFmtId(format);
        const xml = `<dxf><numFmt numFmtId="${id}" formatCode="${escapeXml(format)}"/></dxf>`;
        const found = dxfs.indexOf(xml);
        if (found >= 0)
            return found;
        dxfs.push(xml);
        return dxfs.length - 1;
    }
    function indexFor(cell) {
        if (!hasStyle(cell))
            return undefined;
        const key = styleKey(cell);
        const cached = lookup.get(key);
        if (cached != null)
            return String(cached);
        const fontId = ensureFont(cell);
        const fillId = ensureFill(cell);
        const borderId = ensureBorder(cell);
        const numFmtId = ensureNumFmt(cell);
        const apply = [
            cell.bold || cell.italic || cell.underline || cell.strike || cell.font || cell.fontSize || cell.color ? ' applyFont="1"' : "",
            cell.fill ? ' applyFill="1"' : "",
            cell.border ? ' applyBorder="1"' : "",
            cell.numFmt ? ' applyNumberFormat="1"' : "",
            cell.align || cell.valign || cell.wrap || cell.indent ? ' applyAlignment="1"' : "",
        ].join("");
        const align = cell.align || cell.valign || cell.wrap || cell.indent
            ? `<alignment${cell.align ? ` horizontal="${cell.align}"` : ""}${cell.valign ? ` vertical="${cell.valign === "middle" ? "center" : cell.valign}"` : ""}${cell.wrap ? ' wrapText="1"' : ""}${cell.indent ? ` indent="${cell.indent}"` : ""}/>`
            : "";
        const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${apply}>${align}</xf>`;
        cellXfs.push(xf);
        const index = cellXfs.length - 1;
        lookup.set(key, index);
        return String(index);
    }
    for (const sheet of sheets) {
        for (const row of sheet.cells) {
            for (const cell of row ?? [])
                if (cell)
                    indexFor(cell);
        }
        for (const cf of sheet.conditionalFormats ?? [])
            ensureDxf(cf, dxfs);
    }
    // A table column's number format lives in a differential style the column points at.
    for (const sheet of sheets) {
        for (const table of sheet.tables ?? []) {
            for (const format of table.formats ?? [])
                if (format)
                    dxfForFormat(format);
        }
    }
    const numFmtBlock = numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join("")}</numFmts>` : "";
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmtBlock}<fonts count="${fonts.length}">${fonts.join("")}</fonts><fills count="${fills.length}">${fills.join("")}</fills><borders count="${borders.length}">${borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${cellXfs.length}">${cellXfs.join("")}</cellXfs><dxfs count="${dxfs.length}">${dxfs.join("")}</dxfs></styleSheet>`;
    return { xml, indexFor, dxfForFormat };
}
function sheetFrameXml(sheet) {
    const cols = colXml(sheet);
    const merges = mergeXml(sheet);
    const view = sheetViewXml(sheet);
    const outline = sheet.outline ? `<sheetPr><outlinePr summaryBelow="${sheet.outline.summaryBelow === false ? 0 : 1}"/></sheetPr>` : "";
    return `${outline}${view}${cols}${merges}`;
}
function colXml(sheet) {
    const widths = sheet.colWidths ?? [];
    const hidden = new Set(sheet.hiddenCols ?? []);
    const grouped = new Set(sheet.outline?.cols ?? []);
    const indexes = new Set([...widths.keys(), ...hidden, ...grouped]);
    const cols = [...indexes]
        .filter((column) => widths[column] != null || hidden.has(column) || grouped.has(column))
        .sort((a, b) => a - b)
        .map((column) => {
        const width = widths[column];
        const sized = width != null ? ` width="${width}" customWidth="1"` : "";
        const gone = hidden.has(column) ? ' hidden="1"' : "";
        const level = grouped.has(column) ? ' outlineLevel="1"' : "";
        return `<col min="${column + 1}" max="${column + 1}"${sized}${gone}${level}/>`;
    });
    return cols.length ? `<cols>${cols.join("")}</cols>` : "";
}
function mergeXml(sheet) {
    const merges = sheet.merges ?? [];
    if (!merges.length)
        return "";
    const cells = merges.map((merge) => `<mergeCell ref="${colName(merge.c1)}${merge.r1 + 1}:${colName(merge.c2)}${merge.r2 + 1}"/>`);
    return `<mergeCells count="${cells.length}">${cells.join("")}</mergeCells>`;
}
function sheetViewXml(sheet) {
    if (!sheet.freeze)
        return "";
    const row = sheet.freeze.row > 0 ? ` ySplit="${sheet.freeze.row}"` : "";
    const col = sheet.freeze.col > 0 ? ` xSplit="${sheet.freeze.col}"` : "";
    const state = row || col ? ' state="frozen"' : "";
    const topLeft = `${colName(sheet.freeze.col)}${sheet.freeze.row + 1}`;
    return `<sheetViews><sheetView workbookViewId="0"><pane${col}${row}${state} topLeftCell="${topLeft}"/></sheetView></sheetViews>`;
}
function autoFilterXml(sheet) {
    if (!sheet.filter)
        return "";
    const { r1, c1, r2, c2 } = sheet.filter;
    const columns = (sheet.filter.columns ?? [])
        .map((column) => `<filterColumn colId="${column.col}"><filters>${column.values.map((value) => `<filter val="${escapeXml(value)}"/>`).join("")}</filters></filterColumn>`)
        .join("");
    return `<autoFilter ref="${colName(c1)}${r1 + 1}:${colName(c2)}${r2 + 1}">${columns}</autoFilter>`;
}
function pageSetupXml(sheet) {
    const setup = sheet.pageSetup;
    if (!setup)
        return "";
    const parts = [
        setup.orientation ? ` orientation="${setup.orientation}"` : "",
        setup.paperSize === "Letter" ? ' paperSize="1"' : setup.paperSize === "Legal" ? ' paperSize="5"' : setup.paperSize === "A4" ? ' paperSize="9"' : "",
        setup.fitToWidth != null ? ` fitToWidth="${setup.fitToWidth}"` : "",
        setup.fitToHeight != null ? ` fitToHeight="${setup.fitToHeight}"` : "",
        setup.scale != null ? ` scale="${setup.scale}"` : "",
    ].join("");
    const margins = setup.margins
        ? `<pageMargins left="${setup.margins.left}" right="${setup.margins.right}" top="${setup.margins.top}" bottom="${setup.margins.bottom}" header="0.3" footer="0.3"/>`
        : "";
    const print = `<printOptions headings="${setup.headings ? 1 : 0}" gridLines="${setup.gridlines ? 1 : 0}"/>`;
    const heads = setup.header || setup.footer
        ? `<headerFooter>${setup.header ? `<oddHeader>${escapeXml(setup.header)}</oddHeader>` : ""}${setup.footer ? `<oddFooter>${escapeXml(setup.footer)}</oddFooter>` : ""}</headerFooter>`
        : "";
    return `${margins}<pageSetup${parts}/>${print}${heads}`;
}
function conditionalFormattingXml(sheet) {
    return (sheet.conditionalFormats ?? [])
        .map((cf, index) => {
        const sqref = `${colName(cf.c1)}${cf.r1 + 1}:${colName(cf.c2)}${cf.r2 + 1}`;
        return `<conditionalFormatting sqref="${sqref}">${ruleXml(cf, index)}</conditionalFormatting>`;
    })
        .join("");
}
function ruleXml(cf, index) {
    const rule = cf.rule;
    if (rule.type === "cellValue") {
        const op = rule.op === "gt" ? "greaterThan" :
            rule.op === "gte" ? "greaterThanOrEqual" :
                rule.op === "lt" ? "lessThan" :
                    rule.op === "lte" ? "lessThanOrEqual" :
                        rule.op === "eq" ? "equal" :
                            rule.op === "neq" ? "notEqual" :
                                "between";
        return `<cfRule type="cellIs" operator="${op}" dxfId="${index}" priority="${index + 1}"><formula>${escapeXml(rule.formula1)}</formula>${rule.formula2 ? `<formula>${escapeXml(rule.formula2)}</formula>` : ""}</cfRule>`;
    }
    if (rule.type === "expression") {
        return `<cfRule type="expression" dxfId="${index}" priority="${index + 1}"><formula>${escapeXml(rule.formula.replace(/^=/, ""))}</formula></cfRule>`;
    }
    if (rule.type === "colorScale") {
        const colors = rule.colors.map((color) => `<color rgb="${rgb(color)}"/>`).join("");
        const cfvos = rule.colors
            .map((_, i) => `<cfvo type="${i === 0 ? "min" : i === rule.colors.length - 1 ? "max" : "percentile"}"${i === 1 && rule.colors.length === 3 ? ' val="50"' : ""}/>`)
            .join("");
        return `<cfRule type="colorScale" priority="${index + 1}"><colorScale>${cfvos}${colors}</colorScale></cfRule>`;
    }
    if (rule.type === "dataBar") {
        return `<cfRule type="dataBar" priority="${index + 1}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${rgb(rule.color)}"/></dataBar></cfRule>`;
    }
    if (rule.type === "duplicate" || rule.type === "unique") {
        return `<cfRule type="${rule.type === "duplicate" ? "duplicateValues" : "uniqueValues"}" dxfId="${index}" priority="${index + 1}"/>`;
    }
    if (rule.type === "top10") {
        return `<cfRule type="top10" dxfId="${index}" priority="${index + 1}" rank="${rule.rank}"${rule.percent ? " percent=\"1\"" : ""}${rule.bottom ? " bottom=\"1\"" : ""}/>`;
    }
    if (rule.type === "aboveAverage") {
        return `<cfRule type="aboveAverage" dxfId="${index}" priority="${index + 1}"${rule.above === false ? " aboveAverage=\"0\"" : ""}${rule.equal ? " equalAverage=\"1\"" : ""}/>`;
    }
    if (rule.type === "containsText") {
        const kind = rule.op === "notContains" ? "notContainsText" : rule.op === "beginsWith" ? "beginsWith" : rule.op === "endsWith" ? "endsWith" : "containsText";
        return `<cfRule type="${kind}" dxfId="${index}" priority="${index + 1}" operator="${kind}" text="${escapeXml(rule.text)}"/>`;
    }
    if (rule.type === "iconSet") {
        const set = rule.set === "3Arrows" ? "3Arrows" : rule.set === "3Symbols" ? "3Symbols" : "3TrafficLights1";
        return `<cfRule type="iconSet" priority="${index + 1}"><iconSet iconSet="${set}"/></cfRule>`;
    }
    return "";
}
function ensureDxf(cf, dxfs) {
    const rule = cf.rule;
    if (rule.type !== "cellValue" && rule.type !== "expression" && rule.type !== "duplicate" && rule.type !== "unique" && rule.type !== "top10" && rule.type !== "aboveAverage" && rule.type !== "containsText")
        return;
    const fill = rule.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(rule.fill)}"/></patternFill></fill>` : "";
    const font = rule.color ? `<font><color rgb="${rgb(rule.color)}"/></font>` : "";
    dxfs.push(`<dxf>${font}${fill}</dxf>`);
}
function hasStyle(cell) {
    return Boolean(cell.bold ||
        cell.italic ||
        cell.underline ||
        cell.strike ||
        cell.font ||
        cell.fontSize ||
        cell.color ||
        cell.fill ||
        cell.border ||
        cell.numFmt ||
        cell.align ||
        cell.valign ||
        cell.wrap ||
        cell.indent);
}
function styleKey(cell) {
    return [
        cell.bold,
        cell.italic,
        cell.underline,
        cell.strike,
        cell.font,
        cell.fontSize,
        cell.color,
        cell.fill,
        cell.border?.top?.style,
        cell.border?.top?.color,
        cell.border?.right?.style,
        cell.border?.right?.color,
        cell.border?.bottom?.style,
        cell.border?.bottom?.color,
        cell.border?.left?.style,
        cell.border?.left?.color,
        cell.numFmt,
        cell.align,
        cell.valign,
        cell.wrap,
        cell.indent,
    ].join("|");
}
function fontXml(cell) {
    return `<font>${cell.bold ? "<b/>" : ""}${cell.italic ? "<i/>" : ""}${cell.underline ? "<u/>" : ""}${cell.strike ? "<strike/>" : ""}${cell.fontSize ? `<sz val="${cell.fontSize}"/>` : ""}${cell.color ? `<color rgb="${rgb(cell.color)}"/>` : ""}${cell.font ? `<name val="${escapeXml(cell.font)}"/>` : '<name val="Calibri"/>'}</font>`;
}
function collect(xml, name, pattern, fallback) {
    const body = block(xml ?? "", name);
    const found = body.match(pattern);
    return found?.length ? [...found] : [...fallback];
}
function block(xml, name) {
    const open = new RegExp(`<${name}\b[^>]*>`, "i").exec(xml);
    const close = open ? xml.indexOf(`</${name}>`, open.index) : -1;
    if (!open || close < 0)
        return "";
    return xml.slice(open.index + open[0].length, close);
}
function rgb(color) {
    const raw = color.replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    return `FF${full.toUpperCase().padStart(6, "0").slice(0, 6)}`;
}
function colName(index) {
    let name = "";
    let next = index + 1;
    while (next > 0) {
        next -= 1;
        name = String.fromCharCode(65 + (next % 26)) + name;
        next = Math.floor(next / 26);
    }
    return name;
}
function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
