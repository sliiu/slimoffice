"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.XlsxOpenError = void 0;
exports.parseXlsx = parseXlsx;
const zip_1 = require("./zip");
const xml_1 = require("./xml");
class XlsxOpenError extends Error {
    code;
    constructor(code) {
        super(code);
        this.name = "XlsxOpenError";
        this.code = code;
    }
}
exports.XlsxOpenError = XlsxOpenError;
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** Reads a .xlsx into sheets. Formula cells keep `formula` and show the cached value until recalculate. */
async function parseXlsx(input, options = {}) {
    let bytes = input instanceof Blob ? new Uint8Array(await input.arrayBuffer()) : new Uint8Array(input);
    if (isOle(bytes)) {
        const text = new TextDecoder("utf-16le").decode(bytes);
        if (!text.includes("EncryptedPackage"))
            throw new XlsxOpenError("LEGACY_XLS");
        if (!options.password)
            throw new XlsxOpenError("ENCRYPTED_XLSX");
        try {
            const { decryptAgile } = await Promise.resolve().then(() => __importStar(require("./crypto")));
            bytes = new Uint8Array(await decryptAgile(bytes, options.password));
        }
        catch (err) {
            if (err && typeof err === "object" && "code" in err && err.code === "WRONG_PASSWORD") {
                throw new XlsxOpenError("WRONG_PASSWORD");
            }
            throw new XlsxOpenError("ENCRYPTED_XLSX");
        }
    }
    const archive = (0, zip_1.loadArchive)(bytes);
    const shared = sharedStrings(archive);
    const bold = boldStyles(archive);
    return { sheets: sheetsFrom(archive, shared, bold), source: archive.files };
}
function isOle(bytes) {
    return bytes.length >= OLE_MAGIC.length && OLE_MAGIC.every((byte, index) => bytes[index] === byte);
}
function sheetsFrom(archive, shared, bold) {
    const workbook = (0, xml_1.child)((0, xml_1.parseXml)(archive.getText("xl/workbook.xml") ?? ""), "workbook");
    const named = (0, xml_1.children)((0, xml_1.child)(workbook, "sheets"), "sheet").map((sheet) => (0, xml_1.attr)(sheet, "name") ?? "");
    const paths = [...archive.files.keys()]
        .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path))
        .sort((a, b) => sheetNumber(a) - sheetNumber(b));
    return paths.map((path, index) => sheetFrom(archive, path, named[index] || `Sheet${index + 1}`, shared, bold));
}
function sheetFrom(archive, path, name, shared, bold) {
    const root = (0, xml_1.child)((0, xml_1.parseXml)(archive.getText(path) ?? ""), "worksheet");
    const cells = [];
    for (const row of (0, xml_1.children)((0, xml_1.child)(root, "sheetData"), "row")) {
        for (const cell of (0, xml_1.children)(row, "c")) {
            const ref = (0, xml_1.attr)(cell, "r") ?? "";
            const where = cellRef(ref);
            if (!where)
                continue;
            const formulaNode = (0, xml_1.child)(cell, "f");
            const formulaText = formulaNode?.text?.trim() ?? "";
            const cached = cellValue(cell, (0, xml_1.attr)(cell, "t") ?? "", shared);
            if (!formulaText && !cached)
                continue;
            const style = Number((0, xml_1.attr)(cell, "s"));
            const item = {
                // Formula cells keep the expression for the formula bar; the grid shows the cache until recalculate.
                value: formulaText ? cached || `=${formulaText}` : cached,
            };
            if (formulaText)
                item.formula = formulaText.replace(/^\=/, "");
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
        return textOf((0, xml_1.child)(cell, "is"));
    const raw = (0, xml_1.child)(cell, "v")?.text ?? "";
    if (type === "s")
        return shared[Number(raw)] ?? "";
    if (type === "b")
        return raw === "1" ? "TRUE" : "FALSE";
    return raw;
}
function sharedStrings(archive) {
    const root = (0, xml_1.child)((0, xml_1.parseXml)(archive.getText("xl/sharedStrings.xml") ?? ""), "sst");
    return (0, xml_1.children)(root, "si").map(textOf);
}
function textOf(node) {
    if (!node)
        return "";
    const direct = node.children.filter((item) => item.name === "t").map((item) => item.text).join("");
    if (direct)
        return direct;
    return node.children.filter((item) => item.name === "r").map((run) => (0, xml_1.child)(run, "t")?.text ?? "").join("");
}
function boldStyles(archive) {
    const root = (0, xml_1.child)((0, xml_1.parseXml)(archive.getText("xl/styles.xml") ?? ""), "styleSheet");
    const fonts = (0, xml_1.children)((0, xml_1.child)(root, "fonts"), "font").map((font) => font.children.some((item) => item.name === "b"));
    const bold = new Set();
    (0, xml_1.children)((0, xml_1.child)(root, "cellXfs"), "xf").forEach((item, index) => {
        const font = Number((0, xml_1.attr)(item, "fontId"));
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
