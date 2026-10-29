import { isCfb, listCfbStreamPaths, readCfbStreamPath } from "./cfb.js";
import { decompressVbaStream } from "./vba-decompress.js";
const RECORD_PROJECTNAME = 0x0004;
const RECORD_PROJECTCODEPAGE = 0x0003;
const RECORD_MODULENAME = 0x0019;
const RECORD_MODULENAME_UNICODE = 0x0047;
const RECORD_MODULESTREAMNAME = 0x001a;
const RECORD_MODULETYPE_STD = 0x0021;
const RECORD_MODULETYPE_DOC = 0x0022;
const RECORD_MODULEOFFSET = 0x0031;
const RECORD_PROJECTVERSION = 0x0009;
function refineModuleKind(base, name) {
    if (base === "standard")
        return "standard";
    const lower = name.toLowerCase();
    if (lower === "thispresentation" || lower === "thisworkbook" || lower.startsWith("slide")) {
        return "document";
    }
    return "class";
}
function readAnsiString(bytes) {
    let end = bytes.indexOf(0);
    if (end < 0)
        end = bytes.length;
    return new TextDecoder("latin1").decode(bytes.subarray(0, end));
}
function readUtf16Le(bytes) {
    const even = bytes.length & ~1;
    let s = "";
    for (let i = 0; i < even; i += 2) {
        const c = bytes[i] | (bytes[i + 1] << 8);
        if (c === 0)
            break;
        s += String.fromCharCode(c);
    }
    return s;
}
function parseDirStream(data) {
    const modules = [];
    let projectName;
    let codepage = 1252;
    let pos = 0;
    let currentName;
    let currentStream;
    let currentKind = "standard";
    let currentSourceOffset;
    let inModule = false;
    const flushModule = () => {
        if (!inModule || !currentName || !currentStream)
            return;
        modules.push({
            name: currentName,
            streamName: currentStream,
            kind: refineModuleKind(currentKind, currentName),
            sourceOffset: currentSourceOffset,
        });
        currentName = undefined;
        currentStream = undefined;
        currentKind = "standard";
        currentSourceOffset = undefined;
        inModule = false;
    };
    while (pos + 6 <= data.length) {
        const recordId = data[pos] | (data[pos + 1] << 8);
        if (recordId === RECORD_PROJECTVERSION) {
            pos += 6 + 6;
            continue;
        }
        const recordSize = (data[pos + 2] |
            (data[pos + 3] << 8) |
            (data[pos + 4] << 16) |
            (data[pos + 5] << 24)) >>>
            0;
        pos += 6;
        if (pos + recordSize > data.length)
            break;
        const recordData = data.subarray(pos, pos + recordSize);
        switch (recordId) {
            case RECORD_PROJECTNAME:
                projectName = readAnsiString(recordData);
                break;
            case RECORD_PROJECTCODEPAGE:
                if (recordSize >= 2)
                    codepage = recordData[0] | (recordData[1] << 8);
                break;
            case RECORD_MODULENAME:
                if (inModule)
                    flushModule();
                inModule = true;
                currentName = readAnsiString(recordData);
                currentStream = undefined;
                currentKind = "standard";
                break;
            case RECORD_MODULENAME_UNICODE:
                if (recordSize >= 2) {
                    const name = readUtf16Le(recordData);
                    if (name)
                        currentName = name;
                }
                break;
            case RECORD_MODULESTREAMNAME:
                currentStream = readAnsiString(recordData);
                if (pos + recordSize + 6 <= data.length) {
                    const nextId = data[pos + recordSize] | (data[pos + recordSize + 1] << 8);
                    if (nextId === 0x0032) {
                        const nextSize = (data[pos + recordSize + 2] |
                            (data[pos + recordSize + 3] << 8) |
                            (data[pos + recordSize + 4] << 16) |
                            (data[pos + recordSize + 5] << 24)) >>>
                            0;
                        pos += recordSize + 6 + nextSize;
                        continue;
                    }
                }
                break;
            case RECORD_MODULETYPE_STD:
                currentKind = "standard";
                break;
            case RECORD_MODULETYPE_DOC:
                currentKind = "class";
                break;
            case RECORD_MODULEOFFSET:
                if (recordSize >= 4) {
                    currentSourceOffset =
                        (recordData[0] |
                            (recordData[1] << 8) |
                            (recordData[2] << 16) |
                            (recordData[3] << 24)) >>>
                            0;
                }
                break;
            default:
                break;
        }
        pos += recordSize;
    }
    if (inModule && currentName && currentStream) {
        modules.push({
            name: currentName,
            streamName: currentStream,
            kind: refineModuleKind(currentKind, currentName),
            sourceOffset: currentSourceOffset,
        });
    }
    return { projectName, codepage, modules };
}
function codepageToDecoderLabel(codepage) {
    if (codepage === 1200)
        return "utf-16le";
    if (codepage === 65001)
        return "utf-8";
    return `windows-${codepage}`;
}
function decodeVbaSourceBytes(bytes, codepage) {
    const labels = [codepageToDecoderLabel(codepage), "windows-1252", "latin1"];
    for (const label of labels) {
        try {
            return new TextDecoder(label).decode(bytes);
        }
        catch {
            // try next label
        }
    }
    return new TextDecoder("latin1").decode(bytes);
}
function findModuleStreamPath(paths, streamName) {
    const want = streamName.toLowerCase();
    for (const p of paths) {
        const norm = p.replace(/\\/g, "/");
        const base = norm.split("/").pop()?.toLowerCase();
        if (base === want)
            return norm;
    }
    return undefined;
}
/**
 * Decompress and decode VBA module source from `ppt/vbaProject.bin` bytes.
 * Does not execute macros.
 */
export function readVbaModuleSource(projectBytes, module, codepage = 1252) {
    if (!isCfb(projectBytes) || !module.streamName)
        return null;
    const paths = listCfbStreamPaths(projectBytes);
    const streamPath = findModuleStreamPath(paths, module.streamName);
    if (!streamPath)
        return null;
    const raw = readCfbStreamPath(projectBytes, streamPath);
    if (!raw?.length)
        return null;
    let offset = module.sourceOffset;
    if (offset == null || offset >= raw.length) {
        const sig = raw.indexOf(0x01);
        if (sig < 0)
            return null;
        offset = sig;
    }
    const compressed = raw.subarray(offset);
    const decompressed = decompressVbaStream(compressed);
    if (!decompressed?.length)
        return null;
    return decodeVbaSourceBytes(decompressed, codepage).replace(/\r\n/g, "\n");
}
/** List Sub/Function/Property procedure names from decompressed module source. */
export function parseVbaModuleProcedures(source) {
    const names = [];
    const seen = new Set();
    for (const line of source.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:(?:Public|Private|Friend)\s+)?(?:Static\s+)?(?:Sub|Function|Property\s+(?:Get|Let|Set))\s+([A-Za-z_][\w]*)/i);
        if (!m?.[1])
            continue;
        const key = m[1].toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        names.push(m[1]);
    }
    return names;
}
/** Wrap module source as a `.bas`-style export with VB_Name attribute when missing. */
export function formatVbaBasExport(moduleName, source) {
    if (/Attribute\s+VB_Name\s*=/i.test(source))
        return source.replace(/\r?\n/g, "\r\n");
    const body = source.replace(/\r?\n/g, "\r\n");
    return `Attribute VB_Name = "${moduleName}"\r\n${body}`;
}
/** List Sub/Function/Property names per module (read-only, no macro execution). */
export function indexVbaProceduresInProject(projectBytes, modules, codepage = 1252) {
    const out = [];
    for (const m of modules) {
        const source = readVbaModuleSource(projectBytes, { name: m.name, streamName: m.streamName }, codepage);
        out.push({
            moduleName: m.name,
            streamName: m.streamName,
            procedures: source ? parseVbaModuleProcedures(source) : [],
        });
    }
    return out;
}
/** Search Sub/Function/Property names across decompressed module sources. */
export function searchVbaProceduresInProject(projectBytes, modules, query, codepage = 1252) {
    const q = query.trim().toLowerCase();
    if (!q)
        return [];
    const hits = [];
    for (const m of modules) {
        const source = readVbaModuleSource(projectBytes, { name: m.name, streamName: m.streamName }, codepage);
        if (!source)
            continue;
        for (const procedure of parseVbaModuleProcedures(source)) {
            if (procedure.toLowerCase().includes(q)) {
                hits.push({ moduleName: m.name, streamName: m.streamName, procedure });
            }
        }
    }
    return hits;
}
/** Concatenate all modules as `.bas` blocks (read-only export). */
export function exportAllVbaModulesBas(projectBytes, modules, codepage = 1252) {
    const parts = [];
    for (const m of modules) {
        const source = readVbaModuleSource(projectBytes, { name: m.name, streamName: m.streamName }, codepage);
        if (!source?.trim())
            continue;
        parts.push(formatVbaBasExport(m.name, source));
    }
    return parts.join("\r\n\r\n' ---\r\n\r\n");
}
function findDirStreamPath(paths) {
    for (const p of paths) {
        const norm = p.replace(/\\/g, "/");
        if (/\/dir$/i.test(norm))
            return norm;
    }
    return paths.find((p) => p.toLowerCase() === "dir");
}
/**
 * Parse VBA project metadata from `ppt/vbaProject.bin` bytes.
 * Does not execute macros or extract source code.
 */
export function parseVbaProjectMetadata(bytes) {
    const meta = {
        byteSize: bytes.length,
        modules: [],
        warnings: [],
    };
    if (!isCfb(bytes)) {
        meta.warnings.push("not_a_compound_file");
        return meta;
    }
    const paths = listCfbStreamPaths(bytes);
    const dirPath = findDirStreamPath(paths);
    if (!dirPath) {
        meta.warnings.push("dir_stream_missing");
        return meta;
    }
    const dirCompressed = readCfbStreamPath(bytes, dirPath);
    if (!dirCompressed?.length) {
        meta.warnings.push("dir_stream_empty");
        return meta;
    }
    const dir = decompressVbaStream(dirCompressed);
    if (!dir?.length) {
        meta.warnings.push("dir_decompress_failed");
        return meta;
    }
    const parsed = parseDirStream(dir);
    meta.projectName = parsed.projectName;
    meta.codepage = parsed.codepage;
    meta.modules = parsed.modules.map(({ name, streamName, kind }) => ({
        name,
        streamName,
        kind,
    }));
    if (!meta.modules.length)
        meta.warnings.push("no_modules_found");
    return meta;
}
