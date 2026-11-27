"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applySheetEdits = applySheetEdits;
exports.readSharedStrings = readSharedStrings;
exports.writeSharedStrings = writeSharedStrings;
exports.sheetPaths = sheetPaths;
exports.applyWorkbookEdits = applyWorkbookEdits;
const drawing_1 = require("./drawing");
const styles_1 = require("./styles");
/**
 * Puts edited cells back into one worksheet.
 * A formula cell is left untouched until its shown value changes. New text goes to the shared-string table.
 */
function applySheetEdits(sheetXml, sheet, shared, styles) {
    const table = cloneShared(shared);
    const data = sheetDataRange(sheetXml);
    if (!data)
        return { xml: sheetXml, shared: table };
    const rows = new Map();
    for (const rowXml of data.body.match(/<row\b[\s\S]*?<\/row>/gi) ?? []) {
        const index = Number(/\br="(\d+)"/i.exec(rowXml)?.[1]);
        if (Number.isInteger(index))
            rows.set(index, rowXml);
    }
    const cells = sheet.cells;
    const count = Math.max(cells.length, ...rows.keys());
    const written = [];
    for (let row = 1; row <= count; row += 1) {
        const existing = rows.get(row);
        const next = cells[row - 1];
        if (!next && existing) {
            written.push(existing);
            continue;
        }
        written.push(rowXml(row, existing, next ?? [], sheet, table, styles));
    }
    let xml = sheetXml.slice(0, data.start) + written.join("") + sheetXml.slice(data.end);
    const frame = (0, styles_1.sheetFrameXml)(sheet);
    xml = replaceBlock(xml, "sheetPr", frame.match(/<sheetPr\b[\s\S]*?<\/sheetPr>/i)?.[0] ?? "");
    xml = upsertBeforeSheetData(xml, "sheetViews", frame.match(/<sheetViews\b[\s\S]*?<\/sheetViews>/i)?.[0] ?? "");
    xml = upsertBeforeSheetData(xml, "cols", frame.match(/<cols\b[\s\S]*?<\/cols>/i)?.[0] ?? "");
    xml = upsertAfterSheetData(xml, "mergeCells", frame.match(/<mergeCells\b[\s\S]*?<\/mergeCells>/i)?.[0] ?? "");
    xml = upsertAfterSheetData(xml, "autoFilter", (0, styles_1.autoFilterXml)(sheet));
    xml = upsertAfterSheetData(xml, "hyperlinks", hyperlinksXml(sheet));
    xml = writeDataTables(xml, sheet);
    xml = upsertBeforeClose(xml, (0, styles_1.conditionalFormattingXml)(sheet));
    xml = replaceBlock(xml, "headerFooter", "");
    xml = replaceBlock(xml, "protectedRanges", protectedRangesXml(sheet));
    xml = replaceBlock(xml, "sheetProtection", sheet.protected ? '<sheetProtection sheet="1"/>' : "");
    xml = upsertBeforeClose(xml, (0, styles_1.pageSetupXml)(sheet));
    return { xml, shared: table };
}
function ensureWorksheetNs(xml) {
    if (/xmlns:r=/.test(xml))
        return xml;
    return xml.replace(/<worksheet\b([^>]*)>/i, '<worksheet$1 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
}
function readSharedStrings(xml) {
    const items = [];
    if (xml) {
        for (const item of xml.match(/<si\b[\s\S]*?<\/si>/gi) ?? [])
            items.push(sharedText(item));
    }
    return sharedFrom(items);
}
function writeSharedStrings(shared) {
    const items = shared.items.map((item) => `<si><t xml:space="preserve">${escapeXml(item)}</t></si>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.items.length}" uniqueCount="${shared.items.length}">${items}</sst>`;
}
/** Workbook sheet names in file order, from workbook.xml. */
function sheetPaths(workbookXml, partNames) {
    const names = [...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/gi)].map((match) => match[1] ?? "");
    const byNumber = partNames
        .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
        .sort((a, b) => sheetNumber(a) - sheetNumber(b));
    return names.length ? byNumber.slice(0, names.length) : byNumber;
}
function applyWorkbookEdits(parts, workbook, decode, encode) {
    const workbookXml = textOf(parts, "xl/workbook.xml", decode);
    if (!workbookXml)
        return;
    const paths = sheetPaths(workbookXml, [...parts.keys()]);
    while (paths.length < workbook.sheets.length)
        paths.push(`xl/worksheets/sheet${paths.length + 1}.xml`);
    let shared = readSharedStrings(textOf(parts, "xl/sharedStrings.xml", decode));
    let changed = false;
    const styles = (0, styles_1.styleBook)(textOf(parts, "xl/styles.xml", decode), workbook.sheets);
    const contentExtras = [];
    paths.forEach((path, index) => {
        const sheet = workbook.sheets[index];
        const xml = textOf(parts, path, decode);
        if (!sheet)
            return;
        if (!xml) {
            if (!workbook.sheets[0])
                return;
            const template = textOf(parts, paths[0], decode);
            if (!template)
                return;
            const fresh = applySheetEdits(emptySheet(template), sheet, shared, styles);
            shared = fresh.shared;
            parts.set(path, encode(fresh.xml));
            changed = true;
            return;
        }
        const next = applySheetEdits(xml, sheet, shared, styles);
        shared = next.shared;
        const drawing = (0, drawing_1.drawingFragments)(sheet, index);
        let sheetXml = ensureWorksheetNs(next.xml);
        if (drawing.sheetExtras)
            sheetXml = upsertBeforeClose(sheetXml, drawing.sheetExtras);
        if (sheetXml !== xml) {
            parts.set(path, encode(sheetXml));
            changed = true;
        }
        for (const [partPath, partXml] of drawing.parts) {
            parts.set(partPath, encode(partXml));
            changed = true;
        }
        contentExtras.push(...drawing.contentTypes);
        if (drawing.rels.length) {
            const relPath = path.replace(/worksheets\/(sheet\d+)\.xml$/i, "worksheets/_rels/$1.xml.rels");
            const existing = textOf(parts, relPath, decode) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
            const merged = existing.replace("</Relationships>", `${drawing.rels.join("")}</Relationships>`);
            parts.set(relPath, encode(merged));
        }
        if (drawing.workbookRels.length) {
            const relPath = "xl/_rels/workbook.xml.rels";
            const existing = textOf(parts, relPath, decode) ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
            parts.set(relPath, encode(existing.replace("</Relationships>", `${drawing.workbookRels.join("")}</Relationships>`)));
            const caches = `<pivotCaches>${drawing.pivotCacheRefs.join("")}</pivotCaches>`;
            const listed = workbookXml.includes("<pivotCaches") ? workbookXml : workbookXml.replace("</workbook>", `${caches}</workbook>`);
            if (listed !== workbookXml)
                parts.set("xl/workbook.xml", encode(listed));
        }
    });
    const names = definedNamesXml(workbook);
    const sheetsXml = workbookSheetsXml(workbook);
    if (sheetsXml && !workbookXml.includes(sheetsXml)) {
        const next = upsertBlock(workbookXml, "sheets", sheetsXml);
        if (next !== workbookXml) {
            parts.set("xl/workbook.xml", encode(next));
            changed = true;
        }
    }
    if (names) {
        const next = upsertBlock(workbookXml, "definedNames", names);
        if (next !== workbookXml) {
            parts.set("xl/workbook.xml", encode(next));
            changed = true;
        }
    }
    if (workbook.theme) {
        parts.set("xl/theme/theme1.xml", encode(themeXml(workbook.theme)));
        contentExtras.push('<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>');
        changed = true;
    }
    if (changed) {
        parts.set("xl/sharedStrings.xml", encode(writeSharedStrings(shared)));
        parts.set("xl/styles.xml", encode(styles.xml));
        const types = textOf(parts, "[Content_Types].xml", decode);
        if (types && contentExtras.length) {
            const unique = contentExtras.filter((item, index) => contentExtras.indexOf(item) === index && !types.includes(item));
            if (unique.length)
                parts.set("[Content_Types].xml", encode(types.replace("</Types>", `${unique.join("")}</Types>`)));
        }
    }
}
function workbookSheetsXml(workbook) {
    if (!workbook.sheets.length)
        return "";
    const body = workbook.sheets
        .map((sheet, index) => `<sheet name="${escapeTheme(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
        .join("");
    return `<sheets>${body}</sheets>`;
}
function emptySheet(template) {
    const open = /<sheetData\b[^>]*>/i.exec(template);
    const close = open ? template.indexOf("</sheetData>", open.index) : -1;
    if (!open || close < 0)
        return template;
    return template.slice(0, open.index + open[0].length) + template.slice(close);
}
function definedNamesXml(workbook) {
    const names = [...(workbook.names ?? [])];
    workbook.sheets.forEach((sheet, index) => {
        const area = sheet.pageSetup?.printArea;
        if (area)
            names.push({ name: "_xlnm.Print_Area", refersTo: area, localSheet: index });
        const titles = sheet.pageSetup?.printTitles;
        if (titles)
            names.push({ name: "_xlnm.Print_Titles", refersTo: titles, localSheet: index });
    });
    if (!names.length)
        return "";
    const body = names
        .map((item) => `<definedName name="${escapeTheme(item.name)}"${item.localSheet != null ? ` localSheetId="${item.localSheet}"` : ""}>${escapeTheme(item.refersTo)}</definedName>`)
        .join("");
    return `<definedNames>${body}</definedNames>`;
}
function upsertBlock(xml, tag, fragment) {
    const cleaned = xml.replace(new RegExp(`<${tag}\\b[^>]*/>|<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), "");
    const close = cleaned.lastIndexOf("</workbook>");
    if (close < 0)
        return cleaned + fragment;
    return cleaned.slice(0, close) + fragment + cleaned.slice(close);
}
function themeXml(theme) {
    const colors = theme.colors ?? ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
    const major = theme.fonts?.major ?? "Calibri Light";
    const minor = theme.fonts?.minor ?? "Calibri";
    const scheme = colors.map((color, index) => `<a:srgbClr val="${color.replace("#", "").toUpperCase()}"/><!-- accent${index + 1} -->`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${escapeTheme(theme.name ?? "Office Theme")}"><a:themeElements><a:clrScheme name="Office">${scheme}</a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="${escapeTheme(major)}"/></a:majorFont><a:minorFont><a:latin typeface="${escapeTheme(minor)}"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"/></a:themeElements></a:theme>`;
}
function escapeTheme(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function block(xml, name) {
    const open = new RegExp(`<${name}\\b[^>]*>`, "i").exec(xml);
    const close = open ? xml.indexOf(`</${name}>`, open.index) : -1;
    if (!open || close < 0)
        return "";
    return xml.slice(open.index + open[0].length, close);
}
function textOf(parts, path, decode) {
    const bytes = parts.get(path);
    return bytes ? decode(bytes) : undefined;
}
function sheetDataRange(xml) {
    const open = /<sheetData\b[^>]*>/i.exec(xml);
    const close = open ? xml.indexOf("</sheetData>", open.index) : -1;
    if (!open || close < 0)
        return undefined;
    const start = open.index + open[0].length;
    return { start, body: xml.slice(start, close), end: close };
}
function rowXml(row, existing, cells, sheet, shared, styles) {
    const grouped = sheet.outline?.rows?.includes(row - 1) ? ' outlineLevel="1"' : "";
    const kept = new Map();
    for (const cellXml of existing?.match(/<c\b[\s\S]*?<\/c>/gi) ?? []) {
        const column = columnIndex(/\br="([A-Z]+)\d+"/i.exec(cellXml)?.[1] ?? "");
        if (column >= 0)
            kept.set(column, cellXml);
    }
    const count = Math.max(cells.length, ...kept.keys(), -1);
    const written = [];
    for (let column = 0; column <= count; column += 1) {
        const cell = cells[column];
        const prior = kept.get(column);
        if (!cell) {
            if (prior)
                written.push(prior);
            continue;
        }
        written.push(cellXml(columnName(column) + row, cell, prior, shared, styles));
    }
    const height = sheet.rowHeights?.[row - 1];
    const sized = height != null ? ` ht="${height}" customHeight="1"` : "";
    const hidden = sheet.hiddenRows?.includes(row - 1) ? ' hidden="1"' : "";
    return `<row r="${row}"${grouped}${sized}${hidden}>${written.join("")}</row>`;
}
function cellXml(ref, cell, prior, shared, styles) {
    if (prior && isFormula(prior) && !cell.formula && (shownValue(prior) === cell.value || formulaText(prior) === cell.value || `=${formulaText(prior)}` === cell.value)) {
        return prior;
    }
    if (cell.value === "" && !cell.formula && !prior)
        return "";
    const style = styles.indexFor(cell) ?? (prior ? /\bs="(\d+)"/i.exec(prior)?.[1] : undefined);
    const styleAttr = style ? ` s="${style}"` : "";
    if (cell.formula) {
        const body = escapeXml(cell.formula.replace(/^\=/, ""));
        const array = cell.spillRef ? ` t="array" ref="${escapeXml(cell.spillRef)}"` : cell.array ? ' t="array"' : "";
        const cached = cell.value && cell.value !== `=${cell.formula}` && cell.value.toUpperCase() !== cell.formula.toUpperCase() ? cell.value : "";
        if (cached === "TRUE" || cached === "FALSE") {
            return `<c r="${ref}"${styleAttr} t="b"><f${array}>${body}</f><v>${cached === "TRUE" ? "1" : "0"}</v></c>`;
        }
        if (cached && isNumber(cached))
            return `<c r="${ref}"${styleAttr}><f${array}>${body}</f><v>${cached}</v></c>`;
        if (cached)
            return `<c r="${ref}"${styleAttr} t="str"><f${array}>${body}</f><v>${escapeXml(cached)}</v></c>`;
        return `<c r="${ref}"${styleAttr}><f${array}>${body}</f></c>`;
    }
    if (cell.value === "")
        return `<c r="${ref}"${styleAttr}/>`;
    if (isNumber(cell.value))
        return `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>`;
    if (cell.value === "TRUE" || cell.value === "FALSE") {
        return `<c r="${ref}"${styleAttr} t="b"><v>${cell.value === "TRUE" ? "1" : "0"}</v></c>`;
    }
    return `<c r="${ref}"${styleAttr} t="s"><v>${shared.indexOf(cell.value)}</v></c>`;
}
/** Marks the first cell of each what-if data table so the result block reads back. */
function writeDataTables(xml, sheet) {
    let out = xml;
    for (const table of sheet.dataTables ?? []) {
        const range = rangeOf(table.ref);
        if (!range)
            continue;
        const ref = `${columnName(range.c1)}${range.r1 + 1}`;
        const attrs = [`t="dataTable"`, `ref="${escapeXml(table.ref)}"`];
        if (table.rowInput && table.colInput)
            attrs.push("dt2D=\"1\"", "dtr=\"1\"", `r1="${escapeXml(table.rowInput)}"`, `r2="${escapeXml(table.colInput)}"`);
        else if (table.rowInput)
            attrs.push("dtr=\"1\"", `r1="${escapeXml(table.rowInput)}"`);
        else if (table.colInput)
            attrs.push(`r1="${escapeXml(table.colInput)}"`);
        const formula = `<f ${attrs.join(" ")}></f>`;
        const marker = `r="${ref}"`;
        const at = out.indexOf(marker);
        if (at < 0)
            continue;
        const open = out.lastIndexOf("<c", at);
        const close = out.indexOf("</c>", at);
        if (open < 0 || close < 0)
            continue;
        const cell = out.slice(open, close + 4);
        const formulaAt = cell.indexOf("<f");
        const formulaEnd = cell.indexOf("</f>");
        const next = formulaAt >= 0 && formulaEnd > formulaAt ? cell.slice(0, formulaAt) + formula + cell.slice(formulaEnd + 4) : cell.replace(">", `>${formula}`);
        out = out.slice(0, open) + next + out.slice(close + 4);
    }
    return out;
}
function rangeOf(ref) {
    const parts = ref.split(":");
    const start = a1(parts[0] ?? "");
    const end = a1(parts[1] ?? parts[0] ?? "");
    if (!start || !end)
        return undefined;
    return { r1: Math.min(start.row, end.row), c1: Math.min(start.col, end.col), r2: Math.max(start.row, end.row), c2: Math.max(start.col, end.col) };
}
function a1(ref) {
    const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim());
    if (!match)
        return undefined;
    let col = 0;
    for (const letter of (match[1] ?? "").toUpperCase())
        col = col * 26 + letter.charCodeAt(0) - 64;
    return { row: Number(match[2]) - 1, col: col - 1 };
}
function protectedRangesXml(sheet) {
    const ranges = sheet.allowEditRanges ?? [];
    if (!ranges.length)
        return "";
    const body = ranges
        .map((item, index) => `<protectedRange name="${escapeXml(item.name)}" sqref="${escapeXml(item.range)}" sheetId="${index + 1}"/>`)
        .join("");
    return `<protectedRanges>${body}</protectedRanges>`;
}
function hyperlinksXml(sheet) {
    const links = [];
    sheet.cells.forEach((row, rowIndex) => {
        row?.forEach((cell, column) => {
            if (!cell?.hyperlink)
                return;
            links.push(`<hyperlink ref="${columnName(column)}${rowIndex + 1}" location="${escapeXml(cell.hyperlink)}"/>`);
        });
    });
    return links.length ? `<hyperlinks>${links.join("")}</hyperlinks>` : "";
}
function isFormula(cellXml) {
    return /<f\b/i.test(cellXml);
}
function formulaText(cellXml) {
    return /<f\b[^>]*>([\s\S]*?)<\/f>/i.exec(cellXml)?.[1] ?? "";
}
function shownValue(cellXml) {
    const type = /\bt="([^"]*)"/i.exec(cellXml)?.[1] ?? "";
    const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(cellXml)?.[1] ?? "";
    if (type === "b")
        return raw === "1" ? "TRUE" : "FALSE";
    return raw;
}
function isNumber(value) {
    return /^-?\d+(?:\.\d+)?$/.test(value);
}
function sharedText(item) {
    const runs = [...item.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((match) => unescapeXml(match[1] ?? ""));
    return runs.join("");
}
function sharedFrom(items) {
    const lookup = new Map(items.map((item, index) => [item, index]));
    return {
        items,
        indexOf(value) {
            const found = lookup.get(value);
            if (found !== undefined)
                return found;
            items.push(value);
            lookup.set(value, items.length - 1);
            return items.length - 1;
        },
    };
}
function cloneShared(shared) {
    return sharedFrom([...shared.items]);
}
function columnIndex(letters) {
    if (!/^[A-Z]+$/.test(letters))
        return -1;
    let index = 0;
    for (const letter of letters)
        index = index * 26 + letter.charCodeAt(0) - 64;
    return index - 1;
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
function sheetNumber(path) {
    return Number(/(\d+)\.xml$/i.exec(path)?.[1] ?? 0);
}
function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function unescapeXml(value) {
    return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function upsertBeforeSheetData(xml, tag, fragment) {
    const cleaned = xml.replace(new RegExp(`<${tag}\\b[^>]*/>|<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), "");
    if (!fragment)
        return cleaned;
    const open = /<sheetData\b/i.exec(cleaned);
    if (!open)
        return fragment + cleaned;
    return cleaned.slice(0, open.index) + fragment + cleaned.slice(open.index);
}
function upsertAfterSheetData(xml, tag, fragment) {
    const cleaned = xml.replace(new RegExp(`<${tag}\\b[^>]*/>|<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), "");
    if (!fragment)
        return cleaned;
    const close = cleaned.indexOf("</sheetData>");
    if (close < 0)
        return cleaned + fragment;
    const at = close + "</sheetData>".length;
    return cleaned.slice(0, at) + fragment + cleaned.slice(at);
}
function replaceBlock(xml, tag, fragment) {
    const cleaned = xml.replace(new RegExp(`<${tag}\\b[^>]*/>|<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"), "");
    return fragment ? upsertBeforeClose(cleaned, fragment) : cleaned;
}
function upsertBeforeClose(xml, fragment) {
    if (!fragment)
        return xml;
    const close = xml.lastIndexOf("</worksheet>");
    if (close < 0)
        return xml + fragment;
    return xml.slice(0, close) + fragment + xml.slice(close);
}
