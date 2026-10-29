"use strict";
// 降级才走这里。Office 读包里的文字，纯文本直接解码，PDF 只取文字层。图像没有可抽的文字。
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceFileError = void 0;
exports.extractSourceText = extractSourceText;
const fflate_1 = require("fflate");
const kinds_1 = require("./kinds");
class SourceFileError extends Error {
    constructor(message) {
        super(message);
        this.name = "SourceFileError";
    }
}
exports.SourceFileError = SourceFileError;
function extractSourceText(file) {
    const kind = (0, kinds_1.classifySourceFile)(file.name, file.mediaType);
    if (file.bytes.byteLength === 0) {
        throw new SourceFileError(`${file.name} 是空的`);
    }
    let text = "";
    try {
        if (kind === "docx")
            text = extractDocx(file.bytes);
        else if (kind === "xlsx")
            text = extractXlsx(file.bytes);
        else if (kind === "pdf")
            text = extractPdf(file.bytes);
        else if (kind === "text")
            text = extractPlain(file.bytes);
        else if (kind === "document")
            text = extractDocument(file);
        else
            throw new SourceFileError(`${file.name} 打不开`);
    }
    catch (e) {
        if (e instanceof SourceFileError && e.message.includes(file.name))
            throw e;
        throw new SourceFileError(`${file.name} 打不开`);
    }
    const trimmed = text.replace(/\n{3,}/g, "\n\n").trim();
    if (!trimmed)
        throw new SourceFileError(`${file.name} 里没有可读文字`);
    return trimmed;
}
function extractPlain(bytes) {
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(bytes);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(bytes);
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const bad = text.split("\uFFFD").length - 1;
    if (bad > 0 && bad / Math.max(text.length, 1) > 0.02)
        throw new SourceFileError("text");
    if (text.startsWith("{\\rtf"))
        return stripRtf(text);
    return text;
}
function stripRtf(raw) {
    return raw
        .replace(/\\'[0-9a-fA-F]{2}/g, (hex) => String.fromCharCode(Number.parseInt(hex.slice(2), 16)))
        .replace(/\\par[d]?/g, "\n")
        .replace(/\\[a-z]+-?\d* ?/gi, "")
        .replace(/[{}]/g, "");
}
function extractDocument(file) {
    const ext = file.name.trim().toLowerCase().split(".").pop() ?? "";
    if (ext === "pptx" || file.mediaType.includes("presentationml"))
        return extractPptx(file.bytes);
    throw new SourceFileError(`${file.name} 打不开`);
}
function extractPptx(bytes) {
    const names = zipNames(bytes)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (names.length === 0)
        throw new SourceFileError("pptx");
    const slides = [];
    for (const name of names) {
        const xml = zipText(bytes, name);
        if (!xml)
            continue;
        const line = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1] ?? "")).join("");
        if (line.trim())
            slides.push(line.trim());
    }
    return slides.join("\n\n");
}
function extractDocx(bytes) {
    const xml = zipText(bytes, "word/document.xml");
    if (!xml)
        throw new SourceFileError("docx");
    const paras = xml.split(/<w:p[ >]/);
    const lines = [];
    for (const para of paras) {
        const bits = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => decodeXml(m[1] ?? ""));
        const line = bits.join("").trim();
        if (line)
            lines.push(line);
    }
    return lines.join("\n");
}
function extractXlsx(bytes) {
    const shared = parseSharedStrings(zipText(bytes, "xl/sharedStrings.xml") ?? "");
    const names = zipNames(bytes).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n));
    if (names.length === 0)
        throw new SourceFileError("xlsx");
    const sheets = [];
    for (const name of names) {
        const xml = zipText(bytes, name);
        if (!xml)
            continue;
        const rows = new Map();
        for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
            const attrs = cell[1] ?? "";
            const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
            const row = ref ? Number(ref[2]) : rows.size + 1;
            const col = ref ? ref[1] : "";
            const body = cell[2] ?? "";
            const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
            let value = "";
            if (type === "s") {
                const idx = Number(/<v>(\d+)<\/v>/.exec(body)?.[1] ?? "");
                value = shared[idx] ?? "";
            }
            else if (type === "inlineStr") {
                value = [...body.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => decodeXml(m[1] ?? "")).join("");
            }
            else {
                value = /<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "";
            }
            const list = rows.get(row) ?? [];
            list.push(col ? `${col}:${value}` : value);
            rows.set(row, list);
        }
        const body = [...rows.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, cells]) => cells.join("\t"))
            .join("\n");
        if (body.trim())
            sheets.push(body);
    }
    return sheets.join("\n\n");
}
function parseSharedStrings(xml) {
    if (!xml)
        return [];
    return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => [...(m[1] ?? "").matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => decodeXml(t[1] ?? "")).join(""));
}
function extractPdf(bytes) {
    const raw = new TextDecoder("latin1").decode(bytes);
    if (!raw.startsWith("%PDF"))
        throw new SourceFileError("pdf");
    const parts = [];
    for (const match of raw.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
        parts.push(unescapePdf(match[0].replace(/\)\s*Tj$/, "").slice(1)));
    }
    for (const match of raw.matchAll(/\[(.*?)\]\s*TJ/gs)) {
        const chunk = match[1] ?? "";
        for (const str of chunk.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
            parts.push(unescapePdf(str[0].slice(1, -1)));
        }
    }
    return parts.join(" ");
}
function unescapePdf(s) {
    return s.replace(/\\([nrtbf()\\])/g, (_, ch) => {
        if (ch === "n")
            return "\n";
        if (ch === "r")
            return "\r";
        if (ch === "t")
            return "\t";
        return ch;
    });
}
function zipText(bytes, path) {
    const data = (0, fflate_1.unzipSync)(bytes)[path];
    return data ? (0, fflate_1.strFromU8)(data) : undefined;
}
function zipNames(bytes) {
    return Object.keys((0, fflate_1.unzipSync)(bytes));
}
function decodeXml(s) {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}
