"use strict";
// 本地 .pptx 的打开和写回。外部 agent 不经过网关，直接对一份文件工作。
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePptxPath = resolvePptxPath;
exports.readPptxFile = readPptxFile;
exports.writePptxFile = writePptxFile;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const parser_1 = require("@sliiu/present-parser");
const serializer_1 = require("@sliiu/present-serializer");
function resolvePptxPath(filePath) {
    const abs = node_path_1.default.resolve(filePath);
    if (!abs.toLowerCase().endsWith(".pptx")) {
        throw new Error(`path must be a .pptx file: ${filePath}`);
    }
    return abs;
}
async function readPptxFile(filePath) {
    const abs = resolvePptxPath(filePath);
    const bytes = await (0, promises_1.readFile)(abs);
    const pres = await (0, parser_1.parsePptx)(bytes);
    return { path: abs, pres };
}
async function writePptxFile(filePath, pres) {
    const abs = resolvePptxPath(filePath);
    await (0, promises_1.writeFile)(abs, (0, serializer_1.writePptx)(pres));
    return abs;
}
