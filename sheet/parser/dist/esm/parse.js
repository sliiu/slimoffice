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
/** Reads a .xlsx into sheets of shown values. Formulas are kept as text and not evaluated. */
export async function parseXlsx(input) {
    const bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : new Uint8Array(input);
    assertOpenXml(bytes);
    const archive = loadArchive(bytes);
    const shared = sharedStrings(archive);
    const bold = boldStyles(archive);
    return { sheets: sheetsFrom(archive, shared, bold), source: archive.files };
}
function sheetsFrom(archive, shared, bold) {
    const workbook = child(parseXml(archive.getText("xl/workbook.xml") ?? ""), "workbook");
    const named = children(child(workbook, "sheets"), "sheet").map((sheet) => attr(sheet, "name") ?? "");
    const paths = [...archive.files.keys()]
        .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
        .sort((a, b) => sheetNumber(a) - sheetNumber(b));
    return paths.map((path, index) => sheetFrom(archive, path, named[index] || `Sheet${index + 1}`, shared, bold));
}
function sheetFrom(archive, path, name, shared, bold) {
    const root = child(parseXml(archive.getText(path) ?? ""), "worksheet");
    const cells = [];
    for (const row of children(child(root, "sheetData"), "row")) {
        for (const cell of children(row, "c")) {
            const ref = attr(cell, "r") ?? "";
            const where = cellRef(ref);
            if (!where)
                continue;
            const value = cellValue(cell, attr(cell, "t") ?? "", shared);
            if (!value)
                continue;
            const style = Number(attr(cell, "s"));
            const item = { value };
            if (Number.isInteger(style) && bold.has(style))
                item.bold = true;
            const line = cells[where.row] ?? [];
            line[where.column] = item;
            cells[where.row] = line;
        }
    }
    return { name, cells };
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
function boldStyles(archive) {
    const root = child(parseXml(archive.getText("xl/styles.xml") ?? ""), "styleSheet");
    const fonts = children(child(root, "fonts"), "font").map((font) => font.children.some((item) => item.name === "b"));
    const bold = new Set();
    children(child(root, "cellXfs"), "xf").forEach((item, index) => {
        const font = Number(attr(item, "fontId"));
        if (Number.isInteger(font) && fonts[font])
            bold.add(index);
    });
    return bold;
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
function assertOpenXml(bytes) {
    if (bytes.length < OLE_MAGIC.length)
        return;
    if (!OLE_MAGIC.every((byte, index) => bytes[index] === byte))
        return;
    const text = new TextDecoder("utf-16le").decode(bytes);
    throw new XlsxOpenError(text.includes("EncryptedPackage") ? "ENCRYPTED_XLSX" : "LEGACY_XLS");
}
